// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildDocumentPdf } from "./documentPdf";
import { emptyValues, type DocumentDetail } from "./document";
import { parseTemplate } from "./template";
import { slaDetail } from "@/test/documentFixture";
import { pdfPages } from "@/test/pdfText";

const build = async (detail: DocumentDetail, values: Record<string, string>) =>
  pdfPages(await buildDocumentPdf({ detail, template: parseTemplate(detail.markdown), values: { ...emptyValues(detail), ...values } }));

describe("buildDocumentPdf", () => {
  let pages: string[];
  beforeAll(async () => {
    pages = await build(slaDetail(), {
      target_uptime: "99.9%",
      effective_date: "2026-03-05",
      party1_company: "Acme Cloud",
      party1_name: "Ann Lee",
      party2_company: "Globex LLC",
      party2_date: "2026-03-07",
    });
  });

  it("puts the cover page (values, parties, signature block) first and the terms after", () => {
    expect(pages.length).toBeGreaterThanOrEqual(2);
    const [cover] = pages;
    expect(cover).toContain("Service Level Agreement");
    expect(cover).toContain("Provider: Acme Cloud");
    expect(cover).toContain("Target Uptime 99.9%");
    expect(cover).toContain("Effective Date March 5, 2026");
    expect(cover).toContain("Ann Lee");
    expect(cover).toContain("March 7, 2026");
    // The "Standard Terms" heading is rendered uppercase.
    expect(cover).not.toContain("STANDARD TERMS");
    expect(pages.slice(1).join(" ")).toContain("STANDARD TERMS");
  });

  it("keeps filled variables as their defined term and marks unfilled ones [Term]", () => {
    const terms = pages.slice(1).join(" ");
    expect(terms).toContain("1.1 Target Uptime. Provider will meet the Target Uptime via the [Support Channel]");
    expect(terms).toContain("Based on the Common Paper Service Level Agreement standard terms");
  });

  it("renders a full real template (the longest one) without crashing", async () => {
    const markdown = readFileSync(resolve(__dirname, "../../../templates/DPA.md"), "utf8");
    const real = await build({ ...slaDetail(), name: "Data Processing Agreement", markdown }, { party1_company: "株式会社" });
    expect(real.join(" ")).toContain("Data Processing Agreement");
    expect(real.length).toBeGreaterThan(3);
  });
});
