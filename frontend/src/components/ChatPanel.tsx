"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChatApiError, type ChatTurn } from "@/lib/api";
import styles from "./ChatPanel.module.css";

type Bubble = { id: string; role: "user" | "assistant"; content: string; failed?: boolean };

const GREETING_ID = "greeting";

let bubbleCounter = 0;
const nextId = () => `b${++bubbleCounter}`;

type Props = {
  /** Client-only opening message; never sent to the backend. */
  greeting: string;
  /** Earlier conversation to continue from (e.g. the document-picking chat),
   * shown above the greeting and sent to the backend with every turn. */
  initialTurns?: ChatTurn[];
  /** Sends the whole conversation so far and resolves to the assistant's
   * reply. Any other result handling (applying field updates, switching
   * documents) happens inside it, before the reply is shown. */
  onSend: (messages: ChatTurn[]) => Promise<string>;
  label?: string;
};

/** The chat UI shared by every assistant: transcript, composer, and a
 * retry flow that resends the same conversation after an error. */
export default function ChatPanel({ greeting, initialTurns = [], onSend, label = "Chat with the assistant" }: Props) {
  const [bubbles, setBubbles] = useState<Bubble[]>(() => [
    ...initialTurns.map((t) => ({ id: nextId(), ...t })),
    { id: GREETING_ID, role: "assistant", content: greeting },
  ]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ChatApiError | null>(null);
  const inputId = useId();
  const logRef = useRef<HTMLUListElement>(null);

  // Keep the newest message in view (the log scrolls once it outgrows its max height).
  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [bubbles, sending]);

  const toApiTurns = (list: Bubble[]): ChatTurn[] =>
    list.filter((b) => b.id !== GREETING_ID).map((b) => ({ role: b.role, content: b.content }));

  const runTurn = async (history: Bubble[]) => {
    setSending(true);
    setError(null);
    try {
      const reply = await onSend(toApiTurns(history));
      setBubbles((prev) => [
        ...prev.map((b) => (b.failed ? { ...b, failed: false } : b)),
        { id: nextId(), role: "assistant", content: reply },
      ]);
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
      <ul ref={logRef} className={styles.log} role="log" aria-live="polite" aria-label={label}>
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
