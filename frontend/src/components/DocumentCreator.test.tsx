import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DocumentCreator from "./DocumentCreator";
import { ChatApiError } from "@/lib/api";
import { slaDetail } from "@/test/documentFixture";

const buildDocumentPdf = vi.fn();
vi.mock("@/lib/documentPdf", () => ({ buildDocumentPdf: (...a: unknown[]) => buildDocumentPdf(...a) }));

const fetchDocument = vi.fn();
const sendDocumentChatMessage = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    fetchDocument: (...a: unknown[]) => fetchDocument(...a),
    sendDocumentChatMessage: (...a: unknown[]) => sendDocumentChatMessage(...a),
  };
});

const onChangeDocument = vi.fn();
const renderCreator = async (initialTurns?: { role: "user" | "assistant"; content: string }[]) => {
  render(<DocumentCreator documentId="sla" initialTurns={initialTurns} onChangeDocument={onChangeDocument} />);
  await screen.findByRole("heading", { level: 1, name: "Service Level Agreement" });
};

beforeEach(() => {
  fetchDocument.mockReset().mockResolvedValue(slaDetail());
  sendDocumentChatMessage.mockReset();
  buildDocumentPdf.mockReset().mockResolvedValue(new Blob(["%PDF-1.3"], { type: "application/pdf" }));
  onChangeDocument.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

describe("DocumentCreator", () => {
  it("loads the document and shows chat, a field per variable and party, and the preview", async () => {
    await renderCreator();
    expect(fetchDocument).toHaveBeenCalledWith("sla");
    expect(screen.getByText(/who are the two parties — the Provider and the Customer/)).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Service Level Agreement details" })).toBeInTheDocument();
    expect(screen.getByLabelText("Target Uptime")).toHaveValue("");
    expect(screen.getByRole("group", { name: "Customer" })).toBeInTheDocument();
    expect(screen.getByLabelText("Effective Date")).toHaveAttribute("type", "date");
    expect(screen.getByRole("article")).toHaveTextContent("[Target Uptime]");
    expect(screen.getByRole("status")).toHaveTextContent("3 of 3 key terms are still empty and will appear as [placeholders]: Target Uptime, Support Channel, Effective Date.");
  });

  it("shows a retryable error if the document can't be loaded", async () => {
    fetchDocument.mockRejectedValueOnce(new ChatApiError("network_error", "Could not reach the server.", 0));
    const user = userEvent.setup();
    render(<DocumentCreator documentId="sla" onChangeDocument={onChangeDocument} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Service Level Agreement" })).toBeInTheDocument();
  });

  it("applies the assistant's updates to the form and preview, and highlights them", async () => {
    sendDocumentChatMessage.mockResolvedValue({
      reply: "Got it, 99.9% uptime.",
      updates: { target_uptime: "99.9%", party1_company: "Acme Cloud" },
      updatedFieldNames: ["target_uptime", "party1_company"],
    });
    const user = userEvent.setup();
    await renderCreator();
    await user.type(screen.getByLabelText("Message"), "Acme Cloud, 99.9% uptime");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Got it, 99.9% uptime.")).toBeInTheDocument();
    expect(screen.getByLabelText("Target Uptime")).toHaveValue("99.9%");
    expect(screen.getByLabelText("Target Uptime").closest("label")).toHaveAttribute("data-updated", "true");
    expect(screen.getByRole("article")).toHaveTextContent("Provider: Acme Cloud");
    expect(screen.getByRole("status")).toHaveTextContent("2 of 3 key terms are still empty");
  });

  it("sends manual edits and the carried-over conversation with the next turn", async () => {
    sendDocumentChatMessage.mockResolvedValue({ reply: "Ok.", updates: {}, updatedFieldNames: [] });
    const user = userEvent.setup();
    const initialTurns = [
      { role: "user" as const, content: "I need an SLA" },
      { role: "assistant" as const, content: "I'll start on the Service Level Agreement now." },
    ];
    await renderCreator(initialTurns);
    expect(screen.getByText(/I'll use what you've told me so far/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Support Channel"), "support@acme.test");
    await user.type(screen.getByLabelText("Message"), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(sendDocumentChatMessage).toHaveBeenCalledTimes(1));
    const [id, req] = sendDocumentChatMessage.mock.calls[0];
    expect(id).toBe("sla");
    expect(req.currentFields.support_channel).toBe("support@acme.test");
    expect(req.messages).toEqual([...initialTurns, { role: "user", content: "hello" }]);
  });

  it("downloads a PDF named after the document", async () => {
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    const user = userEvent.setup();
    await renderCreator();
    await user.type(screen.getByLabelText("Target Uptime"), "99.5%");
    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(clicked).toEqual(["Service-Level-Agreement.pdf"]));
    expect(buildDocumentPdf.mock.calls[0][0].values.target_uptime).toBe("99.5%");
  });

  it("shows an alert when PDF generation fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    buildDocumentPdf.mockRejectedValueOnce(new Error("boom"));
    const user = userEvent.setup();
    await renderCreator();
    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("PDF could not be generated");
  });

  it("offers a Change document control", async () => {
    const user = userEvent.setup();
    await renderCreator();
    await user.click(screen.getByRole("button", { name: "Change document" }));
    expect(onChangeDocument).toHaveBeenCalledTimes(1);
  });
});
