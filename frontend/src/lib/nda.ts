import { unsupportedPdfCharsIn } from "@/lib/pdfChars";

export type NdaForm = {
  purpose: string;
  /** null = untouched; the UI then defaults it to the visitor's local today. */
  effectiveDate: string | null;
  termType: "expires" | "continues";
  termYears: string;
  confidentialityType: "years" | "perpetuity";
  confidentialityYears: string;
  governingLaw: string;
  jurisdiction: string;
  modifications: string;
  party1: Party;
  party2: Party;
};

export type Party = {
  name: string;
  title: string;
  company: string;
  address: string;
  date: string;
};

/** A turn-scoped patch from the AI chat backend (see backend/app/schemas.py's
 * NdaFieldsPatch/PartyFieldsPatch): null/undefined means "not mentioned or
 * unchanged this turn" for every field, never "clear this field". */
export type PartyFieldsPatch = {
  name?: string | null;
  title?: string | null;
  company?: string | null;
  address?: string | null;
  date?: string | null;
};

export type NdaFieldsPatch = {
  purpose?: string | null;
  effectiveDate?: string | null;
  termType?: string | null;
  termYears?: string | null;
  confidentialityType?: string | null;
  confidentialityYears?: string | null;
  governingLaw?: string | null;
  jurisdiction?: string | null;
  modifications?: string | null;
  party1?: PartyFieldsPatch | null;
  party2?: PartyFieldsPatch | null;
};

function mergePartyPatch(party: Party, patch: PartyFieldsPatch | null | undefined): Party {
  if (!patch) return party;
  return {
    name: patch.name ?? party.name,
    title: patch.title ?? party.title,
    company: patch.company ?? party.company,
    address: patch.address ?? party.address,
    date: patch.date ?? party.date,
  };
}

/**
 * Sparse-merges an AI chat patch into an existing NdaForm. Only fields the
 * backend actually set (non-null) overwrite the corresponding NdaForm
 * field; everything else -- including nested party fields -- is left as-is.
 * termType/confidentialityType are cast from the patch's plain-string type:
 * the backend already validates them against the same enum before this
 * ever reaches the client (see app.nda_chat.normalize_patch).
 */
export function mergeNdaFieldsPatch(form: NdaForm, patch: NdaFieldsPatch): NdaForm {
  return {
    purpose: patch.purpose ?? form.purpose,
    effectiveDate: patch.effectiveDate ?? form.effectiveDate,
    termType: (patch.termType as NdaForm["termType"] | undefined) ?? form.termType,
    termYears: patch.termYears ?? form.termYears,
    confidentialityType:
      (patch.confidentialityType as NdaForm["confidentialityType"] | undefined) ?? form.confidentialityType,
    confidentialityYears: patch.confidentialityYears ?? form.confidentialityYears,
    governingLaw: patch.governingLaw ?? form.governingLaw,
    jurisdiction: patch.jurisdiction ?? form.jurisdiction,
    modifications: patch.modifications ?? form.modifications,
    party1: mergePartyPatch(form.party1, patch.party1),
    party2: mergePartyPatch(form.party2, patch.party2),
  };
}

/** Today's date in the user's local timezone as YYYY-MM-DD (toISOString would use UTC and can be a day off). */
export const today = (now: Date = new Date()) => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const emptyParty = (): Party => ({ name: "", title: "", company: "", address: "", date: "" });

export const defaultForm = (): NdaForm => ({
  purpose: "Evaluating whether to enter into a business relationship with the other party.",
  effectiveDate: null,
  termType: "expires",
  termYears: "1",
  confidentialityType: "years",
  confidentialityYears: "1",
  governingLaw: "",
  jurisdiction: "",
  modifications: "",
  party1: emptyParty(),
  party2: emptyParty(),
});

export const formatDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
};

export const MAX_YEARS = 99;

/** Whole number of years in 1..MAX_YEARS; anything unparseable falls back to 1, huge values are capped. */
export const normalizeYears = (n: string): number => {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v) || v < 1) return 1;
  return Math.min(v, MAX_YEARS);
};

export const years = (n: string) => {
  const v = normalizeYears(n);
  return `${v} year${v === 1 ? "" : "s"}`;
};

