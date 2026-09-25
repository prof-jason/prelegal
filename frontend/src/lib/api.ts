import type { NdaFieldsPatch } from "@/lib/nda";
import type { DocumentDetail, DocumentSummary, FieldValues } from "@/lib/document";
import { endSession, getToken, type Session } from "@/lib/auth";

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

/** Fetch JSON from the backend (sending the session's bearer token, if any),
 * turning every failure into a ChatApiError carrying a user-presentable
 * message. A body means POST unless another method is given. */
async function requestJson<T>(path: string, { method, body }: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${resolveApiBase()}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ChatApiError("network_error", "Could not reach the server. Check your connection and try again.", 0);
  }

  // The session is no longer valid (expired, or its user was wiped by a
  // server restart): sign out, which returns the app to the sign-in screen.
  if (res.status === 401 && token) endSession();

  if (!res.ok) {
    let detail: { error_code?: string; message?: string } | undefined;
    try {
      const data = await res.json();
      // FastAPI's HTTPException puts either our {error_code, message} envelope or a plain string in `detail`.
      if (typeof data?.detail === "string") detail = { message: data.detail };
      else if (data?.detail && !Array.isArray(data.detail)) detail = data.detail;
    } catch {
      // Non-JSON error body (e.g. a proxy's plain-text 502 page) -- fall through to the generic message.
    }
    throw new ChatApiError(
      detail?.error_code ?? "unknown_error",
      detail?.message ?? "Something went wrong. Please try again.",
      res.status,
    );
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export async function sendChatMessage(req: {
  messages: ChatTurn[];
  currentFields: NdaFieldsPatch;
}): Promise<NdaChatResponse> {
  const data = await requestJson<{ reply: string; updates: NdaFieldsPatch; updated_field_names: string[] }>(
    "/api/nda/chat",
    { body: { messages: req.messages, current_fields: req.currentFields } },
  );
  return { reply: data.reply, updates: data.updates, updatedFieldNames: data.updated_field_names };
}

export const fetchDocuments = () => requestJson<DocumentSummary[]>("/api/documents");

export const fetchDocument = (id: string) => requestJson<DocumentDetail>(`/api/documents/${encodeURIComponent(id)}`);

export async function sendIntakeMessage(messages: ChatTurn[]): Promise<IntakeChatResponse> {
  const data = await requestJson<{ reply: string; document_id: string | null }>("/api/intake/chat", { body: { messages } });
  return { reply: data.reply, documentId: data.document_id };
}

export async function sendDocumentChatMessage(
  documentId: string,
  req: { messages: ChatTurn[]; currentFields: FieldValues },
): Promise<DocumentChatResponse> {
  const data = await requestJson<{ reply: string; updates: FieldValues; updated_field_names: string[] }>(
    `/api/documents/${encodeURIComponent(documentId)}/chat`,
    { body: { messages: req.messages, current_fields: req.currentFields } },
  );
  return { reply: data.reply, updates: data.updates, updatedFieldNames: data.updated_field_names };
}

/** Signs in, returning the session to keep (see lib/auth.ts). */
export async function logIn(email: string, password: string): Promise<Session> {
  const data = await requestJson<{ access_token: string; user: Session["user"] }>("/api/auth/login", {
    body: { email, password },
  });
  return { token: data.access_token, user: data.user };
}

/** Creates an account, then signs straight in to it. */
export async function signUp(email: string, password: string): Promise<Session> {
  await requestJson("/api/auth/signup", { body: { email, password } });
  return logIn(email, password);
}

/** A saved draft of one catalog document (backend/app/schemas.py's SavedDocumentSummary). */
export type SavedDocumentSummary = {
  id: string;
  /** The catalog document it's a draft of, e.g. "mutual-nda" or "sla". */
  documentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

/** The chosen document's field values, in its creator's own shape (NdaForm or FieldValues). */
export type SavedFields = Record<string, unknown>;

export type SavedDocument = SavedDocumentSummary & { transcript: ChatTurn[]; fields: SavedFields };

export type SavedDocumentContent = Pick<SavedDocument, "documentId" | "title" | "transcript" | "fields">;

type SavedDocumentWire = {
  id: string;
  document_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  transcript: ChatTurn[];
  fields: SavedFields;
};

const fromWireSummary = (d: SavedDocumentWire): SavedDocumentSummary => ({
  id: d.id,
  documentId: d.document_id,
  title: d.title,
  createdAt: d.created_at,
  updatedAt: d.updated_at,
});

const fromWire = (d: SavedDocumentWire): SavedDocument => ({ ...fromWireSummary(d), transcript: d.transcript, fields: d.fields });

const savedPath = (id: string) => `/api/saved-documents/${encodeURIComponent(id)}`;

export const fetchSavedDocuments = async (): Promise<SavedDocumentSummary[]> =>
  (await requestJson<SavedDocumentWire[]>("/api/saved-documents")).map(fromWireSummary);

export const fetchSavedDocument = async (id: string): Promise<SavedDocument> =>
  fromWire(await requestJson<SavedDocumentWire>(savedPath(id)));

/** Creates or replaces the saved document with this (client-generated) id. */
export const saveDocument = async (id: string, content: SavedDocumentContent): Promise<SavedDocument> =>
  fromWire(
    await requestJson<SavedDocumentWire>(savedPath(id), {
      method: "PUT",
      body: { document_id: content.documentId, title: content.title, transcript: content.transcript, fields: content.fields },
    }),
  );

export const deleteSavedDocument = (id: string): Promise<void> => requestJson(savedPath(id), { method: "DELETE" });
