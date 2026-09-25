import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyDocuments, { formatSavedAt } from "./MyDocuments";
import { ChatApiError, type SavedDocumentSummary } from "@/lib/api";
import { documentSummaries } from "@/test/documentFixture";

const fetchSavedDocuments = vi.fn();
const fetchSavedDocument = vi.fn();
const deleteSavedDocument = vi.fn();
const fetchDocuments = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    fetchSavedDocuments: (...a: unknown[]) => fetchSavedDocuments(...a),
    fetchSavedDocument: (...a: unknown[]) => fetchSavedDocument(...a),
    deleteSavedDocument: (...a: unknown[]) => deleteSavedDocument(...a),
    fetchDocuments: (...a: unknown[]) => fetchDocuments(...a),
  };
});

const summary = (id: string, title: string, documentId = "sla"): SavedDocumentSummary => ({
  id,
  documentId,
  title,
  createdAt: "2026-09-24 09:00:00",
  updatedAt: "2026-09-25 17:30:00",
});

const onOpen = vi.fn();
const onNew = vi.fn();

beforeEach(() => {
  fetchSavedDocuments.mockReset().mockResolvedValue([summary("a", "SLA — Globex"), summary("b", "Mutual NDA — Acme", "mutual-nda")]);
  fetchSavedDocument.mockReset();
  deleteSavedDocument.mockReset().mockResolvedValue(undefined);
  fetchDocuments.mockReset().mockResolvedValue(documentSummaries());
  onOpen.mockReset();
  onNew.mockReset();
});

const rows = async () => within(await screen.findByRole("list", { name: "Saved documents" })).getAllByRole("listitem");

describe("MyDocuments", () => {
  it("lists each draft with its document type and last edit time", async () => {
    render(<MyDocuments onOpen={onOpen} onNew={onNew} />);
    const [first, second] = await rows();
    expect(first).toHaveTextContent("SLA — Globex");
    expect(first).toHaveTextContent(`Service Level Agreement · Edited ${formatSavedAt("2026-09-25 17:30:00")}`);
    expect(second).toHaveTextContent("Mutual Non-Disclosure Agreement");
  });

  it("formats SQLite UTC timestamps in local time", () => {
    // Tests run in America/Los_Angeles (vitest.global.ts): 17:30 UTC is 10:30 local.
    expect(formatSavedAt("2026-09-25 17:30:00")).toMatch(/10:30/);
  });

  it("opens a draft with its full content", async () => {
    const full = { ...summary("a", "SLA — Globex"), transcript: [], fields: {} };
    fetchSavedDocument.mockResolvedValue(full);
    const user = userEvent.setup();
    render(<MyDocuments onOpen={onOpen} onNew={onNew} />);
    await user.click(await screen.findByRole("button", { name: /^SLA — Globex/ }));
    expect(fetchSavedDocument).toHaveBeenCalledWith("a");
    expect(onOpen).toHaveBeenCalledWith(full);
  });

  it("shows an error if a draft can't be opened", async () => {
    fetchSavedDocument.mockRejectedValue(new ChatApiError("unknown_error", "Saved document not found", 404));
    const user = userEvent.setup();
    render(<MyDocuments onOpen={onOpen} onNew={onNew} />);
    await user.click(await screen.findByRole("button", { name: /^SLA — Globex/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent('Couldn\'t open "SLA — Globex": Saved document not found');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("deletes a draft only after confirmation", async () => {
    const user = userEvent.setup();
    render(<MyDocuments onOpen={onOpen} onNew={onNew} />);
    await user.click(await screen.findByRole("button", { name: "Delete SLA — Globex" }));
    expect(deleteSavedDocument).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Delete SLA — Globex" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleteSavedDocument).toHaveBeenCalledWith("a");
    expect(await rows()).toHaveLength(1);
    expect(screen.queryByText("SLA — Globex")).not.toBeInTheDocument();
  });

  it("shows an empty state that starts a new document", async () => {
    fetchSavedDocuments.mockResolvedValue([]);
    const user = userEvent.setup();
    render(<MyDocuments onOpen={onOpen} onNew={onNew} />);
    expect(await screen.findByRole("heading", { name: "No documents yet" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start a document" }));
    expect(onNew).toHaveBeenCalled();
  });

  it("offers a retry if the list fails to load", async () => {
    fetchSavedDocuments.mockRejectedValueOnce(new ChatApiError("network_error", "Could not reach the server.", 0));
    const user = userEvent.setup();
    render(<MyDocuments onOpen={onOpen} onNew={onNew} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await rows()).toHaveLength(2);
  });
});
