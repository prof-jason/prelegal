"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatApiError, saveDocument, type SavedDocumentContent } from "@/lib/api";

/** How long a field stays visually highlighted after the AI chat sets it. */
const HIGHLIGHT_MS = 2500;

/** Fields the AI chat just set, highlighted briefly then cleared. */
export function useFieldHighlight(): { highlighted: ReadonlySet<string>; flash: (names: string[]) => void } {
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = useCallback((names: string[]) => {
    setHighlighted(new Set(names));
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHighlighted(new Set()), HIGHLIGHT_MS);
  }, []);
  return { highlighted, flash };
}

/** Builds a PDF on demand and saves it as `filename`, with busy/error state for the button. */
export function usePdfDownload(build: () => Promise<Blob>, filename: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const url = URL.createObjectURL(await build());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a); // some browsers ignore clicks on detached anchors
      a.click();
      a.remove();
      // Revoking immediately can cancel the download in Safari/Firefox.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error(e);
      setError("Sorry, the PDF could not be generated. Please try again.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, download };
}

/** Loads data once (and again on retry), ignoring responses that arrive after unmount. */
export function useRetryableFetch<T>(fetcher: () => Promise<T>): {
  data: T | null;
  error: string | null;
  retry: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The fetcher is typically an inline closure; only an explicit retry should refetch.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;
    fetcherRef.current().then(
      (result) => !cancelled && setData(result),
      (e) => !cancelled && setError(e instanceof ChatApiError ? e.message : "Something went wrong. Please try again."),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);
  return { data, error, retry };
}

/** How long edits settle before an autosave. */
export const AUTOSAVE_MS = 800;

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Autosaves a document (debounced) whenever its content changes, and once
 * more on unmount if a change is still pending -- e.g. the user navigates
 * away mid-debounce.
 *
 * Nothing is saved until the first change after mount, so merely opening a
 * document doesn't create one. A new document gets a client-generated id on
 * its first save; every save is then the same idempotent PUT, so saves can
 * never create duplicates. `savedId` resumes an existing document.
 */
export function useAutosave(
  content: SavedDocumentContent,
  savedId?: string,
): { status: SaveStatus; retry: () => void } {
  const snapshot = JSON.stringify(content);
  const [status, setStatus] = useState<SaveStatus>(savedId ? "saved" : "idle");
  // Bumped after each save attempt settles (or on retry) to re-check for
  // changes made while it was in flight.
  const [settled, setSettled] = useState(0);
  const id = useRef(savedId);
  const lastSaved = useRef(snapshot);
  const latest = useRef(snapshot);
  // The content being saved right now, if any.
  const inFlight = useRef<string | null>(null);
  // The content whose save last failed: not retried until it changes (or retry()).
  const failed = useRef<string | null>(null);

  const save = useCallback(async (json: string) => {
    id.current ??= crypto.randomUUID();
    inFlight.current = json;
    setStatus("saving");
    try {
      await saveDocument(id.current, JSON.parse(json));
      lastSaved.current = json;
      failed.current = null;
      setStatus("saved");
    } catch (e) {
      console.error(e);
      failed.current = json;
      setStatus("error");
    } finally {
      inFlight.current = null;
      setSettled((n) => n + 1);
    }
  }, []);

  useEffect(() => {
    latest.current = snapshot;
    // After a failure, wait for the next edit (or an explicit retry) rather than retrying in a loop.
    if (snapshot === lastSaved.current || snapshot === failed.current || inFlight.current !== null) return;
    const timer = setTimeout(() => void save(snapshot), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [snapshot, settled, save]);

  useEffect(
    () => () => {
      // Skip content that's already saved or being saved right now.
      if (latest.current !== lastSaved.current && latest.current !== inFlight.current) void save(latest.current);
    },
    [save],
  );

  const retry = useCallback(() => {
    failed.current = null;
    setSettled((n) => n + 1);
  }, []);
  return { status, retry };
}
