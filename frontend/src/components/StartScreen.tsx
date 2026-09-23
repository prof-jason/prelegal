"use client";

import ChatPanel from "@/components/ChatPanel";
import { fetchDocuments, sendIntakeMessage, type ChatTurn } from "@/lib/api";
import { useRetryableFetch } from "@/lib/hooks";
import styles from "./StartScreen.module.css";
import workspace from "./Workspace.module.css";

const GREETING =
  "Hi! I can help you draft a legal agreement. What are you working on? Tell me a bit about the deal, or pick a document on the right.";

type Props = {
  /** A document was chosen, by chat (with the conversation so far) or by clicking its card. */
  onSelect: (documentId: string, turns: ChatTurn[]) => void;
};

/** Where every session starts: an intake chat that works out which document the user
 * needs (or offers the closest one we support), next to the full list of documents. */
export default function StartScreen({ onSelect }: Props) {
  const { data: documents, error: loadError, retry } = useRetryableFetch(fetchDocuments);

  const send = async (messages: ChatTurn[]) => {
    const { reply, documentId } = await sendIntakeMessage(messages);
    if (documentId) onSelect(documentId, [...messages, { role: "assistant", content: reply }]);
    return reply;
  };

  return (
    <main className={workspace.main}>
      <header className={workspace.header}>
        <div>
          <h1>What would you like to draft?</h1>
          <p>Chat with the assistant to find the right agreement, or choose one directly.</p>
        </div>
      </header>
      <p className={workspace.disclaimer}>
        Prelegal fills in Common Paper standard template agreements. It does not provide legal advice — have a
        qualified attorney review any agreement before you sign it.
      </p>
      <div className={styles.layout}>
        <section aria-label="Find a document">
          <ChatPanel greeting={GREETING} onSend={send} label="Chat with the assistant to choose a document" />
        </section>
        <section aria-labelledby="documents-heading">
          <h2 id="documents-heading" className={styles.heading}>
            Available documents
          </h2>
          {loadError && (
            <div role="alert" className={workspace.error}>
              Couldn&apos;t load the document list: {loadError}{" "}
              <button type="button" onClick={retry}>
                Retry
              </button>
            </div>
          )}
          {!documents && !loadError && <p role="status">Loading documents…</p>}
          {documents && (
            <ul className={styles.cards}>
              {documents.map((d) => (
                <li key={d.id}>
                  <button type="button" className={styles.card} onClick={() => onSelect(d.id, [])}>
                    <span className={styles.cardName}>{d.name}</span>
                    <span className={styles.cardDescription}>{d.description}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
