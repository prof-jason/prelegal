"use client";

import ChatPanel from "@/components/ChatPanel";
import { sendChatMessage, type ChatTurn } from "@/lib/api";
import type { NdaFieldsPatch, NdaForm } from "@/lib/nda";

const GREETING = "Hi! Let's put together your Mutual NDA. What's this agreement for, and who are the two parties?";

type Props = {
  form: NdaForm;
  /** Called with whatever the assistant extracted this turn, and the dotted
   * field names it set, so the caller can merge state and drive a brief
   * "just updated" highlight (see NdaFieldSummary). */
  onApplyPatch: (patch: NdaFieldsPatch, updatedFieldNames: string[]) => void;
  initialTurns?: ChatTurn[];
  onTurnsChange?: (turns: ChatTurn[]) => void;
  greeting?: string;
};

export default function NdaChatPanel({ form, onApplyPatch, initialTurns, onTurnsChange, greeting = GREETING }: Props) {
  const send = async (messages: ChatTurn[]) => {
    // `form` satisfies NdaFieldsPatch structurally (every NdaForm field is a
    // stricter, non-optional version of the corresponding patch field), so
    // the live form doubles as "everything confirmed so far" with no mapping step.
    const result = await sendChatMessage({ messages, currentFields: form });
    onApplyPatch(result.updates, result.updatedFieldNames);
    return result.reply;
  };
  return <ChatPanel greeting={greeting} initialTurns={initialTurns} onSend={send} onTurnsChange={onTurnsChange} />;
}
