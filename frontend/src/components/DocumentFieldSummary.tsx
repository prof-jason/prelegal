import { groupTerms, type DocumentDetail, type DocumentField, type FieldValues } from "@/lib/document";
import styles from "./FieldSummary.module.css";

type Props = {
  detail: DocumentDetail;
  values: FieldValues;
  onChange: (values: FieldValues) => void;
  /** Field keys the AI chat just set, so the matching row can briefly highlight. */
  highlightedFields?: ReadonlySet<string>;
};

/** Every field of a template-driven document as a directly editable form,
 * grouped like its cover page -- the "editable summary" beside the chat. */
export default function DocumentFieldSummary({ detail, values, onChange, highlightedFields }: Props) {
  const field = (f: DocumentField) => (
    <label key={f.key} className={styles.field} data-updated={highlightedFields?.has(f.key) || undefined}>
      <span>{f.label}</span>
      <input
        type={f.type === "date" ? "date" : "text"}
        value={values[f.key] ?? ""}
        title={f.hint}
        onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
      />
    </label>
  );

  return (
    <form className={styles.form} aria-label={`${detail.name} details`} onSubmit={(e) => e.preventDefault()}>
      <p className={styles.intro}>
        Here&apos;s what we have so far. Chat to fill this in, or edit any field directly.
      </p>
      {detail.parties.map((p) => (
        <fieldset key={p.role}>
          <legend>{p.role}</legend>
          {p.fields.map(field)}
        </fieldset>
      ))}
      {groupTerms(detail).map(([group, fields]) => (
        <fieldset key={group}>
          <legend>{group}</legend>
          {fields.map(field)}
        </fieldset>
      ))}
    </form>
  );
}
