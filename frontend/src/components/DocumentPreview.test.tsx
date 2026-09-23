import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DocumentPreview from "./DocumentPreview";
import { emptyValues } from "@/lib/document";
import { parseTemplate } from "@/lib/template";
import { slaDetail } from "@/test/documentFixture";

const renderPreview = (values: Record<string, string> = {}) => {
  const detail = slaDetail();
  return render(<DocumentPreview detail={detail} template={parseTemplate(detail.markdown)} values={{ ...emptyValues(detail), ...values }} />);
};

describe("DocumentPreview", () => {
  it("shows unfilled variables as [Term] placeholders and dashes on the cover page", () => {
    renderPreview();
    const doc = screen.getByRole("article", { name: "Service Level Agreement" });
    expect(doc).toHaveTextContent("[Target Uptime]");
    expect(doc).toHaveTextContent("Provider: —");
    expect(within(doc).getByText("Target Uptime", { selector: "dt" }).nextSibling).toHaveTextContent("—");
  });

  it("fills the cover page and underlines filled variables in the terms", () => {
    renderPreview({ target_uptime: "99.9%", party1_company: "Acme Cloud", effective_date: "2026-03-05" });
    const doc = screen.getByRole("article");
    expect(doc).toHaveTextContent("Provider: Acme Cloud");
    expect(doc).toHaveTextContent("March 5, 2026");
    const term = within(doc).getByText("Target Uptime", { selector: "u" });
    expect(term).toHaveAttribute("title", "99.9%");
    expect(doc).not.toHaveTextContent("[Target Uptime]");
    expect(doc).toHaveTextContent("[Support Channel]");
  });

  it("renders clause numbers, headings, party roles as text, and web links", () => {
    renderPreview();
    const doc = screen.getByRole("article");
    expect(doc).toHaveTextContent("1.1 Target Uptime. Provider will meet");
    expect(doc).toHaveTextContent("a. Starting on the");
    expect(within(doc).getByRole("link", { name: /commonpaper\.com/ })).toHaveAttribute(
      "href",
      "https://commonpaper.com/standards/service-level-agreement/2.0/",
    );
  });

  it("puts both parties in the signature table", () => {
    renderPreview({ party1_name: "Ann Lee", party2_name: "Bo Chen", party2_date: "2026-03-07" });
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Provider" })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Print Name Ann Lee Bo Chen/ })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Date March 7, 2026/ })).toBeInTheDocument();
  });

  it("shows field values literally, never as markup", () => {
    renderPreview({ party1_company: "<b>x</b>" });
    expect(screen.getByRole("article")).toHaveTextContent("Provider: <b>x</b>");
  });
});
