"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import DocumentCreator from "@/components/DocumentCreator";
import MyDocuments from "@/components/MyDocuments";
import NdaCreator from "@/components/NdaCreator";
import StartScreen from "@/components/StartScreen";
import type { ChatTurn, SavedFields } from "@/lib/api";
import { NDA_ID } from "@/lib/document";

type View =
  | { kind: "start" }
  | { kind: "documents" }
  | {
      kind: "document";
      documentId: string;
      initialTurns: ChatTurn[];
      /** Set when reopening a saved draft. */
      saved?: { id: string; fields: SavedFields };
    };

/** Start by choosing a document (by chat or from the list) or reopening a saved one, then fill it in.
 * The Mutual NDA keeps its bespoke creator; every other document is template-driven. */
export default function Home() {
  const [view, setView] = useState<View>({ kind: "start" });
  const start = () => setView({ kind: "start" });

  let screen;
  if (view.kind === "start") {
    screen = <StartScreen onSelect={(documentId, initialTurns) => setView({ kind: "document", documentId, initialTurns })} />;
  } else if (view.kind === "documents") {
    screen = (
      <MyDocuments
        onNew={start}
        onOpen={(doc) =>
          setView({
            kind: "document",
            documentId: doc.documentId,
            initialTurns: doc.transcript,
            saved: { id: doc.id, fields: doc.fields },
          })
        }
      />
    );
  } else {
    // Keyed so switching documents (or drafts of the same document) always starts a fresh creator.
    const key = view.saved?.id ?? view.documentId;
    screen =
      view.documentId === NDA_ID ? (
        <NdaCreator key={key} initialTurns={view.initialTurns} saved={view.saved} onChangeDocument={start} />
      ) : (
        <DocumentCreator
          key={key}
          documentId={view.documentId}
          initialTurns={view.initialTurns}
          saved={view.saved}
          onChangeDocument={start}
        />
      );
  }

  return (
    <AppShell
      current={view.kind === "start" ? "new" : view.kind === "documents" ? "documents" : undefined}
      onNavigate={(section) => setView(section === "new" ? { kind: "start" } : { kind: "documents" })}
    >
      {screen}
    </AppShell>
  );
}
