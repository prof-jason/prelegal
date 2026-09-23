import type { ReactNode } from "react";
import { MAX_YEARS, type NdaForm, type Party } from "@/lib/nda";
import styles from "./FieldSummary.module.css";

type Props = {
  form: NdaForm;
  onChange: (f: NdaForm) => void;
  /** Dotted field paths (e.g. "governingLaw", "party1.name") the AI chat
   * just set, so the matching row can briefly highlight. Transient --
   * callers are expected to clear this a couple seconds after setting it. */
  highlightedFields?: ReadonlySet<string>;
};

function Field({
  label,
  highlighted,
  children,
}: {
  label: string;
  highlighted?: boolean;
  children: ReactNode;
}) {
  return (
    <label className={styles.field} data-updated={highlighted || undefined}>
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

export default function NdaFieldSummary({ form, onChange, highlightedFields }: Props) {
  const isHighlighted = (path: string) => highlightedFields?.has(path) ?? false;
  const set = <K extends keyof NdaForm>(k: K, v: NdaForm[K]) => onChange({ ...form, [k]: v });
  const setParty = (which: "party1" | "party2", k: keyof Party, v: string) =>
    onChange({ ...form, [which]: { ...form[which], [k]: v } });

  return (
    <form
      className={styles.form}
      aria-label="Mutual NDA details"
      onSubmit={(e) => e.preventDefault()}
    >
      <p className={styles.intro}>
        Here&apos;s what we have so far. Chat to fill this in, or edit any field directly.
      </p>

      <fieldset>
        <legend>Required</legend>
        <Field label="Governing law (state name only)" highlighted={isHighlighted("governingLaw")}>
          <input value={form.governingLaw} placeholder="e.g. Delaware" onChange={(e) => set("governingLaw", e.target.value)} />
        </Field>
        <Field label="Jurisdiction (city or county and state)" highlighted={isHighlighted("jurisdiction")}>
          <input
            value={form.jurisdiction}
            placeholder="e.g. New Castle, DE"
            onChange={(e) => set("jurisdiction", e.target.value)}
          />
        </Field>
      </fieldset>

      <fieldset>
        <legend>Agreement terms</legend>
        <Field label="Purpose — how Confidential Information may be used" highlighted={isHighlighted("purpose")}>
          <textarea rows={3} value={form.purpose} onChange={(e) => set("purpose", e.target.value)} />
        </Field>
        <Field label="Effective date" highlighted={isHighlighted("effectiveDate")}>
          <input type="date" value={form.effectiveDate ?? ""} onChange={(e) => set("effectiveDate", e.target.value)} />
        </Field>

        <fieldset className={styles.group} data-updated={isHighlighted("termType") || isHighlighted("termYears") || undefined}>
          <legend>MNDA term</legend>
          <label className={styles.radio}>
            <input type="radio" name="termType" checked={form.termType === "expires"} onChange={() => set("termType", "expires")} />
            Expires after
            <input
              className={styles.num}
              type="number"
              min={1}
              max={MAX_YEARS}
              aria-label="MNDA term in years"
              value={form.termYears}
              disabled={form.termType !== "expires"}
              onChange={(e) => set("termYears", e.target.value)}
            />
            year(s)
          </label>
          <label className={styles.radio}>
            <input type="radio" name="termType" checked={form.termType === "continues"} onChange={() => set("termType", "continues")} />
            Continues until terminated
          </label>
        </fieldset>

        <fieldset
          className={styles.group}
          data-updated={isHighlighted("confidentialityType") || isHighlighted("confidentialityYears") || undefined}
        >
          <legend>Term of confidentiality</legend>
          <label className={styles.radio}>
            <input
              type="radio"
              name="confidentialityType"
              checked={form.confidentialityType === "years"}
              onChange={() => set("confidentialityType", "years")}
            />
            Protected for
            <input
              className={styles.num}
              type="number"
              min={1}
              max={MAX_YEARS}
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
              name="confidentialityType"
              checked={form.confidentialityType === "perpetuity"}
              onChange={() => set("confidentialityType", "perpetuity")}
            />
            In perpetuity
          </label>
        </fieldset>

        <Field label="MNDA modifications (optional)" highlighted={isHighlighted("modifications")}>
          <textarea rows={3} value={form.modifications} onChange={(e) => set("modifications", e.target.value)} />
        </Field>
      </fieldset>

      {(["party1", "party2"] as const).map((p, i) => (
        <fieldset key={p}>
          <legend>Party {i + 1}</legend>
          {partyFields.map((f) => (
            <Field key={f.key} label={f.label} highlighted={isHighlighted(`${p}.${f.key}`)}>
              <input type={f.type ?? "text"} value={form[p][f.key]} onChange={(e) => setParty(p, f.key, e.target.value)} />
            </Field>
          ))}
        </fieldset>
      ))}
    </form>
  );
}
