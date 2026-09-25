"use client";

import { useMemo, useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import DocumentFieldSummary from "@/components/DocumentFieldSummary";
import DocumentPreview from "@/components/DocumentPreview";
import WorkspaceHeader from "@/components/WorkspaceHeader";
import { fetchDocument, sendDocumentChatMessage, type ChatTurn, type SavedFields } from "@/lib/api";
import {
  draftTitle,
  emptyTermLabels,
  emptyValues,
  mergeUpdates,
  partyLabel,
  pdfFileName,
  RESUME_GREETING,
  summarizeList,
  unsupportedDocumentPdfChars,
  type DocumentDetail,
  type FieldValues,
} from "@/lib/document";
import { useAutosave, useFieldHighlight, usePdfDownload, useRetryableFetch } from "@/lib/hooks";
import { parseTemplate } from "@/lib/template";
import styles from "./Workspace.module.css";

type Props = {
  documentId: string;
  /** The document-picking conversation so far, continued in this document's chat. */
  initialTurns?: ChatTurn[];
  /** A saved draft being reopened: autosaves continue to it. */
  saved?: { id: string; fields: SavedFields };
  onChangeDocument: () => void;
};

/** Loads a template-driven document, then shows its chat, editable fields and live preview. */
export default function DocumentCreator({ documentId, initialTurns, saved, onChangeDocument }: Props) {
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
  return (
    <LoadedDocumentCreator detail={detail} initialTurns={initialTurns} saved={saved} onChangeDocument={onChangeDocument} />
  );
}

function LoadedDocumentCreator({
  detail,
  initialTurns = [],
  saved,
  onChangeDocument,
}: { detail: DocumentDetail } & Omit<Props, "documentId">) {
  const template = useMemo(() => parseTemplate(detail.markdown), [detail.markdown]);
  const [values, setValues] = useState<FieldValues>(() => ({
    ...emptyValues(detail),
    ...(saved?.fields as FieldValues | undefined),
  }));
  const [transcript, setTranscript] = useState(initialTurns);
  const { highlighted, flash } = useFieldHighlight();
  const autosave = useAutosave(
    {
      documentId: detail.id,
      title: draftTitle(detail.name, [partyLabel(values, 0), partyLabel(values, 1)]),
      transcript,
      fields: values,
    },
    saved?.id,
  );

  const [role1, role2] = detail.parties.map((p) => p.role);
  const greeting = saved
    ? RESUME_GREETING
    : initialTurns.length
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
      <WorkspaceHeader
        title={detail.name}
        templateName={template.title}
        save={autosave}
        pdf={{ busy, download }}
        onChangeDocument={onChangeDocument}
      />
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
          <ChatPanel greeting={greeting} initialTurns={initialTurns} onSend={send} onTurnsChange={setTranscript} />
          <DocumentFieldSummary detail={detail} values={values} onChange={setValues} highlightedFields={highlighted} />
        </section>
        <section className={styles.previewCol} aria-label="Agreement preview">
          <DocumentPreview detail={detail} template={template} values={values} />
        </section>
      </div>
    </main>
  );
}
