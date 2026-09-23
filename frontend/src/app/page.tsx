"use client";

import { useState } from "react";
import DocumentCreator from "@/components/DocumentCreator";
import NdaCreator from "@/components/NdaCreator";
import StartScreen from "@/components/StartScreen";
import type { ChatTurn } from "@/lib/api";
import { NDA_ID } from "@/lib/document";

type View = { kind: "start" } | { kind: "document"; documentId: string; initialTurns: ChatTurn[] };

/** Start by choosing a document (by chat or from the list), then fill it in. The
 * Mutual NDA keeps its bespoke creator; every other document is template-driven. */
export default function Home() {
  const [view, setView] = useState<View>({ kind: "start" });
  const changeDocument = () => setView({ kind: "start" });

  if (view.kind === "start") {
    return <StartScreen onSelect={(documentId, initialTurns) => setView({ kind: "document", documentId, initialTurns })} />;
  }
  return view.documentId === NDA_ID ? (
    <NdaCreator initialTurns={view.initialTurns} onChangeDocument={changeDocument} />
  ) : (
    <DocumentCreator
      key={view.documentId}
      documentId={view.documentId}
      initialTurns={view.initialTurns}
      onChangeDocument={changeDocument}
    />
  );
}
