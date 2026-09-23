import type { NdaFieldsPatch } from "@/lib/nda";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type NdaChatResponse = {
  reply: string;
  updates: NdaFieldsPatch;
  updatedFieldNames: string[];
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

export async function sendChatMessage(req: {
  messages: ChatTurn[];
  currentFields: NdaFieldsPatch;
}): Promise<NdaChatResponse> {
  let res: Response;
  try {
    res = await fetch(`${resolveApiBase()}/api/nda/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: req.messages, current_fields: req.currentFields }),
    });
  } catch {
    throw new ChatApiError("network_error", "Could not reach the server. Check your connection and try again.", 0);
  }

  if (!res.ok) {
    let detail: { error_code?: string; message?: string } | undefined;
    try {
      const body = await res.json();
      detail = body?.detail;
    } catch {
      // Non-JSON error body (e.g. a proxy's plain-text 502 page) -- fall through to the generic message.
    }
    throw new ChatApiError(
      detail?.error_code ?? "unknown_error",
      detail?.message ?? "Something went wrong. Please try again.",
      res.status,
    );
  }

  const data = await res.json();
  return { reply: data.reply, updates: data.updates, updatedFieldNames: data.updated_field_names };
}
