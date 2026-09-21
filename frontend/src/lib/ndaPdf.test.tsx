// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import { buildNdaPdf } from "./ndaPdf";
import { defaultForm, standardTerms, type NdaForm } from "./nda";
import { pdfPages } from "@/test/pdfText";

const filled = (): NdaForm => ({
  ...defaultForm(),
  purpose: "Exploring a joint venture.",
  effectiveDate: "2026-03-05",
  termYears: "2",
  confidentialityYears: "3",
  governingLaw: "Delaware",
  jurisdiction: "New Castle, DE",
  modifications: "Section 3 is deleted.",
  party1: { name: "Ann Lee", title: "CEO", company: "Acme Inc", address: "ann@acme.test", date: "2026-03-06" },
  party2: { name: "Bo Chen", title: "CTO", company: "Globex LLC", address: "1 Main St", date: "2026-03-07" },
});

describe("buildNdaPdf (filled form)", () => {
  let blob: Blob;
  let pages: string[];
  beforeAll(async () => {
    blob = await buildNdaPdf(filled());
    pages = await pdfPages(blob);
  });

  it("produces a non-trivial application/pdf", async () => {
    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(5_000);
    expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
  });

  it("has the cover page then the standard terms", () => {
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages[0]).toContain("Mutual Non-Disclosure Agreement");
    expect(pages[0]).toContain("USING THIS MUTUAL NON-DISCLOSURE AGREEMENT");
    expect(pages.join(" ")).toContain("Standard Terms");
  });

  it("cover page carries every entered value", () => {
    const cover = pages[0];
    for (const v of [
      "Exploring a joint venture.",
      "March 5, 2026",
      "Expires 2 years from Effective Date.",
      "3 years from Effective Date, but in the case of trade secrets",
      "Governing Law: Delaware",
      "Jurisdiction: New Castle, DE",
      "Section 3 is deleted.",
      "Ann Lee",
      "Bo Chen",
      "CEO",
      "CTO",
      "Acme Inc",
      "Globex LLC",
      "ann@acme.test",
      "1 Main St",
      "March 6, 2026",
      "March 7, 2026",
      "Party 1",
      "Party 2",
      "Signature",
    ]) {
      expect(cover, `cover page should contain ${v}`).toContain(v);
    }
  });

  it("contains all 11 clauses as 'N. Title.' in order", () => {
    const text = pages.slice(1).join(" ");
    let from = 0;
    standardTerms.forEach((c, i) => {
      // pdf.js emits the bold title and its full stop as separate runs, hence the optional space
      const m = new RegExp(`(?:^|\\s)${i + 1}\\.\\s*${c.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s?\\.`).exec(text.slice(from));
      expect(m, `clause ${i + 1} ${c.title}`).not.toBeNull();
      from += m!.index + m![0].length;
    });
  });

  it("substitutes values into the clauses and leaves no unresolved placeholders", () => {
    const text = pages.join(" ");
    expect(text).toContain("laws of the State of Delaware");
    expect(text).toContain("courts located in New Castle, DE");
    expect(text).toContain("MNDA Term (2 years from the Effective Date)");
    expect(text).toContain("Term of Confidentiality (3 years from the Effective Date, but in the case of trade secrets");
    // purpose sentence lives on the cover page; clauses use the defined term
    expect(text).toContain("in connection with the Purpose which");
    expect(text).toContain("solely for the Purpose;");
    expect(text).not.toContain("[Governing Law]");
    expect(text).not.toContain("[Jurisdiction]");
    expect(text).not.toMatch(/undefined|\[object|NaN|\bnull\b(?! and void)/);
  });

  it("fits the cover page on one page and the terms on the following pages (3 pages total)", () => {
    expect(pages).toHaveLength(3);
    expect(pages[0]).toContain("Signature");
    expect(pages[0]).not.toContain("Standard Terms 1.");
    expect(pages[1]).toMatch(/^Standard Terms 1\./);
  });

  it("never strands the signature table away from the 'By signing' sentence", async () => {
    // Regression: with a fuller cover page the table used to land alone on its own page.
    for (const modifications of ["", "x ".repeat(100), "Long modification text. ".repeat(60)]) {
      const ps = await pdfPages(await buildNdaPdf({ ...filled(), modifications }));
      const sign = ps.findIndex((p) => p.includes("By signing this Cover Page"));
      const table = ps.findIndex((p) => p.includes("Party 1 Party 2 Signature"));
      expect(sign, `modifications length ${modifications.length}`).toBe(table);
      expect(sign).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps each clause whole: no clause number is stranded at the bottom of a page", async () => {
    // Regression: "7." used to sit alone at the foot of page 2 with its text on page 3.
    for (const purpose of ["Short.", "Exploring a joint venture.", "A much longer purpose. ".repeat(12)]) {
      const ps = await pdfPages(await buildNdaPdf({ ...filled(), purpose }));
      ps.forEach((p, i) => expect(p, `page ${i + 1} (purpose ${purpose.length} chars)`).not.toMatch(/\s\d{1,2}\.\s*$/));
    }
  });

  it("does not hyphenate words, so URLs and legal terms stay intact", () => {
    const text = pages.join(" ");
    expect(text).toContain("commonpaper.com/standards/mutual-nda/1.0");
    expect(text).toContain("reasonably understood as confidential or proprietary");
    expect(text).not.toMatch(/\w- \w/);
  });

  it("includes the CC BY 4.0 attribution", () => {
    expect(pages.join(" ")).toContain("free to use under CC BY 4.0");
  });
});

describe("buildNdaPdf (edge cases)", () => {
  it("renders an empty form with placeholders rather than failing", async () => {
    const text = (await pdfPages(await buildNdaPdf({ ...defaultForm(), purpose: "", effectiveDate: null }))).join(" ");
    expect(text).toContain("Governing Law: —");
    expect(text).toContain("[Governing Law]");
    expect(text).toContain("None.");
    expect(text).not.toMatch(/undefined|\[object|NaN|\bnull\b(?! and void)/);
  });

  it("supports 'continues' and 'perpetuity' options", async () => {
    const text = (
      await pdfPages(await buildNdaPdf({ ...filled(), termType: "continues", confidentialityType: "perpetuity" }))
    ).join(" ");
    expect(text).toContain("Continues until terminated in accordance with the terms of the MNDA.");
    expect(text).toContain("In perpetuity.");
    expect(text).toContain("Term of Confidentiality (in perpetuity)");
    // continues: bare defined term, no contradictory parenthetical after "expires at the end of"
    expect(text).toContain("expires at the end of the MNDA Term. Either party");
  });

  it("handles accents, curly quotes and ampersands in user text", async () => {
    const text = (
      await pdfPages(
        await buildNdaPdf({
          ...filled(),
          party1: { ...filled().party1, company: "Café Müller & Söhne — “Ñandú”" },
        }),
      )
    ).join(" ");
    expect(text).toContain("Café Müller & Söhne");
    expect(text).toContain("Ñandú");
  });

  it("does not throw on very long text and paginates it", async () => {
    const long = "word ".repeat(3000);
    const pages = await pdfPages(await buildNdaPdf({ ...filled(), modifications: long }));
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(pages.join(" ")).toContain("word word word");
  });

  it("very long party fields (unbroken address, huge company) still build and keep the table with its lead-in", async () => {
    const huge = { name: "N".repeat(200), title: "T ".repeat(80), company: "C".repeat(300), address: "a".repeat(400) + "@example.com", date: "2026-03-06" };
    const ps = await pdfPages(await buildNdaPdf({ ...filled(), party1: huge, party2: huge }));
    const sign = ps.findIndex((p) => p.includes("By signing this Cover Page"));
    expect(sign).toBeGreaterThanOrEqual(0);
    expect(ps[sign]).toContain("Party 1 Party 2 Signature");
  });

  it("wraps a very long Purpose / Modifications entry instead of clipping it", async () => {
    const marker = "END-OF-MODIFICATIONS";
    const text = (await pdfPages(await buildNdaPdf({ ...filled(), modifications: "Paragraph text. ".repeat(400) + marker }))).join(" ");
    expect(text).toContain(marker);
  });

  it("does not throw on non-Latin text (Times has no such glyphs, but PDF must still build)", async () => {
    const blob = await buildNdaPdf({ ...filled(), party1: { ...filled().party1, company: "株式会社テスト" } });
    expect(blob.size).toBeGreaterThan(5_000);
  });
});
