import {
  type NdaForm,
  type Party,
  standardTerms,
  refValue,
  formatDate,
  termText,
  confidentialityText,
} from "@/lib/nda";
import styles from "./Document.module.css";

const partyRows: { label: string; get: (p: Party) => string }[] = [
  { label: "Signature", get: () => "" },
  { label: "Print Name", get: (p) => p.name },
  { label: "Title", get: (p) => p.title },
  { label: "Company", get: (p) => p.company },
  { label: "Notice Address", get: (p) => p.address },
  { label: "Date", get: (p) => formatDate(p.date) },
];

export default function NdaDocument({ form }: { form: NdaForm }) {
  return (
    <article id="nda-document" className={styles.doc} aria-label="Mutual Non-Disclosure Agreement">
      <h2 className={styles.title}>Mutual Non-Disclosure Agreement</h2>

      <h3 className={styles.kicker}>Using this Mutual Non-Disclosure Agreement</h3>
      <p>
        This Mutual Non-Disclosure Agreement (the “MNDA”) consists of: (1) this Cover Page (“<b>Cover Page</b>”) and
        (2) the Common Paper Mutual NDA Standard Terms Version 1.0 (“<b>Standard Terms</b>”) identical to those posted
        at{" "}
        <a href="https://commonpaper.com/standards/mutual-nda/1.0">commonpaper.com/standards/mutual-nda/1.0</a>. Any
        modifications of the Standard Terms should be made on the Cover Page, which will control over conflicts with
        the Standard Terms.
      </p>

      <h4>Purpose</h4>
      <p className={styles.hint}>How Confidential Information may be used</p>
      <p>{form.purpose || "—"}</p>

      <h4>Effective Date</h4>
      <p>{formatDate(form.effectiveDate) || "—"}</p>

      <h4>MNDA Term</h4>
      <p className={styles.hint}>The length of this MNDA</p>
      <p>{termText(form)}</p>

      <h4>Term of Confidentiality</h4>
      <p className={styles.hint}>How long Confidential Information is protected</p>
      <p>{confidentialityText(form)}</p>

      <h4>Governing Law &amp; Jurisdiction</h4>
      <p>Governing Law: {form.governingLaw || "—"}</p>
      <p>Jurisdiction: {form.jurisdiction || "—"}</p>

      <h4>MNDA Modifications</h4>
      <p>{form.modifications || "None."}</p>

      <p>By signing this Cover Page, each party agrees to enter into this MNDA as of the Effective Date.</p>

      <table className={styles.sig}>
        <thead>
          <tr>
            <th />
            <th>Party 1</th>
            <th>Party 2</th>
          </tr>
        </thead>
        <tbody>
          {partyRows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              <td>{r.get(form.party1)}</td>
              <td>{r.get(form.party2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className={styles.attribution}>
        Common Paper Mutual Non-Disclosure Agreement (Version 1.0) free to use under{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
      </p>

      <h2 className={`${styles.title} ${styles.pageBreak}`}>Standard Terms</h2>
      <ol>
        {standardTerms.map((c) => (
          <li key={c.title}>
            <b>{c.title}</b>.{" "}
            {c.body.map((s, i) =>
              typeof s === "string" ? s : <u key={i}>{refValue(form, s.ref)}</u>,
            )}
          </li>
        ))}
      </ol>

      <p className={styles.attribution}>
        Common Paper Mutual Non-Disclosure Agreement{" "}
        <a href="https://commonpaper.com/standards/mutual-nda/1.0/">Version 1.0</a> free to use under{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
      </p>
    </article>
  );
}
