import { describe, expect, it } from "vitest";
import { slaDetail } from "@/test/documentFixture";
import { allFields, emptyTermLabels, emptyValues, groupTerms, mergeUpdates, partyValue, pdfFileName, summarizeList, unsupportedDocumentPdfChars, type FieldValues } from "./document";

describe("document helpers", () => {
  it("lists every term then every party field, all starting empty", () => {
    const d = slaDetail();
    expect(allFields(d).map((f) => f.key).slice(0, 4)).toEqual(["target_uptime", "support_channel", "effective_date", "party1_company"]);
    expect(Object.values(emptyValues(d)).every((v) => v === "")).toBe(true);
    expect(Object.keys(emptyValues(d))).toHaveLength(3 + 10);
  });

  it("merges only known, non-empty keys and leaves the rest untouched", () => {
    const d = slaDetail();
    const values: FieldValues = { ...emptyValues(d), support_channel: "email" };
    const next = mergeUpdates(d, values, { target_uptime: "99.9%", support_channel: "", invented_key: "x" });
    expect(next.target_uptime).toBe("99.9%");
    expect(next.support_channel).toBe("email");
    expect(next).not.toHaveProperty("invented_key");
    expect(values.target_uptime).toBe(""); // not mutated
  });

  it("groups terms by cover-page section in first-appearance order", () => {
    expect(groupTerms(slaDetail()).map(([g, fields]) => [g, fields.length])).toEqual([
      ["Order Form", 2],
      ["Key Terms", 1],
    ]);
  });

  it("reports empty terms (ignoring whitespace) and unsupported PDF characters", () => {
    const d = slaDetail();
    const values = { ...emptyValues(d), target_uptime: "99.9%", support_channel: "  " };
    expect(emptyTermLabels(d, values)).toEqual(["Support Channel", "Effective Date"]);
    expect(unsupportedDocumentPdfChars({ ...values, party1_company: "株式会社 Acme" })).toContain("株");
  });

  it("formats a party's signature-row values and builds a safe PDF file name", () => {
    const values = { party2_date: "2026-03-05", party2_name: "Bo Chen" };
    const format = (iso: string) => `F(${iso})`;
    expect(partyValue(values, 1, "date", format)).toBe("F(2026-03-05)");
    expect(partyValue(values, 1, "name", format)).toBe("Bo Chen");
    expect(partyValue(values, 1, "", format)).toBe("");
    expect(pdfFileName("Service Level Agreement")).toBe("Service-Level-Agreement.pdf");
  });

  it("summarizes a long list of empty terms", () => {
    expect(summarizeList(["A", "B"])).toBe("A, B");
    expect(summarizeList(["A", "B", "C", "D", "E"])).toBe("A, B, C and 2 more");
  });
});
