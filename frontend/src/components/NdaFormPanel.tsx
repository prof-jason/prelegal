import type { ReactNode } from "react";
import type { NdaForm, Party } from "@/lib/nda";
import styles from "./NdaFormPanel.module.css";

type Props = { form: NdaForm; onChange: (f: NdaForm) => void };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {children}
    </label>
  );
}

const partyFields: { key: keyof Party; label: string; type?: string }[] = [
  { key: "name", label: "Print name" },
  { key: "title", label: "Title" },
  { key: "company", label: "Company" },
  { key: "address", label: "Notice address (email or postal)" },
  { key: "date", label: "Signing date", type: "date" },
];

export default function NdaFormPanel({ form, onChange }: Props) {
  const set = <K extends keyof NdaForm>(k: K, v: NdaForm[K]) => onChange({ ...form, [k]: v });
  const setParty = (which: "party1" | "party2", k: keyof Party, v: string) =>
    onChange({ ...form, [which]: { ...form[which], [k]: v } });

  return (
    <form className={styles.form} aria-label="Mutual NDA details" onSubmit={(e) => e.preventDefault()}>
      <fieldset>
        <legend>Agreement terms</legend>
        <Field label="Purpose — how Confidential Information may be used">
          <textarea rows={3} value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
        </Field>
        <Field label="Effective date">
          <input type="date" value={form.effectiveDate ?? ""} onChange={(e) => set("effectiveDate", e.target.value)} />
        </Field>

        <div className={styles.group}>
          <span>MNDA term</span>
          <label className={styles.radio}>
            <input type="radio" checked={form.termType === "expires"} onChange={() => set("termType", "expires")} />
            Expires after
            <input
              className={styles.num}
              type="number"
              min={1}
              aria-label="MNDA term in years"
              value={form.termYears}
              disabled={form.termType !== "expires"}
              onChange={(e) => set("termYears", e.target.value)}
            />
            year(s)
          </label>
          <label className={styles.radio}>
            <input type="radio" checked={form.termType === "continues"} onChange={() => set("termType", "continues")} />
            Continues until terminated
          </label>
        </div>

        <div className={styles.group}>
          <span>Term of confidentiality</span>
          <label className={styles.radio}>
            <input
              type="radio"
              checked={form.confidentialityType === "years"}
              onChange={() => set("confidentialityType", "years")}
            />
            Protected for
            <input
              className={styles.num}
              type="number"
              min={1}
              aria-label="Term of confidentiality in years"
              value={form.confidentialityYears}
              disabled={form.confidentialityType !== "years"}
              onChange={(e) => set("confidentialityYears", e.target.value)}
            />
            year(s)
          </label>
          <label className={styles.radio}>
            <input
              type="radio"
              checked={form.confidentialityType === "perpetuity"}
              onChange={() => set("confidentialityType", "perpetuity")}
            />
            In perpetuity
          </label>
        </div>

        <Field label="Governing law (state)">
          <input value={form.governingLaw} placeholder="e.g. Delaware" onChange={(e) => set("governingLaw", e.target.value)} />
        </Field>
        <Field label="Jurisdiction (city or county and state)">
          <input
            value={form.jurisdiction}
            placeholder="e.g. New Castle, DE"
            onChange={(e) => set("jurisdiction", e.target.value)}
          />
        </Field>
        <Field label="MNDA modifications (optional)">
          <textarea rows={3} value={form.modifications} onChange={(e) => set("modifications", e.target.value)} />
        </Field>
      </fieldset>

      {(["party1", "party2"] as const).map((p, i) => (
        <fieldset key={p}>
          <legend>Party {i + 1}</legend>
          {partyFields.map((f) => (
            <Field key={f.key} label={f.label}>
              <input type={f.type ?? "text"} value={form[p][f.key]} onChange={(e) => setParty(p, f.key, e.target.value)} />
            </Field>
          ))}
        </fieldset>
      ))}
    </form>
  );
}
