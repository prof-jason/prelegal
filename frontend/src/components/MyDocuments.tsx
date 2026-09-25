"use client";

import { useState } from "react";
import {
  ChatApiError,
  deleteSavedDocument,
  fetchDocuments,
  fetchSavedDocument,
  fetchSavedDocuments,
  type SavedDocument,
  type SavedDocumentSummary,
} from "@/lib/api";
import { useRetryableFetch } from "@/lib/hooks";
import styles from "./MyDocuments.module.css";
import workspace from "./Workspace.module.css";

type Props = {
  onOpen: (document: SavedDocument) => void;
  onNew: () => void;
};

/** SQLite's "YYYY-MM-DD HH:MM:SS" (UTC) as a short local date and time. */
export const formatSavedAt = (sqliteUtc: string): string =>
  new Date(`${sqliteUtc.replace(" ", "T")}Z`).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const errorMessage = (e: unknown) => (e instanceof ChatApiError ? e.message : "Something went wrong. Please try again.");

/** Every document the user has drafted, most recently edited first: reopen one to keep editing, or delete it. */
export default function MyDocuments({ onOpen, onNew }: Props) {
  const { data, error: loadError, retry } = useRetryableFetch(async () => {
    const [saved, catalog] = await Promise.all([fetchSavedDocuments(), fetchDocuments()]);
    return { saved, names: new Map(catalog.map((d) => [d.id, d.name])) };
  });
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const open = async (doc: SavedDocumentSummary) => {
    setBusyId(doc.id);
    setActionError(null);
    try {
      onOpen(await fetchSavedDocument(doc.id));
    } catch (e) {
      setActionError(`Couldn't open "${doc.title}": ${errorMessage(e)}`);
      setBusyId(null);
    }
  };

  const remove = async (doc: SavedDocumentSummary) => {
    setBusyId(doc.id);
    setActionError(null);
    try {
      await deleteSavedDocument(doc.id);
      setDeleted((prev) => new Set(prev).add(doc.id));
    } catch (e) {
      setActionError(`Couldn't delete "${doc.title}": ${errorMessage(e)}`);
    } finally {
      setConfirming(null);
      setBusyId(null);
    }
  };

  const documents = data?.saved.filter((d) => !deleted.has(d.id));
  const typeName = (doc: SavedDocumentSummary) => data?.names.get(doc.documentId) ?? doc.documentId;

  return (
    <main className={workspace.main}>
      <header className={workspace.header}>
        <div>
          <h1>My documents</h1>
          <p>Your drafts are saved automatically. Open one to pick up where you left off.</p>
        </div>
        <div className={workspace.actions}>
          <button type="button" onClick={onNew}>
            New document
          </button>
        </div>
      </header>

      {loadError && (
        <div role="alert" className={workspace.error}>
          Couldn&apos;t load your documents: {loadError}{" "}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      )}
      {actionError && (
        <p role="alert" className={workspace.error}>
          {actionError}
        </p>
      )}
      {!data && !loadError && <p role="status">Loading your documents…</p>}

      {documents?.length === 0 && (
        <div className={styles.empty}>
          <h2>No documents yet</h2>
          <p>Start a new document and it will appear here as you work on it.</p>
          <button type="button" className={styles.primary} onClick={onNew}>
            Start a document
          </button>
        </div>
      )}

      {documents && documents.length > 0 && (
        <ul className={styles.list} aria-label="Saved documents">
          {documents.map((doc) => (
            <li key={doc.id} className={styles.row}>
              <button
                type="button"
                className={styles.open}
                onClick={() => open(doc)}
                disabled={busyId !== null}
                aria-busy={busyId === doc.id}
              >
                <span className={styles.title}>{doc.title}</span>
                <span className={styles.meta}>
                  {typeName(doc)} · Edited {formatSavedAt(doc.updatedAt)}
                </span>
              </button>
              {confirming === doc.id ? (
                <span className={styles.confirm}>
                  Delete this draft?
                  <button type="button" className={styles.danger} onClick={() => remove(doc)} disabled={busyId !== null}>
                    Delete
                  </button>
                  <button type="button" className={styles.ghost} onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => setConfirming(doc.id)}
                  disabled={busyId !== null}
                  aria-label={`Delete ${doc.title}`}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
