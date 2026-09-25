"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import NdaChatPanel from "@/components/NdaChatPanel";
import NdaDocument from "@/components/NdaDocument";
import NdaFieldSummary from "@/components/NdaFieldSummary";
import WorkspaceHeader from "@/components/WorkspaceHeader";
import {
  defaultForm,
  mergeNdaFieldsPatch,
  today,
  unsupportedPdfChars,
  type NdaFieldsPatch,
  type NdaForm,
  type Party,
} from "@/lib/nda";
import type { ChatTurn, SavedFields } from "@/lib/api";
import { draftTitle, NDA_ID, RESUME_GREETING } from "@/lib/document";
import { useAutosave, useFieldHighlight, usePdfDownload } from "@/lib/hooks";
import styles from "./Workspace.module.css";

const subscribeNever = () => () => {};

type Props = {
  /** The document-picking conversation so far, continued in this document's chat. */
  initialTurns?: ChatTurn[];
  /** A saved draft being reopened: autosaves continue to it. */
  saved?: { id: string; fields: SavedFields };
  onChangeDocument: () => void;
};

const NAME = "Mutual NDA";

/** Restores a saved form over the defaults, so a draft saved before a field existed still loads. */
function restoreForm(fields: SavedFields): NdaForm {
  const base = defaultForm();
  const saved = fields as Partial<NdaForm>;
  return {
    ...base,
    ...saved,
    party1: { ...base.party1, ...saved.party1 },
    party2: { ...base.party2, ...saved.party2 },
  };
}

const partyName = (p: Party) => p.company.trim() || p.name.trim();

/** The Mutual NDA's bespoke creator: chat + editable form + live preview + PDF. */
export default function NdaCreator({ initialTurns = [], saved, onChangeDocument }: Props) {
  const [form, setForm] = useState(() => (saved ? restoreForm(saved.fields) : defaultForm()));
  const [transcript, setTranscript] = useState(initialTurns);
  // Saves the form as edited -- effectiveDate stays null ("today") until the user picks one.
  const autosave = useAutosave(
    {
      documentId: NDA_ID,
      title: draftTitle(NAME, [partyName(form.party1), partyName(form.party2)]),
      transcript,
      fields: form,
    },
    saved?.id,
  );
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
      <WorkspaceHeader
        title="Mutual NDA Creator"
        templateName="Mutual NDA v1.0"
        save={autosave}
        pdf={{ busy, download }}
        onChangeDocument={onChangeDocument}
      />
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
          <NdaChatPanel
            form={resolved}
            onApplyPatch={applyPatch}
            initialTurns={initialTurns}
            onTurnsChange={setTranscript}
            greeting={saved ? RESUME_GREETING : undefined}
          />
          <NdaFieldSummary form={resolved} onChange={setForm} highlightedFields={highlighted} />
        </section>
        <section className={styles.previewCol} aria-label="Agreement preview">
          <NdaDocument form={resolved} />
        </section>
      </div>
    </main>
  );
}
