import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NdaCreator from "./NdaCreator";
import { defaultForm, today } from "@/lib/nda";

const buildNdaPdf = vi.fn();
vi.mock("@/lib/ndaPdf", () => ({ buildNdaPdf: (...a: unknown[]) => buildNdaPdf(...a) }));

const sendChatMessage = vi.fn();
const saveDocument = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    sendChatMessage: (...args: unknown[]) => sendChatMessage(...args),
    saveDocument: (...args: unknown[]) => saveDocument(...args),
  };
});

/** Autosave is debounced; allow for it. */
const SAVE_WAIT = { timeout: 3000 };

const doc = () => screen.getByRole("article");
const onChangeDocument = vi.fn();

beforeEach(() => {
  buildNdaPdf.mockReset();
  buildNdaPdf.mockResolvedValue(new Blob(["%PDF-1.3"], { type: "application/pdf" }));
  sendChatMessage.mockReset();
  saveDocument.mockReset().mockResolvedValue({});
  onChangeDocument.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("NdaCreator", () => {
  it("renders the form and the live document (named landmarks)", () => {
    render(<NdaCreator onChangeDocument={onChangeDocument} />);
    expect(screen.getByRole("heading", { level: 1, name: "Mutual NDA Creator" })).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Mutual NDA details" })).toBeInTheDocument();
    expect(doc()).toBeInTheDocument();
  });

  it("defaults the effective date to the visitor's local today (literal, fake clock, late evening)", () => {
    // 20:30 in Los Angeles on 15 June is already 16 June in UTC: a UTC-based default would be wrong.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 5, 15, 20, 30));
    try {
      render(<NdaCreator onChangeDocument={onChangeDocument} />);
      expect(screen.getByLabelText("Effective date")).toHaveValue("2026-06-15");
      expect(doc()).toHaveTextContent("June 15, 2026");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the draft / legal review disclaimer banner", () => {
    render(<NdaCreator onChangeDocument={onChangeDocument} />);
    const banner = screen.getByRole("complementary", { name: "Draft disclaimer" });
    expect(banner).toHaveTextContent("Draft — subject to legal review.");
    expect(banner).toHaveTextContent(/Mutual NDA v1\.0/);
  });

  it("warns about empty governing law / jurisdiction, and clears the warning once filled", async () => {
    const user = userEvent.setup();
    render(<NdaCreator onChangeDocument={onChangeDocument} />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("governing law and jurisdiction are still empty");
    await user.type(screen.getByLabelText(/Governing law/), "Delaware");
    expect(screen.getByRole("status")).toHaveTextContent("The jurisdiction is still empty");
    await user.type(screen.getByLabelText(/Jurisdiction/), "Dover, DE");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("warns about characters the PDF font cannot draw", async () => {
    const user = userEvent.setup();
    render(<NdaCreator onChangeDocument={onChangeDocument} />);
    await user.type(screen.getAllByLabelText("Company")[0], "株式会社");
    expect(screen.getByRole("status")).toHaveTextContent("may not appear correctly in the PDF");
    expect(screen.getByRole("status")).toHaveTextContent("株");
  });

  it("updates the document live as fields change", async () => {
    const user = userEvent.setup();
    render(<NdaCreator onChangeDocument={onChangeDocument} />);
    expect(doc()).toHaveTextContent("Governing Law: —");
    await user.type(screen.getByLabelText(/Governing law/), "Delaware");
    expect(doc()).toHaveTextContent("Governing Law: Delaware");
    expect(doc()).toHaveTextContent("laws of the State of Delaware");

    await user.type(screen.getAllByLabelText("Print name")[0], "Ann Lee");
    expect(within(screen.getByRole("table")).getByRole("row", { name: /Print Name Ann Lee/ })).toBeInTheDocument();
  });

  it("live-updates the term wording when radio / years change", async () => {
    const user = userEvent.setup();
    render(<NdaCreator onChangeDocument={onChangeDocument} />);
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
    render(<NdaCreator onChangeDocument={onChangeDocument} />);
    const date = screen.getByLabelText("Effective date");
    await user.clear(date);
    await user.type(date, "2030-07-04");
    expect(doc()).toHaveTextContent("July 4, 2030");
    await user.clear(date);
    expect(date).toHaveValue("");
    expect(doc()).not.toHaveTextContent("July 4, 2030");
  });

  it("offers a Change document control", async () => {
    const user = userEvent.setup();
    render(<NdaCreator onChangeDocument={onChangeDocument} />);
    await user.click(screen.getByRole("button", { name: "Change document" }));
    expect(onChangeDocument).toHaveBeenCalledTimes(1);
  });

  it("continues the document-picking conversation and sends it with the next turn", async () => {
    sendChatMessage.mockResolvedValue({ reply: "Great.", updates: {}, updatedFieldNames: [] });
    const user = userEvent.setup();
    const initialTurns = [
      { role: "user" as const, content: "I need an NDA with Globex" },
      { role: "assistant" as const, content: "I'll start on the Mutual NDA now." },
    ];
    render(<NdaCreator initialTurns={initialTurns} onChangeDocument={onChangeDocument} />);
    expect(screen.getByText("I need an NDA with Globex")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Message"), "It's for a partnership");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledTimes(1));
    expect(sendChatMessage.mock.calls[0][0].messages).toEqual([
      ...initialTurns,
      { role: "user", content: "It's for a partnership" },
    ]);
  });

  describe("AI chat drives the same state as manual edits", () => {
    it("a chat-applied patch updates the live preview and clears the missing-field warning", async () => {
      sendChatMessage.mockResolvedValue({
        reply: "Got it, I've set the governing law and jurisdiction.",
        updates: { governingLaw: "Delaware", jurisdiction: "Dover, DE" },
        updatedFieldNames: ["governingLaw", "jurisdiction"],
      });
      const user = userEvent.setup();
      render(<NdaCreator onChangeDocument={onChangeDocument} />);
      expect(screen.getByRole("status")).toHaveTextContent("governing law and jurisdiction are still empty");

      await user.type(screen.getByLabelText("Message"), "Delaware, Dover DE");
      await user.click(screen.getByRole("button", { name: "Send" }));

      await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
      expect(doc()).toHaveTextContent("Governing Law: Delaware");
      // The field summary (manual-edit path) reflects the same state.
      expect(screen.getByLabelText(/Governing law/)).toHaveValue("Delaware");
    });

    it("briefly highlights the fields the assistant just set", async () => {
      sendChatMessage.mockResolvedValue({
        reply: "Set.",
        updates: { governingLaw: "Texas" },
        updatedFieldNames: ["governingLaw"],
      });
      const user = userEvent.setup();
      render(<NdaCreator onChangeDocument={onChangeDocument} />);
      await user.type(screen.getByLabelText("Message"), "Texas");
      await user.click(screen.getByRole("button", { name: "Send" }));
      await waitFor(() =>
        expect(screen.getByLabelText(/Governing law/).closest("label")).toHaveAttribute("data-updated", "true"),
      );
    });

    it("a manual edit made after a chat update is preserved on the next chat turn's request", async () => {
      sendChatMessage.mockResolvedValue({ reply: "Ok.", updates: {}, updatedFieldNames: [] });
      const user = userEvent.setup();
      render(<NdaCreator onChangeDocument={onChangeDocument} />);
      await user.type(screen.getByLabelText(/Governing law/), "Nevada");
      await user.type(screen.getByLabelText("Message"), "hello");
      await user.click(screen.getByRole("button", { name: "Send" }));
      await waitFor(() => expect(sendChatMessage).toHaveBeenCalledTimes(1));
      expect(sendChatMessage.mock.calls[0][0].currentFields.governingLaw).toBe("Nevada");
    });
  });

  describe("Download PDF", () => {
    it("builds the PDF from the current form and saves it as Mutual-NDA.pdf", async () => {
      const user = userEvent.setup();
      // Capture rather than assert inside the mock: a throw there would be swallowed by download()'s try/catch.
      const clicked: { download: string; href: string; attached: boolean }[] = [];
      const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push({ download: this.download, href: this.href, attached: document.body.contains(this) });
      });
      render(<NdaCreator onChangeDocument={onChangeDocument} />);
      await user.type(screen.getByLabelText(/Governing law/), "Texas");
      await user.click(screen.getByRole("button", { name: "Download PDF" }));

      await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
      expect(buildNdaPdf).toHaveBeenCalledTimes(1);
      const passed = buildNdaPdf.mock.calls[0][0];
      expect(passed.governingLaw).toBe("Texas");
      expect(passed.effectiveDate).toBe(today()); // resolved default, never null
      expect(clicked).toEqual([{ download: "Mutual-NDA.pdf", href: "blob:mock", attached: true }]);
      // revoked later (not synchronously), and the helper anchor is cleaned up
      await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock"), { timeout: 3000 });
      expect(document.querySelector("a[download]")).toBeNull();
    });

    it("shows a busy state and disables the button while generating", async () => {
      let resolve!: (b: Blob) => void;
      buildNdaPdf.mockReturnValue(new Promise<Blob>((r) => (resolve = r)));
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
      const user = userEvent.setup();
      render(<NdaCreator onChangeDocument={onChangeDocument} />);
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
      render(<NdaCreator onChangeDocument={onChangeDocument} />);
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

describe("NdaCreator: saving", () => {
  it("doesn't save a document that was only opened", async () => {
    render(<NdaCreator onChangeDocument={onChangeDocument} initialTurns={[{ role: "user", content: "An NDA" }]} />);
    await new Promise((r) => setTimeout(r, 1200));
    expect(saveDocument).not.toHaveBeenCalled();
    expect(screen.getByText("Saves automatically as you work")).toBeInTheDocument();
  });

  it("autosaves edits (debounced) under one id, titled by the parties", async () => {
    const user = userEvent.setup();
    render(<NdaCreator onChangeDocument={onChangeDocument} />);
    const p1 = screen.getByRole("group", { name: "Party 1" });
    await user.type(within(p1).getByLabelText("Company"), "Acme");

    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1), SAVE_WAIT);
    const [id, content] = saveDocument.mock.calls[0];
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(content).toMatchObject({ documentId: "mutual-nda", title: "Mutual NDA — Acme", transcript: [] });
    expect(content.fields.party1.company).toBe("Acme");
    expect(await screen.findByText("All changes saved")).toBeInTheDocument();

    await user.type(within(screen.getByRole("group", { name: "Party 2" })).getByLabelText("Company"), "Globex");
    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(2), SAVE_WAIT);
    expect(saveDocument.mock.calls[1][0]).toBe(id);
    expect(saveDocument.mock.calls[1][1].title).toBe("Mutual NDA — Acme & Globex");
  });

  it("saves the chat transcript after each turn", async () => {
    sendChatMessage.mockResolvedValue({ reply: "Noted.", updates: {}, updatedFieldNames: [] });
    const user = userEvent.setup();
    render(<NdaCreator onChangeDocument={onChangeDocument} />);
    await user.type(screen.getByLabelText("Message"), "Hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(saveDocument).toHaveBeenCalled(), SAVE_WAIT);
    // An untouched effective date is saved as null ("today"), not frozen to the day it was drafted.
    expect(saveDocument.mock.lastCall![1].fields.effectiveDate).toBeNull();
    expect(saveDocument.mock.lastCall![1].transcript).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Noted." },
    ]);
  });

  it("reports a failed save and retries on request", async () => {
    saveDocument.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(<NdaCreator onChangeDocument={onChangeDocument} />);
    await user.type(screen.getByLabelText(/Governing law/), "Delaware");

    expect(await screen.findByText("Couldn't save your latest changes", {}, SAVE_WAIT)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("All changes saved", {}, SAVE_WAIT)).toBeInTheDocument();
    expect(saveDocument).toHaveBeenCalledTimes(2);
  });

  it("saves a pending change when closed mid-debounce", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<NdaCreator onChangeDocument={onChangeDocument} />);
    await user.type(screen.getByLabelText(/Governing law/), "Ohio");
    unmount();
    expect(saveDocument).toHaveBeenCalledTimes(1);
    expect(saveDocument.mock.calls[0][1].fields.governingLaw).toBe("Ohio");
  });

  it("reopens a saved draft: restores fields and chat, and keeps saving to the same id", async () => {
    const savedForm = { ...defaultForm(), purpose: "Evaluating a merger", party1: { ...defaultForm().party1, company: "Acme" } };
    const user = userEvent.setup();
    render(
      <NdaCreator
        onChangeDocument={onChangeDocument}
        initialTurns={[
          { role: "user", content: "NDA with Acme" },
          { role: "assistant", content: "Sure — what's it for?" },
        ]}
        saved={{ id: "11111111-1111-4111-8111-111111111111", fields: savedForm }}
      />,
    );
    expect(screen.getByLabelText(/^Purpose/)).toHaveValue("Evaluating a merger");
    expect(screen.getByText("NDA with Acme")).toBeInTheDocument();
    expect(screen.getByText(/Welcome back! Your draft is saved/)).toBeInTheDocument();
    expect(screen.getByText("All changes saved")).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Governing law/), "Utah");
    await waitFor(() => expect(saveDocument).toHaveBeenCalled(), SAVE_WAIT);
    expect(saveDocument.mock.calls[0][0]).toBe("11111111-1111-4111-8111-111111111111");
    expect(saveDocument.mock.calls[0][1].transcript).toHaveLength(2);
  });
});
