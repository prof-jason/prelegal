import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import { today } from "@/lib/nda";

const buildNdaPdf = vi.fn();
vi.mock("@/lib/ndaPdf", () => ({ buildNdaPdf: (...a: unknown[]) => buildNdaPdf(...a) }));

const doc = () => screen.getByRole("article");

beforeEach(() => {
  buildNdaPdf.mockReset();
  buildNdaPdf.mockResolvedValue(new Blob(["%PDF-1.3"], { type: "application/pdf" }));
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("Home page", () => {
  it("renders the form beside the live document", () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "Mutual NDA Creator" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Mutual NDA details" })).toBeInTheDocument();
    expect(doc()).toBeInTheDocument();
  });

  it("defaults the effective date to the visitor's local today", () => {
    render(<Home />);
    expect(screen.getByLabelText("Effective date")).toHaveValue(today());
    expect(doc()).toHaveTextContent(
      new Date(`${today()}T00:00:00`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    );
  });

  it("updates the document live as fields change", async () => {
    const user = userEvent.setup();
    render(<Home />);
    expect(doc()).toHaveTextContent("Governing Law: —");
    await user.type(screen.getByLabelText(/Governing law/), "Delaware");
    expect(doc()).toHaveTextContent("Governing Law: Delaware");
    expect(doc()).toHaveTextContent("laws of the State of Delaware");

    await user.type(screen.getAllByLabelText("Print name")[0], "Ann Lee");
    expect(within(screen.getByRole("table")).getByRole("row", { name: /Print Name Ann Lee/ })).toBeInTheDocument();
  });

  it("live-updates the term wording when radio / years change", async () => {
    const user = userEvent.setup();
    render(<Home />);
    expect(doc()).toHaveTextContent("Expires 1 year from Effective Date.");
    const [termYears] = screen.getAllByRole("spinbutton");
    await user.clear(termYears);
    await user.type(termYears, "4");
    expect(doc()).toHaveTextContent("Expires 4 years from Effective Date.");
    await user.click(screen.getByRole("radio", { name: /Continues until terminated/ }));
    expect(doc()).toHaveTextContent("Continues until terminated in accordance with the terms of the MNDA.");
  });

  it("keeps a chosen effective date and lets the user clear it", async () => {
    const user = userEvent.setup();
    render(<Home />);
    const date = screen.getByLabelText("Effective date");
    await user.clear(date);
    await user.type(date, "2030-07-04");
    expect(doc()).toHaveTextContent("July 4, 2030");
    await user.clear(date);
    expect(date).toHaveValue("");
    expect(doc()).not.toHaveTextContent("July 4, 2030");
  });

  describe("Download PDF", () => {
    it("builds the PDF from the current form and saves it as Mutual-NDA.pdf", async () => {
      const user = userEvent.setup();
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe("Mutual-NDA.pdf");
        expect(this.href).toBe("blob:mock");
      });
      render(<Home />);
      await user.type(screen.getByLabelText(/Governing law/), "Texas");
      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
      expect(buildNdaPdf).toHaveBeenCalledTimes(1);
      const passed = buildNdaPdf.mock.calls[0][0];
      expect(passed.governingLaw).toBe("Texas");
      expect(passed.effectiveDate).toBe(today()); // resolved default, never null
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock");
    });

    it("shows a busy state and disables the button while generating", async () => {
      let resolve!: (b: Blob) => void;
      buildNdaPdf.mockReturnValue(new Promise<Blob>((r) => (resolve = r)));
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "Download PDF" }));
      const busy = await screen.findByRole("button", { name: "Generating…" });
      expect(busy).toBeDisabled();
      resolve(new Blob(["x"]));
      expect(await screen.findByRole("button", { name: "Download PDF" })).toBeEnabled();
    });

    it("shows an alert (and recovers) when PDF generation fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      buildNdaPdf.mockRejectedValueOnce(new Error("boom"));
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const user = userEvent.setup();
      render(<Home />);
      await user.click(screen.getByRole("button", { name: "Download PDF" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("PDF could not be generated");
      expect(click).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();

      await user.click(screen.getByRole("button", { name: "Download PDF" }));
      await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});
