"use client";

import type { SaveStatus } from "@/lib/hooks";
import styles from "./Workspace.module.css";

const SAVE_LABELS: Record<SaveStatus, string> = {
  idle: "Saves automatically as you work",
  saving: "Saving…",
  saved: "All changes saved",
  error: "Couldn't save your latest changes",
};

type Props = {
  title: string;
  /** Which Common Paper standard template the document fills in. */
  templateName: string;
  save: { status: SaveStatus; retry: () => void };
  pdf: { busy: boolean; download: () => void };
  onChangeDocument: () => void;
};

/** The top of every document creator: title, save status, actions, and the draft disclaimer. */
export default function WorkspaceHeader({ title, templateName, save, pdf, onChangeDocument }: Props) {
  return (
    <>
      <header className={styles.header}>
        <div>
          <h1>{title}</h1>
          <p>Chat with the assistant to fill in the details, or edit any field directly, and watch your agreement update live.</p>
        </div>
        <div className={styles.actions}>
          <span aria-live="polite" className={styles.saveStatus} data-status={save.status}>
            {SAVE_LABELS[save.status]}
            {save.status === "error" && (
              <button type="button" className={styles.link} onClick={save.retry}>
                Retry
              </button>
            )}
          </span>
          <button type="button" className={styles.secondary} onClick={onChangeDocument}>
            Change document
          </button>
          <button type="button" onClick={pdf.download} disabled={pdf.busy} aria-busy={pdf.busy}>
            {pdf.busy ? "Generating…" : "Download PDF"}
          </button>
        </div>
      </header>
      <aside className={styles.draftBanner} aria-label="Draft disclaimer">
        <strong>Draft — subject to legal review.</strong> This document is generated from a Common Paper standard
        template ({templateName}) and is not legal advice. Have a qualified attorney review it before anyone signs.
      </aside>
    </>
  );
}
