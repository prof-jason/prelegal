import type { NdaFieldsPatch } from "@/lib/nda";
import type { DocumentDetail, DocumentSummary, FieldValues } from "@/lib/document";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type NdaChatResponse = {
  reply: string;
  updates: NdaFieldsPatch;
  updatedFieldNames: string[];
};

export type DocumentChatResponse = {
  reply: string;
  /** Only the fields the assistant set this turn, keyed by field key. */
  updates: FieldValues;
  updatedFieldNames: string[];
};

export type IntakeChatResponse = {
  reply: string;
  /** Set once the user has picked a document; null means keep chatting. */
  documentId: string | null;
};

export class ChatApiError extends Error {
  constructor(
    public errorCode: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Where the backend API lives, resolved at runtime rather than baked in at
 * build time: the frontend is a static export (see next.config.ts), so a
 * build-time env var can't differ per environment. In Docker the backend
 * serves this same static export same-origin (see backend/app/main.py), so
 * a relative path is correct there. `npm run dev` serves the frontend on
 * :3000 while the backend runs separately (uv run uvicorn ...) on :8000.
 */
function resolveApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.port === "3000" ? "http://localhost:8000" : "";
}

/** Fetch JSON from the backend, turning every failure into a ChatApiError
 * carrying a user-presentable message. */
async function requestJson<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(
      `${resolveApiBase()}${path}`,
      body === undefined
        ? undefined
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
  } catch {
    throw new ChatApiError("network_error", "Could not reach the server. Check your connection and try again.", 0);
  }

  if (!res.ok) {
    let detail: { error_code?: string; message?: string } | undefined;
    try {
      const data = await res.json();
      // FastAPI's HTTPException puts either our {error_code, message} envelope or a plain string in `detail`.
      detail = typeof data?.detail === "object" ? data.detail : undefined;
    } catch {
      // Non-JSON error body (e.g. a proxy's plain-text 502 page) -- fall through to the generic message.
    }
    throw new ChatApiError(
      detail?.error_code ?? "unknown_error",
      detail?.message ?? "Something went wrong. Please try again.",
      res.status,
    );
  }
  return res.json();
}

export async function sendChatMessage(req: {
  messages: ChatTurn[];
  currentFields: NdaFieldsPatch;
}): Promise<NdaChatResponse> {
  const data = await requestJson<{ reply: string; updates: NdaFieldsPatch; updated_field_names: string[] }>(
    "/api/nda/chat",
    { messages: req.messages, current_fields: req.currentFields },
  );
  return { reply: data.reply, updates: data.updates, updatedFieldNames: data.updated_field_names };
}

export const fetchDocuments = () => requestJson<DocumentSummary[]>("/api/documents");

export const fetchDocument = (id: string) => requestJson<DocumentDetail>(`/api/documents/${encodeURIComponent(id)}`);

export async function sendIntakeMessage(messages: ChatTurn[]): Promise<IntakeChatResponse> {
  const data = await requestJson<{ reply: string; document_id: string | null }>("/api/intake/chat", { messages });
  return { reply: data.reply, documentId: data.document_id };
}

export async function sendDocumentChatMessage(
  documentId: string,
  req: { messages: ChatTurn[]; currentFields: FieldValues },
): Promise<DocumentChatResponse> {
  const data = await requestJson<{ reply: string; updates: FieldValues; updated_field_names: string[] }>(
    `/api/documents/${encodeURIComponent(documentId)}/chat`,
    { messages: req.messages, current_fields: req.currentFields },
  );
  return { reply: data.reply, updates: data.updates, updatedFieldNames: data.updated_field_names };
}
