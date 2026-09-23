import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./page";
import { ChatApiError } from "@/lib/api";
import { documentSummaries, slaDetail } from "@/test/documentFixture";

const fetchDocuments = vi.fn();
const fetchDocument = vi.fn();
const sendIntakeMessage = vi.fn();
const sendDocumentChatMessage = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    fetchDocuments: (...a: unknown[]) => fetchDocuments(...a),
    fetchDocument: (...a: unknown[]) => fetchDocument(...a),
    sendIntakeMessage: (...a: unknown[]) => sendIntakeMessage(...a),
    sendDocumentChatMessage: (...a: unknown[]) => sendDocumentChatMessage(...a),
  };
});

beforeEach(() => {
  fetchDocuments.mockReset().mockResolvedValue(documentSummaries());
  fetchDocument.mockReset().mockResolvedValue(slaDetail());
  sendIntakeMessage.mockReset();
  sendDocumentChatMessage.mockReset();
});

const say = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.type(screen.getByLabelText("Message"), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
};

describe("Home: choosing a document", () => {
  it("starts with the intake chat and a card for every available document", async () => {
    render(<Home />);
    expect(screen.getByRole("heading", { level: 1, name: "What would you like to draft?" })).toBeInTheDocument();
    expect(screen.getByText(/What are you working on/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Service Level Agreement/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mutual Non-Disclosure Agreement/ })).toBeInTheDocument();
    expect(sendIntakeMessage).not.toHaveBeenCalled();
  });

  it("clicking a card opens that document", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(await screen.findByRole("button", { name: /Service Level Agreement/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Service Level Agreement" })).toBeInTheDocument();
    expect(fetchDocument).toHaveBeenCalledWith("sla");
  });

  it("clicking the Mutual NDA card opens the bespoke NDA creator", async () => {
    const user = userEvent.setup();
    render(<Home />);
    await user.click(await screen.findByRole("button", { name: /Mutual Non-Disclosure Agreement/ }));
    expect(screen.getByRole("heading", { level: 1, name: "Mutual NDA Creator" })).toBeInTheDocument();
    expect(fetchDocument).not.toHaveBeenCalled();
  });

  it("an unsupported request gets the assistant's alternative and stays on the start screen", async () => {
    sendIntakeMessage.mockResolvedValue({
      reply: "We can't generate employment contracts. The closest is a Professional Services Agreement — want that?",
      documentId: null,
    });
    const user = userEvent.setup();
    render(<Home />);
    await say(user, "I need an employment contract");
    expect(await screen.findByText(/can't generate employment contracts/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "What would you like to draft?" })).toBeInTheDocument();
  });

  it("when the intake chat picks a document, opens it and carries the conversation over", async () => {
    sendIntakeMessage.mockResolvedValue({ reply: "I'll start on the Service Level Agreement now.", documentId: "sla" });
    const user = userEvent.setup();
    render(<Home />);
    await say(user, "I need an SLA");
    expect(await screen.findByRole("heading", { level: 1, name: "Service Level Agreement" })).toBeInTheDocument();
    expect(screen.getByText("I need an SLA")).toBeInTheDocument();
    expect(screen.getByText("I'll start on the Service Level Agreement now.")).toBeInTheDocument();
    expect(sendIntakeMessage).toHaveBeenCalledWith([{ role: "user", content: "I need an SLA" }]);
  });

  it("Change document returns to a fresh start screen", async () => {
    sendIntakeMessage.mockResolvedValue({ reply: "NDA it is.", documentId: "mutual-nda" });
    const user = userEvent.setup();
    render(<Home />);
    await say(user, "An NDA please");
    await user.click(await screen.findByRole("button", { name: "Change document" }));
    expect(screen.getByRole("heading", { level: 1, name: "What would you like to draft?" })).toBeInTheDocument();
    expect(screen.queryByText("An NDA please")).toBeNull();
  });

  it("if the document list can't load, shows a retry while the chat still works", async () => {
    fetchDocuments.mockRejectedValueOnce(new ChatApiError("network_error", "Could not reach the server.", 0));
    const user = userEvent.setup();
    render(<Home />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
    expect(screen.getByLabelText("Message")).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Service Level Agreement/ })).toBeInTheDocument());
  });
});
