"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import NdaChatPanel from "@/components/NdaChatPanel";
import NdaDocument from "@/components/NdaDocument";
import NdaFieldSummary from "@/components/NdaFieldSummary";
import { defaultForm, mergeNdaFieldsPatch, today, unsupportedPdfChars, type NdaFieldsPatch } from "@/lib/nda";
import type { ChatTurn } from "@/lib/api";
import { useFieldHighlight, usePdfDownload } from "@/lib/hooks";
import styles from "./Workspace.module.css";

const subscribeNever = () => () => {};

type Props = {
  /** The document-picking conversation so far, continued in this document's chat. */
  initialTurns?: ChatTurn[];
  onChangeDocument: () => void;
};

/** The Mutual NDA's bespoke creator: chat + editable form + live preview + PDF. */
export default function NdaCreator({ initialTurns, onChangeDocument }: Props) {
  const [form, setForm] = useState(defaultForm);
  const { highlighted, flash } = useFieldHighlight();

  // "today" is only known on the client; the server snapshot is "" so hydration matches
  // the prerendered HTML, then React re-renders with the visitor's local date.
  const clientToday = useSyncExternalStore(subscribeNever, () => today(), () => "");
  const resolved = useMemo(
    () => (form.effectiveDate === null ? { ...form, effectiveDate: clientToday } : form),
    [form, clientToday],
  );

  const missing = [
    !resolved.governingLaw.trim() && "governing law",
    !resolved.jurisdiction.trim() && "jurisdiction",
  ].filter(Boolean);
  const badChars = unsupportedPdfChars(resolved);

  const applyPatch = (patch: NdaFieldsPatch, updatedFieldNames: string[]) => {
    setForm((prev) => mergeNdaFieldsPatch(prev, patch));
    flash(updatedFieldNames);
  };

  const { busy, error, download } = usePdfDownload(
    async () => (await import("@/lib/ndaPdf")).buildNdaPdf(resolved),
    "Mutual-NDA.pdf",
  );

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>Mutual NDA Creator</h1>
          <p>Chat with the assistant to fill in the details, or edit any field directly, and watch your agreement update live.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.secondary} onClick={onChangeDocument}>
            Change document
          </button>
          <button onClick={download} disabled={busy} aria-busy={busy}>
            {busy ? "Generating…" : "Download PDF"}
          </button>
        </div>
      </header>
      <p className={styles.disclaimer}>
        This tool fills in a standard template agreement (Common Paper Mutual NDA v1.0). It does not provide legal
        advice — have a qualified attorney review any agreement before you sign it.
      </p>
      {(missing.length > 0 || badChars.length > 0) && (
        <div role="status" className={styles.notice}>
          {missing.length > 0 && (
            <p>
              The {missing.join(" and ")} {missing.length > 1 ? "are" : "is"} still empty, so the agreement will
              contain a [placeholder] there.
            </p>
          )}
          {badChars.length > 0 && (
            <p>
              These characters may not appear correctly in the PDF: <strong>{badChars.join(" ")}</strong>
            </p>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.layout}>
        <section className={styles.formCol} aria-label="Agreement details">
          <NdaChatPanel form={resolved} onApplyPatch={applyPatch} initialTurns={initialTurns} />
          <NdaFieldSummary form={resolved} onChange={setForm} highlightedFields={highlighted} />
        </section>
        <section className={styles.previewCol} aria-label="Agreement preview">
          <NdaDocument form={resolved} />
        </section>
      </div>
    </main>
  );
}
