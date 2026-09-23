"use client";

import { useMemo, useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import DocumentFieldSummary from "@/components/DocumentFieldSummary";
import DocumentPreview from "@/components/DocumentPreview";
import { fetchDocument, sendDocumentChatMessage, type ChatTurn } from "@/lib/api";
import {
  emptyTermLabels,
  emptyValues,
  mergeUpdates,
  pdfFileName,
  summarizeList,
  unsupportedDocumentPdfChars,
  type DocumentDetail,
  type FieldValues,
} from "@/lib/document";
import { useFieldHighlight, usePdfDownload, useRetryableFetch } from "@/lib/hooks";
import { parseTemplate } from "@/lib/template";
import styles from "./Workspace.module.css";

type Props = {
  documentId: string;
  /** The document-picking conversation so far, continued in this document's chat. */
  initialTurns?: ChatTurn[];
  onChangeDocument: () => void;
};

/** Loads a template-driven document, then shows its chat, editable fields and live preview. */
export default function DocumentCreator({ documentId, initialTurns, onChangeDocument }: Props) {
  const { data: detail, error: loadError, retry } = useRetryableFetch(() => fetchDocument(documentId));

  if (!detail) {
    return (
      <main className={styles.main}>
        {loadError ? (
          <div role="alert" className={styles.error}>
            <p>Couldn&apos;t load this document: {loadError}</p>
            <button type="button" onClick={retry}>
              Retry
            </button>{" "}
            <button type="button" onClick={onChangeDocument}>
              Change document
            </button>
          </div>
        ) : (
          <p role="status">Loading document…</p>
        )}
      </main>
    );
  }
  return <LoadedDocumentCreator detail={detail} initialTurns={initialTurns} onChangeDocument={onChangeDocument} />;
}

function LoadedDocumentCreator({
  detail,
  initialTurns,
  onChangeDocument,
}: { detail: DocumentDetail } & Omit<Props, "documentId">) {
  const template = useMemo(() => parseTemplate(detail.markdown), [detail.markdown]);
  const [values, setValues] = useState<FieldValues>(() => emptyValues(detail));
  const { highlighted, flash } = useFieldHighlight();

  const [role1, role2] = detail.parties.map((p) => p.role);
  const greeting = initialTurns?.length
    ? `Let's put together your ${detail.name}. I'll use what you've told me so far — anything to add about the parties (the ${role1} and the ${role2}) or the deal?`
    : `Let's put together your ${detail.name}. To start, who are the two parties — the ${role1} and the ${role2}?`;

  const send = async (messages: ChatTurn[]) => {
    const result = await sendDocumentChatMessage(detail.id, { messages, currentFields: values });
    setValues((prev) => mergeUpdates(detail, prev, result.updates));
    flash(result.updatedFieldNames);
    return result.reply;
  };

  const empty = emptyTermLabels(detail, values);
  const badChars = unsupportedDocumentPdfChars(values);

  const { busy, error, download } = usePdfDownload(
    async () => (await import("@/lib/documentPdf")).buildDocumentPdf({ detail, template, values }),
    pdfFileName(detail.name),
  );

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>{detail.name}</h1>
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
        This tool fills in a standard template agreement (Common Paper {template.title}). It does not provide legal
        advice — have a qualified attorney review any agreement before you sign it.
      </p>
      {(empty.length > 0 || badChars.length > 0) && (
        <div role="status" className={styles.notice}>
          {empty.length > 0 && (
            <p>
              {empty.length} of {detail.terms.length} key terms {empty.length === 1 ? "is" : "are"} still empty and will
              appear as [placeholders]: {summarizeList(empty)}.
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
          <ChatPanel greeting={greeting} initialTurns={initialTurns} onSend={send} />
          <DocumentFieldSummary detail={detail} values={values} onChange={setValues} highlightedFields={highlighted} />
        </section>
        <section className={styles.previewCol} aria-label="Agreement preview">
          <DocumentPreview detail={detail} template={template} values={values} />
        </section>
      </div>
    </main>
  );
}
