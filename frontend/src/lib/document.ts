/** Template-driven ("generic") documents: every catalog document except the
 * Mutual NDA, which keeps its bespoke form (see lib/nda.ts). Shapes mirror
 * backend/app/schemas.py's DocumentSummary / DocumentDetail. */

import { unsupportedPdfCharsIn } from "@/lib/pdfChars";

export const NDA_ID = "mutual-nda";

export type DocumentSummary = {
  id: string;
  name: string;
  description: string;
  kind: "nda" | "generic";
};

export type DocumentField = {
  key: string;
  label: string;
  hint: string;
  type: "text" | "date";
  group: string;
};

export type PartyBlock = { role: string; fields: DocumentField[] };

export type DocumentDetail = {
  id: string;
  name: string;
  description: string;
  /** The template's own variables, in document order. */
  terms: DocumentField[];
  /** Exactly two: the signature-block fields for each party role. */
  parties: PartyBlock[];
  /** The template, with each variable span tagged data-field / data-role (see lib/template.ts). */
  markdown: string;
};

/** Field key -> value; "" (or absent) means not filled in yet. */
export type FieldValues = Record<string, string>;

export const allFields = (d: DocumentDetail): DocumentField[] => [...d.terms, ...d.parties.flatMap((p) => p.fields)];

export const emptyValues = (d: DocumentDetail): FieldValues =>
  Object.fromEntries(allFields(d).map((f) => [f.key, ""]));

/** Sparse-merges an AI chat turn's updates: only keys this document actually has are applied. */
export function mergeUpdates(d: DocumentDetail, values: FieldValues, updates: FieldValues): FieldValues {
  const known = new Set(allFields(d).map((f) => f.key));
  const next = { ...values };
  for (const [key, value] of Object.entries(updates)) if (known.has(key) && value) next[key] = value;
  return next;
}

/** Template terms grouped by their cover-page section, in first-appearance order. */
export function groupTerms(d: DocumentDetail): [group: string, fields: DocumentField[]][] {
  const groups = new Map<string, DocumentField[]>();
  for (const f of d.terms) groups.set(f.group, [...(groups.get(f.group) ?? []), f]);
  return [...groups];
}

export const emptyTermLabels = (d: DocumentDetail, values: FieldValues): string[] =>
  d.terms.filter((f) => !values[f.key]?.trim()).map((f) => f.label);

/** "A, B, C and 4 more" -- keeps the empty-terms notice short for long documents. */
export const summarizeList = (items: string[], shown = 3): string =>
  items.length > shown ? `${items.slice(0, shown).join(", ")} and ${items.length - shown} more` : items.join(", ");

export const unsupportedDocumentPdfChars = (values: FieldValues): string[] => unsupportedPdfCharsIn(Object.values(values));

/** Rows of the two-party signature block: label + the party field suffix it shows ("" = blank signature line). */
export const signatureRows: { label: string; suffix: string }[] = [
  { label: "Signature", suffix: "" },
  { label: "Print Name", suffix: "name" },
  { label: "Title", suffix: "title" },
  { label: "Company", suffix: "company" },
  { label: "Notice Address", suffix: "address" },
  { label: "Date", suffix: "date" },
];

/** A party's value for a signature row (dates formatted like the NDA's). */
export function partyValue(values: FieldValues, partyIndex: number, suffix: string, format: (iso: string) => string): string {
  if (!suffix) return "";
  const value = values[`party${partyIndex + 1}_${suffix}`] ?? "";
  return suffix === "date" ? format(value) : value;
}

/** A saved document's title: its name, plus whichever party names are known yet. */
export function draftTitle(name: string, parties: string[]): string {
  const known = parties.map((p) => p.trim()).filter(Boolean);
  return known.length ? `${name} — ${known.join(" & ")}` : name;
}

/** Who a party is, for a title: its company, else its signer's name. */
export const partyLabel = (values: FieldValues, partyIndex: number): string =>
  values[`party${partyIndex + 1}_company`]?.trim() || values[`party${partyIndex + 1}_name`]?.trim() || "";

/** The chat's opening line when a saved draft is reopened. */
export const RESUME_GREETING = "Welcome back! Your draft is saved — what would you like to change?";

export const pdfFileName = (name: string) => `${name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "")}.pdf`;