export const termText = (f: NdaForm) =>
  f.termType === "expires"
    ? `Expires ${years(f.termYears)} from Effective Date.`
    : "Continues until terminated in accordance with the terms of the MNDA.";

export const confidentialityText = (f: NdaForm) =>
  f.confidentialityType === "years"
    ? `${years(f.confidentialityYears)} from Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws.`
    : "In perpetuity.";

/** Standard Terms from templates/Mutual-NDA.md (Common Paper Mutual NDA v1.0, CC BY 4.0). */
export type Segment = string | { ref: "purpose" | "effectiveDate" | "term" | "confidentiality" | "governingLaw" | "jurisdiction" };
export type Clause = { title: string; body: Segment[] };

const R = (ref: Extract<Segment, object>["ref"]): Segment => ({ ref });

export const standardTerms: Clause[] = [
  {
    title: "Introduction",
    body: [
      "This Mutual Non-Disclosure Agreement (which incorporates these Standard Terms and the Cover Page (defined below)) (“MNDA”) allows each party (“Disclosing Party”) to disclose or make available information in connection with the ",
      R("purpose"),
      " which (1) the Disclosing Party identifies to the receiving party (“Receiving Party”) as “confidential”, “proprietary”, or the like or (2) should be reasonably understood as confidential or proprietary due to its nature and the circumstances of its disclosure (“Confidential Information”). Each party’s Confidential Information also includes the existence and status of the parties’ discussions and information on the Cover Page. Confidential Information includes technical or business information, product designs or roadmaps, requirements, pricing, security and compliance documentation, technology, inventions and know-how. To use this MNDA, the parties must complete and sign a cover page incorporating these Standard Terms (“Cover Page”). Each party is identified on the Cover Page and capitalized terms have the meanings given herein or on the Cover Page.",
    ],
  },
  {
    title: "Use and Protection of Confidential Information",
    body: [
      "The Receiving Party shall: (a) use Confidential Information solely for the ",
      R("purpose"),
      "; (b) not disclose Confidential Information to third parties without the Disclosing Party’s prior written approval, except that the Receiving Party may disclose Confidential Information to its employees, agents, advisors, contractors and other representatives having a reasonable need to know for the ",
      R("purpose"),
      ", provided these representatives are bound by confidentiality obligations no less protective of the Disclosing Party than the applicable terms in this MNDA and the Receiving Party remains responsible for their compliance with this MNDA; and (c) protect Confidential Information using at least the same protections the Receiving Party uses for its own similar information but no less than a reasonable standard of care.",
    ],
  },
  {
    title: "Exceptions",
    body: [
      "The Receiving Party’s obligations in this MNDA do not apply to information that it can demonstrate: (a) is or becomes publicly available through no fault of the Receiving Party; (b) it rightfully knew or possessed prior to receipt from the Disclosing Party without confidentiality restrictions; (c) it rightfully obtained from a third party without confidentiality restrictions; or (d) it independently developed without using or referencing the Confidential Information.",
    ],
  },
  {
    title: "Disclosures Required by Law",
    body: [
      "The Receiving Party may disclose Confidential Information to the extent required by law, regulation or regulatory authority, subpoena or court order, provided (to the extent legally permitted) it provides the Disclosing Party reasonable advance notice of the required disclosure and reasonably cooperates, at the Disclosing Party’s expense, with the Disclosing Party’s efforts to obtain confidential treatment for the Confidential Information.",
    ],
  },
  {
    title: "Term and Termination",
    body: [
      "This MNDA commences on the ",
      R("effectiveDate"),
      " and expires at the end of the ",
      R("term"),
      ". Either party may terminate this MNDA for any or no reason upon written notice to the other party. The Receiving Party’s obligations relating to Confidential Information will survive for the ",
      R("confidentiality"),
      ", despite any expiration or termination of this MNDA.",
    ],
  },
  {
    title: "Return or Destruction of Confidential Information",
    body: [
      "Upon expiration or termination of this MNDA or upon the Disclosing Party’s earlier request, the Receiving Party will: (a) cease using Confidential Information; (b) promptly after the Disclosing Party’s written request, destroy all Confidential Information in the Receiving Party’s possession or control or return it to the Disclosing Party; and (c) if requested by the Disclosing Party, confirm its compliance with these obligations in writing. As an exception to subsection (b), the Receiving Party may retain Confidential Information in accordance with its standard backup or record retention policies or as required by law, but the terms of this MNDA will continue to apply to the retained Confidential Information.",
    ],
  },
  {
    title: "Proprietary Rights",
    body: [
      "The Disclosing Party retains all of its intellectual property and other rights in its Confidential Information and its disclosure to the Receiving Party grants no license under such rights.",
    ],
  },
  {
    title: "Disclaimer",
    body: [
      "ALL CONFIDENTIAL INFORMATION IS PROVIDED “AS IS”, WITH ALL FAULTS, AND WITHOUT WARRANTIES, INCLUDING THE IMPLIED WARRANTIES OF TITLE, MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE.",
    ],
  },
  {
    title: "Governing Law and Jurisdiction",
    body: [
      "This MNDA and all matters relating hereto are governed by, and construed in accordance with, the laws of the State of ",
      R("governingLaw"),
      ", without regard to the conflict of laws provisions of such ",
      R("governingLaw"),
      ". Any legal suit, action, or proceeding relating to this MNDA must be instituted in the federal or state courts located in ",
      R("jurisdiction"),
      ". Each party irrevocably submits to the exclusive jurisdiction of such ",
      R("jurisdiction"),
      " in any such suit, action, or proceeding.",
    ],
  },
  {
    title: "Equitable Relief",
    body: [
      "A breach of this MNDA may cause irreparable harm for which monetary damages are an insufficient remedy. Upon a breach of this MNDA, the Disclosing Party is entitled to seek appropriate equitable relief, including an injunction, in addition to its other remedies.",
    ],
  },
  {
    title: "General",
    body: [
      "Neither party has an obligation under this MNDA to disclose Confidential Information to the other or proceed with any proposed transaction. Neither party may assign this MNDA without the prior written consent of the other party, except that either party may assign this MNDA in connection with a merger, reorganization, acquisition or other transfer of all or substantially all its assets or voting securities. Any assignment in violation of this Section is null and void. This MNDA will bind and inure to the benefit of each party’s permitted successors and assigns. Waivers must be signed by the waiving party’s authorized representative and cannot be implied from conduct. If any provision of this MNDA is held unenforceable, it will be limited to the minimum extent necessary so the rest of this MNDA remains in effect. This MNDA (including the Cover Page) constitutes the entire agreement of the parties with respect to its subject matter, and supersedes all prior and contemporaneous understandings, agreements, representations, and warranties, whether written or oral, regarding such subject matter. This MNDA may only be amended, modified, waived, or supplemented by an agreement in writing signed by both parties. Notices, requests and approvals under this MNDA must be sent in writing to the email or postal addresses on the Cover Page and are deemed delivered on receipt. This MNDA may be executed in counterparts, including electronic copies, each of which is deemed an original and which together form the same agreement.",
    ],
  },
];

