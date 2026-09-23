import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NdaChatPanel from "./NdaChatPanel";
import { defaultForm } from "@/lib/nda";
import { ChatApiError } from "@/lib/api";

const sendChatMessage = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    sendChatMessage: (...args: unknown[]) => sendChatMessage(...args),
  };
});

beforeEach(() => {
  sendChatMessage.mockReset();
});

describe("NdaChatPanel", () => {
  it("renders a greeting on mount without calling the API", () => {
    render(<NdaChatPanel form={defaultForm()} onApplyPatch={vi.fn()} />);
    expect(screen.getByText(/Let's put together your Mutual NDA/)).toBeInTheDocument();
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it("sends the typed message and the current form as currentFields", async () => {
    sendChatMessage.mockResolvedValue({ reply: "Got it.", updates: {}, updatedFieldNames: [] });
    const user = userEvent.setup();
    const form = defaultForm();
    render(<NdaChatPanel form={form} onApplyPatch={vi.fn()} />);
    await user.type(screen.getByLabelText("Message"), "We're evaluating a partnership");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText("We're evaluating a partnership")).toBeInTheDocument();
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledTimes(1));
    expect(sendChatMessage).toHaveBeenCalledWith({
      messages: [{ role: "user", content: "We're evaluating a partnership" }],
      currentFields: form,
    });
  });

  it("shows a typing indicator while pending and disables input/button", async () => {
    let resolve!: (v: unknown) => void;
    sendChatMessage.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<NdaChatPanel form={defaultForm()} onApplyPatch={vi.fn()} />);
    await user.type(screen.getByLabelText("Message"), "hi");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Sending…" })).toBeDisabled();
    resolve({ reply: "ok", updates: {}, updatedFieldNames: [] });
    await waitFor(() => expect(screen.queryByText("Thinking…")).not.toBeInTheDocument());
  });

  it("appends the assistant's reply and calls onApplyPatch with updates on success", async () => {
    sendChatMessage.mockResolvedValue({
      reply: "Set governing law to Delaware.",
      updates: { governingLaw: "Delaware" },
      updatedFieldNames: ["governingLaw"],
    });
    const onApplyPatch = vi.fn();
    const user = userEvent.setup();
    render(<NdaChatPanel form={defaultForm()} onApplyPatch={onApplyPatch} />);
    await user.type(screen.getByLabelText("Message"), "Delaware");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Set governing law to Delaware.")).toBeInTheDocument();
    expect(onApplyPatch).toHaveBeenCalledWith({ governingLaw: "Delaware" }, ["governingLaw"]);
  });

  it("shows an error banner with Retry on failure, and does not call onApplyPatch", async () => {
    sendChatMessage.mockRejectedValue(new ChatApiError("llm_unavailable", "The assistant is unavailable.", 502));
    const onApplyPatch = vi.fn();
    const user = userEvent.setup();
    render(<NdaChatPanel form={defaultForm()} onApplyPatch={onApplyPatch} />);
    await user.type(screen.getByLabelText("Message"), "hi");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The assistant is unavailable.");
    expect(onApplyPatch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("visually marks the failed message itself, not just the banner", async () => {
    sendChatMessage.mockRejectedValue(new ChatApiError("llm_unavailable", "The assistant is unavailable.", 502));
    const user = userEvent.setup();
    render(<NdaChatPanel form={defaultForm()} onApplyPatch={vi.fn()} />);
    await user.type(screen.getByLabelText("Message"), "hi");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("alert");
    const failedBubble = screen.getByText("hi").closest("li")!;
    expect(failedBubble).toHaveAttribute("data-failed", "true");
    expect(failedBubble).toHaveTextContent("not sent");
  });

  it("clears the failed marker once a retry succeeds", async () => {
    sendChatMessage
      .mockRejectedValueOnce(new ChatApiError("llm_unavailable", "The assistant is unavailable.", 502))
      .mockResolvedValueOnce({ reply: "Got it now.", updates: {}, updatedFieldNames: [] });
    const user = userEvent.setup();
    render(<NdaChatPanel form={defaultForm()} onApplyPatch={vi.fn()} />);
    await user.type(screen.getByLabelText("Message"), "hi");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Got it now.");
    expect(screen.getByText("hi").closest("li")).not.toHaveAttribute("data-failed");
  });

  it("Retry resends the same message without retyping, and clears the error on success", async () => {
    sendChatMessage
      .mockRejectedValueOnce(new ChatApiError("llm_unavailable", "The assistant is unavailable.", 502))
      .mockResolvedValueOnce({ reply: "Got it now.", updates: {}, updatedFieldNames: [] });
    const user = userEvent.setup();
    render(<NdaChatPanel form={defaultForm()} onApplyPatch={vi.fn()} />);
    await user.type(screen.getByLabelText("Message"), "hi");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Got it now.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(sendChatMessage).toHaveBeenCalledTimes(2);
    // Both calls sent the same user message -- retry, not a new/duplicate send.
    expect(sendChatMessage.mock.calls[0][0].messages).toEqual(sendChatMessage.mock.calls[1][0].messages);
  });

  it("cannot send an empty or whitespace-only message", async () => {
    const user = userEvent.setup();
    render(<NdaChatPanel form={defaultForm()} onApplyPatch={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    await user.type(screen.getByLabelText("Message"), "   ");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(sendChatMessage).not.toHaveBeenCalled();
  });

  it("cannot send a second message while one is already in flight", async () => {
    let resolve!: (v: unknown) => void;
    sendChatMessage.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<NdaChatPanel form={defaultForm()} onApplyPatch={vi.fn()} />);
    await user.type(screen.getByLabelText("Message"), "first");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(screen.getByLabelText("Message")).toBeDisabled();
    resolve({ reply: "ok", updates: {}, updatedFieldNames: [] });
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledTimes(1));
  });
});
