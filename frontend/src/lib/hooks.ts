"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatApiError } from "@/lib/api";

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
