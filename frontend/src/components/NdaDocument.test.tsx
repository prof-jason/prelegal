import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NdaDocument from "./NdaDocument";
import { defaultForm, standardTerms, type NdaForm } from "@/lib/nda";

const filled = (): NdaForm => ({
  ...defaultForm(),
  purpose: "Exploring a joint venture.",
  effectiveDate: "2026-03-05",
  termType: "expires",
  termYears: "2",
  confidentialityType: "years",
  confidentialityYears: "3",
  governingLaw: "Delaware",
  jurisdiction: "New Castle, DE",
  modifications: "Section 3 is deleted.",
  party1: { name: "Ann Lee", title: "CEO", company: "Acme Inc", address: "ann@acme.test", date: "2026-03-06" },
  party2: { name: "Bo Chen", title: "CTO", company: "Globex LLC", address: "1 Main St", date: "2026-03-07" },
});

const renderDoc = (f: NdaForm) => render(<NdaDocument form={f} />);

describe("NdaDocument – cover page", () => {
  it("shows every entered value", () => {
    renderDoc(filled());
    const doc = screen.getByRole("article");
    for (const text of [
      "Exploring a joint venture.",
      "March 5, 2026",
      "Expires 2 years from Effective Date.",
      "3 years from Effective Date, but in the case of trade secrets",
      "Governing Law: Delaware",
      "Jurisdiction: New Castle, DE",
      "Section 3 is deleted.",
    ]) {
      expect(doc).toHaveTextContent(text);
    }
  });

  it("renders both parties in the signature table with formatted dates", () => {
    renderDoc(filled());
    const table = screen.getByRole("table");
    expect(within(table).getByRole("row", { name: /Print Name Ann Lee Bo Chen/ })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Title CEO CTO/ })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Company Acme Inc Globex LLC/ })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Notice Address ann@acme.test 1 Main St/ })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Date March 6, 2026 March 7, 2026/ })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Party 1" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Party 2" })).toBeInTheDocument();
  });

  it("has an empty signature row for wet-ink / e-signing", () => {
    renderDoc(filled());
    const row = screen.getByRole("row", { name: /^Signature/ });
    expect(row).toHaveTextContent(/^Signature$/);
  });

  it("uses safe placeholders when fields are blank", () => {
    renderDoc({ ...defaultForm(), purpose: "", effectiveDate: null });
    const doc = screen.getByRole("article");
    expect(doc).toHaveTextContent("Governing Law: —");
    expect(doc).toHaveTextContent("Jurisdiction: —");
    expect(doc).toHaveTextContent(/MNDA Modifications\s*None\./);
  });

  it("switches wording for 'continues' and 'perpetuity'", () => {
    renderDoc({ ...filled(), termType: "continues", confidentialityType: "perpetuity" });
    const doc = screen.getByRole("article");
    expect(doc).toHaveTextContent("Continues until terminated in accordance with the terms of the MNDA.");
    expect(doc).toHaveTextContent("In perpetuity.");
    expect(doc).not.toHaveTextContent("Expires 2 years");
  });

  it("renders user text as text, never as HTML", () => {
    const { container } = renderDoc({ ...filled(), modifications: '<img src=x onerror="alert(1)"><b>hi</b>' });
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("article")).toHaveTextContent('<img src=x onerror="alert(1)"><b>hi</b>');
  });

  it("credits Common Paper under CC BY 4.0", () => {
    renderDoc(filled());
    const links = screen.getAllByRole("link", { name: "CC BY 4.0" });
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0]).toHaveAttribute("href", "https://creativecommons.org/licenses/by/4.0/");
  });
});

describe("NdaDocument – standard terms", () => {
  it("renders all 11 numbered clauses, in order", () => {
    renderDoc(filled());
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(standardTerms.length);
    standardTerms.forEach((c, i) => expect(items[i]).toHaveTextContent(new RegExp(`^${c.title}\\.`)));
  });

  it("threads the form values into the clauses", () => {
    renderDoc(filled());
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("in connection with the Exploring a joint venture which");
    expect(items[1]).toHaveTextContent("solely for the Exploring a joint venture;");
    expect(items[4]).toHaveTextContent("commences on the March 5, 2026 and expires at the end of the MNDA Term (2 years from the Effective Date)");
    expect(items[4]).toHaveTextContent("survive for the Term of Confidentiality (3 years from the Effective Date)");
    expect(items[8]).toHaveTextContent("laws of the State of Delaware, without regard to the conflict of laws provisions of such Delaware");
    expect(items[8]).toHaveTextContent("courts located in New Castle, DE. Each party irrevocably submits to the exclusive jurisdiction of such New Castle, DE");
  });

  it("underlines substituted values so they are visible in the document", () => {
    const { container } = renderDoc(filled());
    const underlined = [...container.querySelectorAll("u")].map((u) => u.textContent);
    expect(underlined).toContain("Delaware");
    expect(underlined).toContain("March 5, 2026");
    // purpose x3, governing law x2, jurisdiction x2, date, term, confidentiality
    expect(underlined).toHaveLength(10);
  });

  it("shows bracketed placeholders in clauses until law/jurisdiction are given", () => {
    renderDoc(defaultForm());
    const items = screen.getAllByRole("listitem");
    expect(items[8]).toHaveTextContent("State of [Governing Law]");
    expect(items[8]).toHaveTextContent("located in [Jurisdiction]");
  });
});
