import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import NdaFormPanel from "./NdaFormPanel";
import { defaultForm, type NdaForm } from "@/lib/nda";

/** Controlled harness so typing accumulates like it does in the real page. */
function Harness({ onChange }: { onChange?: (f: NdaForm) => void }) {
  const [form, setForm] = useState<NdaForm>({ ...defaultForm(), effectiveDate: "2026-03-05" });
  return (
    <NdaFormPanel
      form={form}
      onChange={(f) => {
        setForm(f);
        onChange?.(f);
      }}
    />
  );
}

const last = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)![0] as NdaForm;

describe("NdaFormPanel", () => {
  it("renders every field with its default value", () => {
    render(<Harness />);
    expect(screen.getByLabelText(/^Purpose/)).toHaveValue(
      "Evaluating whether to enter into a business relationship with the other party.",
    );
    expect(screen.getByLabelText("Effective date")).toHaveValue("2026-03-05");
    expect(screen.getByLabelText(/Governing law/)).toHaveValue("");
    expect(screen.getByLabelText("Governing law (state name only)")).toBeInTheDocument();
    expect(screen.getByLabelText(/Jurisdiction/)).toHaveValue("");
    expect(screen.getByLabelText(/MNDA modifications/)).toHaveValue("");
    expect(screen.getAllByLabelText("Print name")).toHaveLength(2);
    expect(screen.getAllByLabelText("Title")).toHaveLength(2);
    expect(screen.getAllByLabelText("Company")).toHaveLength(2);
    expect(screen.getAllByLabelText(/Notice address/)).toHaveLength(2);
    expect(screen.getAllByLabelText("Signing date")).toHaveLength(2);
  });

  it("jurisdiction hint doesn't repeat 'courts located in', which clause 9 already says", () => {
    render(<Harness />);
    const hint = screen.getByLabelText(/Jurisdiction/).getAttribute("placeholder")!;
    expect(hint).not.toMatch(/courts/i);
  });

  it("exposes each radio set as a named group with a shared radio name", () => {
    render(<Harness />);
    const term = screen.getByRole("group", { name: "MNDA term" });
    const conf = screen.getByRole("group", { name: "Term of confidentiality" });
    const radios = (g: HTMLElement) => [...g.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    expect(radios(term)).toHaveLength(2);
    expect(new Set(radios(term).map((r) => r.name))).toEqual(new Set(["termType"]));
    expect(radios(conf)).toHaveLength(2);
    expect(new Set(radios(conf).map((r) => r.name))).toEqual(new Set(["confidentialityType"]));
  });

  it("limits year inputs to 1..99", () => {
    render(<Harness />);
    for (const input of screen.getAllByRole("spinbutton")) {
      expect(input).toHaveAttribute("min", "1");
      expect(input).toHaveAttribute("max", "99");
    }
  });

  it("gives the year inputs accessible names", () => {
    render(<Harness />);
    expect(screen.getByRole("spinbutton", { name: "MNDA term in years" })).toHaveValue(1);
    expect(screen.getByRole("spinbutton", { name: "Term of confidentiality in years" })).toHaveValue(1);
  });

  it("groups party fields under Party 1 / Party 2 legends", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Party 1" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Party 2" })).toBeInTheDocument();
  });

  it("emits text edits for top-level fields", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.type(screen.getByLabelText(/Governing law/), "Delaware");
    expect(last(onChange).governingLaw).toBe("Delaware");
    await user.type(screen.getByLabelText(/Jurisdiction/), "Dover, DE");
    expect(last(onChange).jurisdiction).toBe("Dover, DE");
    await user.type(screen.getByLabelText(/MNDA modifications/), "None");
    expect(last(onChange).modifications).toBe("None");
  });

  it("routes party edits to the correct party without touching the other", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    const [n1, n2] = screen.getAllByLabelText("Print name");
    await user.type(n1, "Ann");
    await user.type(n2, "Bo");
    const f = last(onChange);
    expect(f.party1.name).toBe("Ann");
    expect(f.party2.name).toBe("Bo");
    const [c1] = screen.getAllByLabelText("Company");
    await user.type(c1, "Acme");
    expect(last(onChange).party1.company).toBe("Acme");
    expect(last(onChange).party2.company).toBe("");
  });

  it("changing one field preserves all others", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.type(screen.getAllByLabelText("Print name")[0], "A");
    await user.type(screen.getByLabelText(/Governing law/), "X");
    expect(last(onChange).party1.name).toBe("A");
    expect(last(onChange).governingLaw).toBe("X");
  });

  it("MNDA term: number input is enabled only for 'Expires after'", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const expires = screen.getByRole("radio", { name: /Expires after/ });
    const continues = screen.getByRole("radio", { name: /Continues until terminated/ });
    const years = screen.getAllByRole("spinbutton")[0];
    expect(expires).toBeChecked();
    expect(years).toBeEnabled();
    await user.click(continues);
    expect(continues).toBeChecked();
    expect(expires).not.toBeChecked();
    expect(years).toBeDisabled();
    await user.click(expires);
    expect(years).toBeEnabled();
  });

  it("term of confidentiality: number input is enabled only for 'Protected for'", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const protectedFor = screen.getByRole("radio", { name: /Protected for/ });
    const perpetuity = screen.getByRole("radio", { name: /In perpetuity/ });
    const years = screen.getAllByRole("spinbutton")[1];
    expect(years).toBeEnabled();
    await user.click(perpetuity);
    expect(years).toBeDisabled();
    await user.click(protectedFor);
    expect(years).toBeEnabled();
  });

  it("emits year changes and radio choices", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    const [termYears, confYears] = screen.getAllByRole("spinbutton");
    await user.clear(termYears);
    await user.type(termYears, "5");
    expect(last(onChange).termYears).toBe("5");
    await user.clear(confYears);
    await user.type(confYears, "7");
    expect(last(onChange).confidentialityYears).toBe("7");
    await user.click(screen.getByRole("radio", { name: /In perpetuity/ }));
    expect(last(onChange).confidentialityType).toBe("perpetuity");
    await user.click(screen.getByRole("radio", { name: /Continues until terminated/ }));
    expect(last(onChange).termType).toBe("continues");
  });

  it("effective date and signing dates emit ISO strings", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await user.clear(screen.getByLabelText("Effective date"));
    await user.type(screen.getByLabelText("Effective date"), "2027-01-02");
    expect(last(onChange).effectiveDate).toBe("2027-01-02");
    await user.type(screen.getAllByLabelText("Signing date")[1], "2027-01-03");
    expect(last(onChange).party2.date).toBe("2027-01-03");
  });

  it("cancels form submission so pressing Enter never reloads the page", () => {
    render(<Harness />);
    // fireEvent returns false when a listener called preventDefault()
    expect(fireEvent.submit(screen.getByRole("form", { name: "Mutual NDA details" }))).toBe(false);
  });
});
