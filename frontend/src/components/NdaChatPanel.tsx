"use client";

import { useId, useState } from "react";
import { ChatApiError, sendChatMessage, type ChatTurn } from "@/lib/api";
import type { NdaFieldsPatch, NdaForm } from "@/lib/nda";
import styles from "./NdaChatPanel.module.css";

type Bubble = { id: string; role: "user" | "assistant"; content: string; failed?: boolean };

const GREETING: Bubble = {
  id: "greeting",
  role: "assistant",
  content: "Hi! Let's put together your Mutual NDA. What's this agreement for, and who are the two parties?",
};

let bubbleCounter = 0;
const nextId = () => `b${++bubbleCounter}`;

type Props = {
  form: NdaForm;
  /** Called with whatever the assistant extracted this turn, and the dotted
   * field names it set, so the caller can merge state and drive a brief
   * "just updated" highlight (see NdaFieldSummary). */
  onApplyPatch: (patch: NdaFieldsPatch, updatedFieldNames: string[]) => void;
};

export default function NdaChatPanel({ form, onApplyPatch }: Props) {
  const [bubbles, setBubbles] = useState<Bubble[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ChatApiError | null>(null);
  const inputId = useId();

  const toApiTurns = (list: Bubble[]): ChatTurn[] =>
    list.filter((b) => b.id !== GREETING.id).map((b) => ({ role: b.role, content: b.content }));

  const runTurn = async (history: Bubble[]) => {
    setSending(true);
    setError(null);
    try {
      // `form` satisfies NdaFieldsPatch structurally (every NdaForm field is a
      // stricter, non-optional version of the corresponding patch field), so
      // the live form doubles as "everything confirmed so far" with no mapping step.
      const result = await sendChatMessage({ messages: toApiTurns(history), currentFields: form });
      setBubbles((prev) => [
        ...prev.map((b) => (b.failed ? { ...b, failed: false } : b)),
        { id: nextId(), role: "assistant", content: result.reply },
      ]);
      onApplyPatch(result.updates, result.updatedFieldNames);
    } catch (e) {
      setError(e instanceof ChatApiError ? e : new ChatApiError("unknown_error", "Something went wrong. Please try again.", 0));
      setBubbles((prev) => prev.map((b, i) => (i === prev.length - 1 ? { ...b, failed: true } : b)));
    } finally {
      setSending(false);
    }
  };

  const send = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    const next = [...bubbles, { id: nextId(), role: "user" as const, content: text }];
    setBubbles(next);
    void runTurn(next);
  };

  const retry = () => {
    if (sending) return;
    void runTurn(bubbles);
  };

  return (
    <div className={styles.panel}>
      <ul className={styles.log} role="log" aria-live="polite" aria-label="Chat with the assistant">
        {bubbles.map((b) => (
          <li
            key={b.id}
            className={b.role === "user" ? styles.userBubble : styles.assistantBubble}
            data-failed={b.failed || undefined}
          >
            {b.content}
            {b.failed && <span className={styles.failedLabel}> — not sent</span>}
          </li>
        ))}
        {sending && (
          <li className={styles.assistantBubble} aria-hidden="true">
            <span className={styles.typing}>Thinking…</span>
          </li>
        )}
      </ul>

      {error && (
        <div role="alert" className={styles.error}>
          <p>{error.message}</p>
          <button type="button" onClick={retry} disabled={sending}>
            Retry
          </button>
        </div>
      )}

      <form
        className={styles.composer}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <label htmlFor={inputId} className={styles.srOnly}>
          Message
        </label>
        <input
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={sending}
          placeholder="Type a message…"
          autoComplete="off"
        />
        <button type="submit" disabled={sending || !draft.trim()} aria-busy={sending}>
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
