import type { ReactNode } from "react";
import { formatDate } from "@/lib/nda";
import { groupTerms, partyValue, signatureRows, type DocumentDetail, type FieldValues } from "@/lib/document";
import { inlineText, type Inline, type Item, type ParsedTemplate } from "@/lib/template";
import styles from "./Document.module.css";

type Props = { detail: DocumentDetail; template: ParsedTemplate; values: FieldValues };

/**
 * Live preview of a template-driven document: a generated cover page (every
 * variable and its value, plus the signature block) followed by the
 * standard terms. In the terms, a variable reads as its defined term --
 * underlined once it has a value on the cover page, "[Term]" until then.
 */
export default function DocumentPreview({ detail, template, values }: Props) {
  const renderInline = (nodes: Inline[]): ReactNode[] =>
    nodes.map((n, i) => {
      switch (n.type) {
        case "text":
          return n.text;
        case "bold":
        case "heading":
          return <b key={i}>{renderInline(n.children)}</b>;
        case "link":
          return (
            <a key={i} href={n.href} target="_blank" rel="noreferrer">
              {renderInline(n.children)}
            </a>
          );
        case "field": {
          const value = values[n.key]?.trim();
          return value ? (
            <u key={i} title={value}>
              {renderInline(n.children)}
            </u>
          ) : (
            <span key={i} className={styles.placeholder}>
              [{inlineText(n.children)}]
            </span>
          );
        }
      }
    });

  const renderItems = (items: Item[]) => (
    <ol className={styles.clauses}>
      {items.map((item, i) => (
        <li key={i}>
          <span className={styles.clauseNumber}>{item.label}</span> {renderInline(item.content)}
          {item.children.length > 0 && renderItems(item.children)}
        </li>
      ))}
    </ol>
  );

  return (
    <article className={styles.doc} aria-label={detail.name}>
      <h2 className={styles.title}>{detail.name}</h2>
      <h3 className={styles.kicker}>Cover Page</h3>
      <p>
        This {detail.name} consists of this Cover Page and the Common Paper {template.title} standard terms below.
        Capitalized terms used in the standard terms have the values given on this Cover Page.
      </p>

      <h4>Parties</h4>
      {detail.parties.map((p, i) => (
        <p key={p.role}>
          {p.role}: {values[`party${i + 1}_company`] || "—"}
        </p>
      ))}

      {groupTerms(detail).map(([group, fields]) => (
        <section key={group}>
          <h4>{group}</h4>
          <dl className={styles.terms}>
            {fields.map((f) => (
              <div key={f.key}>
                <dt>{f.label}</dt>
                <dd>{(f.type === "date" ? formatDate(values[f.key]) : values[f.key]) || "—"}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <p>By signing this Cover Page, each party agrees to enter into this {detail.name}.</p>
      <table className={styles.sig}>
        <thead>
          <tr>
            <th />
            {detail.parties.map((p) => (
              <th key={p.role}>{p.role}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {signatureRows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}</th>
              {detail.parties.map((p, i) => (
                <td key={p.role}>{partyValue(values, i, r.suffix, formatDate)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className={`${styles.title} ${styles.pageBreak}`}>{template.title}</h2>
      <p className={styles.hint}>Standard Terms</p>
      {renderItems(template.items)}

      <p className={styles.attribution}>
        Based on the Common Paper {template.title} standard terms, free to use under{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
      </p>
    </article>
  );
}
