import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  confidentialityText,
  defaultForm,
  formatDate,
  mergeNdaFieldsPatch,
  normalizeYears,
  refValue,
  standardTerms,
  termText,
  today,
  unsupportedPdfChars,
  years,
  type NdaFieldsPatch,
  type NdaForm,
} from "./nda";

const form = (over: Partial<NdaForm> = {}): NdaForm => ({ ...defaultForm(), effectiveDate: "2026-03-05", ...over });

describe("today", () => {
  it("formats the local date as YYYY-MM-DD with zero padding", () => {
    expect(today(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(today(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("uses local, not UTC, calendar fields (late evening stays on the same day)", () => {
    expect(today(new Date(2026, 5, 15, 23, 59, 59))).toBe("2026-06-15");
    expect(today(new Date(2026, 5, 15, 0, 0, 1))).toBe("2026-06-15");
  });
});

describe("formatDate", () => {
  it("renders a long US date without timezone drift", () => {
    expect(formatDate("2026-03-05")).toBe("March 5, 2026");
    expect(formatDate("2026-12-31")).toBe("December 31, 2026");
    expect(formatDate("2028-02-29")).toBe("February 29, 2028");
  });

  it("returns an empty string for null / empty", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate("")).toBe("");
  });

  it("falls back to the raw input when it is not a date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("normalizeYears / years", () => {
  it.each([
    ["1", 1],
    ["2", 2],
    ["10", 10],
    ["3.9", 3],
    ["", 1],
    ["0", 1],
    ["-4", 1],
    ["abc", 1],
    ["  7 ", 7],
    ["Infinity", 1],
    ["99", 99],
    ["100", 99],
    ["1e21", 99],
    ["NaN", 1],
  ])("normalizeYears(%j) = %i", (input, expected) => {
    expect(normalizeYears(input)).toBe(expected);
  });

  it("pluralises correctly", () => {
    expect(years("1")).toBe("1 year");
    expect(years("2")).toBe("2 years");
    expect(years("")).toBe("1 year");
    expect(years("-3")).toBe("1 year");
  });
});

describe("cover page option text", () => {
  it("term: expires", () => {
    expect(termText(form({ termType: "expires", termYears: "3" }))).toBe("Expires 3 years from Effective Date.");
    expect(termText(form({ termType: "expires", termYears: "1" }))).toBe("Expires 1 year from Effective Date.");
  });

  it("term: continues", () => {
    expect(termText(form({ termType: "continues" }))).toBe(
      "Continues until terminated in accordance with the terms of the MNDA.",
    );
  });

  it("confidentiality: years keeps the trade-secret carve-out", () => {
    const text = confidentialityText(form({ confidentialityType: "years", confidentialityYears: "5" }));
    expect(text).toBe(
      "5 years from Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws.",
    );
  });

  it("confidentiality: perpetuity", () => {
    expect(confidentialityText(form({ confidentialityType: "perpetuity" }))).toBe("In perpetuity.");
  });

  it("garbage year values never produce nonsense like '-3 years'", () => {
    expect(termText(form({ termYears: "-3" }))).toBe("Expires 1 year from Effective Date.");
    expect(confidentialityText(form({ confidentialityYears: "" }))).toMatch(/^1 year from/);
  });
});

describe("refValue", () => {
  it("purpose: clauses use the defined term, whatever the free-text purpose says", () => {
    // Splicing a sentence into "for the ___" produced ungrammatical clauses.
    expect(refValue(form({ purpose: "Evaluating a deal." }), "purpose")).toBe("Purpose");
    expect(refValue(form({ purpose: "" }), "purpose")).toBe("Purpose");
  });

  it("effective date", () => {
    expect(refValue(form({ effectiveDate: "2026-03-05" }), "effectiveDate")).toBe("March 5, 2026");
    expect(refValue(form({ effectiveDate: null }), "effectiveDate")).toBe("Effective Date");
  });

  it("term and confidentiality reflect the chosen options", () => {
    expect(refValue(form({ termType: "expires", termYears: "2" }), "term")).toBe(
      "MNDA Term (2 years from the Effective Date)",
    );
    // "expires at the end of the MNDA Term" must not be followed by "(continuing until terminated)"
    expect(refValue(form({ termType: "continues" }), "term")).toBe("MNDA Term");
    expect(refValue(form({ confidentialityType: "years", confidentialityYears: "1" }), "confidentiality")).toBe(
      "Term of Confidentiality (1 year from the Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws)",
    );
    expect(refValue(form({ confidentialityType: "perpetuity" }), "confidentiality")).toBe(
      "Term of Confidentiality (in perpetuity)",
    );
  });

  it("governing law / jurisdiction: trimmed value or bracketed placeholder", () => {
    expect(refValue(form({ governingLaw: " Delaware " }), "governingLaw")).toBe("Delaware");
    expect(refValue(form({ governingLaw: "" }), "governingLaw")).toBe("[Governing Law]");
    expect(refValue(form({ jurisdiction: "courts in New Castle, DE" }), "jurisdiction")).toBe(
      "courts in New Castle, DE",
    );
    expect(refValue(form({ jurisdiction: "  " }), "jurisdiction")).toBe("[Jurisdiction]");
  });
});

describe("unsupportedPdfChars", () => {
  it("accepts Latin text, accents, curly quotes, dashes and symbols the PDF font can draw", () => {
    const f = form({ purpose: "Café Müller — “quoted” ’s … €5 ™ © ñ", party1: { ...defaultForm().party1, company: "Zoë\nMiller" } });
    expect(unsupportedPdfChars(f)).toEqual([]);
  });

  it("reports distinct characters it cannot draw, across every text field", () => {
    const f = form({
      purpose: "株式会社",
      governingLaw: "Łódź",
      modifications: "😀😀",
      party2: { ...defaultForm().party2, name: "Nguyễn" },
    });
    const bad = unsupportedPdfChars(f);
    expect(bad).toEqual(expect.arrayContaining(["株", "Ł", "ź", "😀", "ễ"]));
    expect(bad.filter((c) => c === "😀")).toHaveLength(1);
    expect(bad).not.toContain("ó"); // Latin-1, fine
  });

  it("is empty for the default form", () => {
    expect(unsupportedPdfChars(defaultForm())).toEqual([]);
  });
});

describe("test environment", () => {
  it("runs in a non-UTC timezone so local-vs-UTC date bugs are detectable", () => {
    // If this fails, the TZ pin in vitest.global.ts is not reaching the test workers.
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(480);
  });

  it("today() is the local calendar day even when the UTC day differs", () => {
    // 2026-06-15 20:00 in Los Angeles is already 2026-06-16 03:00 UTC.
    expect(today(new Date(2026, 5, 15, 20, 0, 0))).toBe("2026-06-15");
    expect(new Date(2026, 5, 15, 20, 0, 0).toISOString().slice(0, 10)).toBe("2026-06-16");
  });
});

describe("defaultForm", () => {
  it("starts with the template's default purpose, 1-year terms and no date chosen", () => {
    const f = defaultForm();
    expect(f.purpose).toBe("Evaluating whether to enter into a business relationship with the other party.");
    expect(f.effectiveDate).toBeNull();
    expect(f.termType).toBe("expires");
    expect(f.termYears).toBe("1");
    expect(f.confidentialityType).toBe("years");
    expect(f.confidentialityYears).toBe("1");
  });

  it("returns independent objects (no shared party state between calls)", () => {
    const a = defaultForm();
    const b = defaultForm();
    a.party1.name = "changed";
    expect(b.party1.name).toBe("");
  });
});

describe("mergeNdaFieldsPatch", () => {
  it("overwrites only the fields present in the patch", () => {
    const f = form({ governingLaw: "", jurisdiction: "" });
    const patch: NdaFieldsPatch = { governingLaw: "Delaware" };
    const merged = mergeNdaFieldsPatch(f, patch);
    expect(merged.governingLaw).toBe("Delaware");
    expect(merged.jurisdiction).toBe(""); // untouched
    expect(merged.purpose).toBe(f.purpose); // untouched
  });

  it("null/undefined patch fields are no-ops, not clears", () => {
    const f = form({ governingLaw: "Texas" });
    const merged = mergeNdaFieldsPatch(f, { governingLaw: null });
    expect(merged.governingLaw).toBe("Texas");
  });

  it("an empty patch changes nothing", () => {
    const f = form({ governingLaw: "Texas", jurisdiction: "Austin, TX" });
    expect(mergeNdaFieldsPatch(f, {})).toEqual(f);
  });

  it("sparse-merges party fields, leaving unmentioned party fields alone", () => {
    const f = form();
    f.party1 = { name: "Ann Lee", title: "CEO", company: "", address: "", date: "" };
    const merged = mergeNdaFieldsPatch(f, { party1: { company: "Acme Inc" } });
    expect(merged.party1).toEqual({ name: "Ann Lee", title: "CEO", company: "Acme Inc", address: "", date: "" });
  });

  it("leaves party2 alone when only party1 is patched", () => {
    const f = form();
    f.party2 = { name: "Bo Chen", title: "", company: "", address: "", date: "" };
    const merged = mergeNdaFieldsPatch(f, { party1: { name: "Ann Lee" } });
    expect(merged.party2).toEqual(f.party2);
  });

  it("accepts valid termType/confidentialityType enum values from the patch", () => {
    const f = form();
    const merged = mergeNdaFieldsPatch(f, { termType: "continues", confidentialityType: "perpetuity" });
    expect(merged.termType).toBe("continues");
    expect(merged.confidentialityType).toBe("perpetuity");
  });

  it("a null effectiveDate patch leaves the form's existing value (even if already null) alone", () => {
    const f = { ...form(), effectiveDate: null };
    const merged = mergeNdaFieldsPatch(f, { effectiveDate: null });
    expect(merged.effectiveDate).toBeNull();
  });
});

describe("standardTerms fidelity to templates/Mutual-NDA.md", () => {
  const raw = readFileSync(resolve(__dirname, "../../../templates/Mutual-NDA.md"), "utf8");
  const refName = {
    purpose: "Purpose",
    effectiveDate: "Effective Date",
    term: "MNDA Term",
    confidentiality: "Term of Confidentiality",
    governingLaw: "Governing Law",
    jurisdiction: "Jurisdiction",
  } as const;

  // "1. **Title**. Body with <span class="coverpage_link">Ref</span>" -> "Title. Body with {Ref}"
  const templateClauses = raw
    .split("\n")
    .filter((l) => /^\d+\. /.test(l))
    .map((l) =>
      l
        .replace(/^\d+\. /, "")
        .replace(/<span class="coverpage_link">([^<]+)<\/span>/g, "{$1}")
        .replace(/\*\*/g, ""),
    );

  const ourClauses = standardTerms.map(
    (c) =>
      `${c.title}. ` + c.body.map((s) => (typeof s === "string" ? s : `{${refName[s.ref]}}`)).join(""),
  );

  it("has the same number of clauses as the template", () => {
    expect(templateClauses).toHaveLength(11);
    expect(ourClauses).toHaveLength(templateClauses.length);
  });

  it.each(standardTerms.map((c, i) => [i + 1, c.title] as const))("clause %i (%s) matches the template text", (i) => {
    expect(ourClauses[i - 1]).toBe(templateClauses[i - 1]);
  });
});