export const refValue = (f: NdaForm, ref: Extract<Segment, object>["ref"]): string => {
  switch (ref) {
    case "purpose":
      // The Purpose is free text (a sentence on the cover page), so the clauses use the defined term
      // "Purpose" rather than splicing the sentence into the middle of theirs.
      return "Purpose";
    case "effectiveDate":
      return formatDate(f.effectiveDate) || "Effective Date";
    case "term":
      // "Continues until terminated" is explained on the cover page; a parenthetical here would
      // contradict the clause's "expires at the end of the MNDA Term".
      return f.termType === "expires" ? `MNDA Term (${years(f.termYears)} from the Effective Date)` : "MNDA Term";
    case "confidentiality":
      return f.confidentialityType === "years"
        ? `Term of Confidentiality (${years(f.confidentialityYears)} from the Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws)`
        : "Term of Confidentiality (in perpetuity)";
    case "governingLaw":
      return f.governingLaw.trim() || "[Governing Law]";
    case "jurisdiction":
      return f.jurisdiction.trim() || "[Jurisdiction]";
  }
};

/** Distinct characters in the user's text that the PDF font cannot render. */
export const unsupportedPdfChars = (f: NdaForm): string[] =>
  unsupportedPdfCharsIn([f.purpose, f.governingLaw, f.jurisdiction, f.modifications, ...[f.party1, f.party2].flatMap((p) => Object.values(p))]);
