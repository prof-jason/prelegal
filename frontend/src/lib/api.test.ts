import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatApiError,
  deleteSavedDocument,
  fetchDocument,
  fetchDocuments,
  fetchSavedDocument,
  fetchSavedDocuments,
  logIn,
  saveDocument,
  sendChatMessage,
  sendDocumentChatMessage,
  sendIntakeMessage,
  signUp,
} from "./api";
import { getToken } from "./auth";
import { signIn, testSession } from "@/test/session";

const setPort = (port: string) => {
  Object.defineProperty(window, "location", {
    value: { ...window.location, port },
    writable: true,
  });
};

afterEach(() => {
  vi.unstubAllGlobals();
  setPort("3000"); // jsdom's default under Vitest
});

describe("sendChatMessage", () => {
  it("posts the transcript and current fields, and returns a parsed response", async () => {
    setPort("8000"); // isolate this test from base-URL resolution, covered separately below
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "Hi!", updates: { governingLaw: "Delaware" }, updated_field_names: ["governingLaw"] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendChatMessage({
      messages: [{ role: "user", content: "hi" }],
      currentFields: { governingLaw: "" },
    });

    expect(result).toEqual({
      reply: "Hi!",
      updates: { governingLaw: "Delaware" },
      updatedFieldNames: ["governingLaw"],
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/nda/chat");
    expect(JSON.parse(init.body)).toEqual({
      messages: [{ role: "user", content: "hi" }],
      current_fields: { governingLaw: "" },
    });
  });

  it("resolves to the dev backend origin when served from the Next.js dev server (port 3000)", async () => {
    setPort("3000");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ reply: "", updates: {}, updated_field_names: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    await sendChatMessage({ messages: [], currentFields: {} });
    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:8000/api/nda/chat");
  });

  it("resolves to a relative (same-origin) path outside the dev server", async () => {
    setPort("8000");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ reply: "", updates: {}, updated_field_names: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    await sendChatMessage({ messages: [], currentFields: {} });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/nda/chat");
  });

  it("throws a ChatApiError built from the response's {detail} body on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ detail: { error_code: "llm_rate_limited", message: "Slow down." } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendChatMessage({ messages: [], currentFields: {} })).rejects.toMatchObject({
      errorCode: "llm_rate_limited",
      message: "Slow down.",
      status: 429,
    });
  });

  it("falls back to a generic message when the error body isn't JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error("not json");
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendChatMessage({ messages: [], currentFields: {} })).rejects.toMatchObject({
      errorCode: "unknown_error",
      status: 502,
    });
  });

  it("wraps a thrown fetch (network failure) as a ChatApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    await expect(sendChatMessage({ messages: [], currentFields: {} })).rejects.toBeInstanceOf(ChatApiError);
    await expect(sendChatMessage({ messages: [], currentFields: {} })).rejects.toMatchObject({
      errorCode: "network_error",
      status: 0,
    });
  });
});

describe("document API", () => {
  const stubFetch = (body: unknown) => {
    setPort("8000");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("fetchDocuments GETs the document list", async () => {
    const fetchMock = stubFetch([{ id: "sla", name: "SLA", description: "d", kind: "generic" }]);
    expect(await fetchDocuments()).toEqual([{ id: "sla", name: "SLA", description: "d", kind: "generic" }]);
    expect(fetchMock.mock.calls[0]).toEqual(["/api/documents", { method: "GET", headers: {}, body: undefined }]);
  });

  it("fetchDocument GETs one document, URL-encoding its id", async () => {
    const fetchMock = stubFetch({ id: "sla" });
    await fetchDocument("a b");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/documents/a%20b");
  });

  it("sendIntakeMessage posts the transcript and maps document_id", async () => {
    const fetchMock = stubFetch({ reply: "SLA it is.", document_id: "sla" });
    const result = await sendIntakeMessage([{ role: "user", content: "SLA" }]);
    expect(result).toEqual({ reply: "SLA it is.", documentId: "sla" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/intake/chat");
    expect(JSON.parse(init.body)).toEqual({ messages: [{ role: "user", content: "SLA" }] });
  });

  it("sendDocumentChatMessage posts to the document's chat and maps the response", async () => {
    const fetchMock = stubFetch({ reply: "ok", updates: { target_uptime: "99%" }, updated_field_names: ["target_uptime"] });
    const result = await sendDocumentChatMessage("sla", { messages: [], currentFields: { target_uptime: "" } });
    expect(result).toEqual({ reply: "ok", updates: { target_uptime: "99%" }, updatedFieldNames: ["target_uptime"] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/documents/sla/chat");
    expect(JSON.parse(init.body)).toEqual({ messages: [], current_fields: { target_uptime: "" } });
  });

  it("a plain-string FastAPI detail (e.g. a 404) becomes the error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ detail: "No document" }) }));
    await expect(fetchDocument("nope")).rejects.toMatchObject({ errorCode: "unknown_error", message: "No document", status: 404 });
  });

  it("a validation-error (422) detail list falls back to the generic message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ detail: [{ msg: "bad", loc: ["body"] }] }) }),
    );
    await expect(fetchDocument("x")).rejects.toMatchObject({ message: "Something went wrong. Please try again." });
  });
});

describe("auth and session handling", () => {
  const stubResponses = (...responses: { status?: number; body?: unknown }[]) => {
    setPort("8000");
    const fetchMock = vi.fn();
    for (const { status = 200, body } of responses)
      fetchMock.mockResolvedValueOnce({ ok: status < 300, status, json: async () => body });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };
  const wireUser = { id: 1, email: "ada@example.com", created_at: "2026-09-25 12:00:00" };

  it("sends the session's bearer token with every request", async () => {
    signIn();
    const fetchMock = stubResponses({ body: [] });
    await fetchDocuments();
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: "Bearer test-token" });
  });

  it("a 401 on a signed-in request ends the session", async () => {
    signIn();
    stubResponses({ status: 401, body: { detail: "User no longer exists" } });
    await expect(fetchDocuments()).rejects.toMatchObject({ status: 401, message: "User no longer exists" });
    expect(getToken()).toBeNull();
  });

  it("logIn posts the credentials and returns the session", async () => {
    const fetchMock = stubResponses({ body: { access_token: "tok", token_type: "bearer", user: wireUser } });
    expect(await logIn("ada@example.com", "hunter22")).toEqual({ token: "tok", user: wireUser });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ email: "ada@example.com", password: "hunter22" });
  });

  it("signUp creates the account, then signs in to it", async () => {
    const fetchMock = stubResponses(
      { status: 201, body: wireUser },
      { body: { access_token: "tok", token_type: "bearer", user: wireUser } },
    );
    expect(await signUp("ada@example.com", "hunter22")).toEqual({ token: "tok", user: wireUser });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/auth/signup", "/api/auth/login"]);
  });

  it("a taken email surfaces the server's message", async () => {
    stubResponses({ status: 409, body: { detail: "Email already registered" } });
    await expect(signUp("ada@example.com", "hunter22")).rejects.toMatchObject({ status: 409, message: "Email already registered" });
  });

  it("wrong credentials don't touch the (absent) session", async () => {
    stubResponses({ status: 401, body: { detail: "Invalid email or password" } });
    await expect(logIn("ada@example.com", "nope")).rejects.toMatchObject({ message: "Invalid email or password" });
    expect(testSession().token).toBe("test-token"); // fixture sanity
    expect(getToken()).toBeNull();
  });
});

describe("saved documents API", () => {
  const wire = {
    id: "11111111-1111-4111-8111-111111111111",
    document_id: "sla",
    title: "SLA — Globex",
    created_at: "2026-09-25 10:00:00",
    updated_at: "2026-09-25 11:00:00",
    transcript: [{ role: "user", content: "hi" }],
    fields: { target_uptime: "99%" },
  };
  const stub = (body: unknown, status = 200) => {
    setPort("8000");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status, json: async () => body });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };
  const camel = {
    id: wire.id,
    documentId: "sla",
    title: "SLA — Globex",
    createdAt: "2026-09-25 10:00:00",
    updatedAt: "2026-09-25 11:00:00",
  };

  it("fetchSavedDocuments lists summaries", async () => {
    const fetchMock = stub([{ ...wire, transcript: undefined, fields: undefined }]);
    expect(await fetchSavedDocuments()).toEqual([camel]);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/saved-documents");
  });

  it("fetchSavedDocument returns the full document", async () => {
    stub(wire);
    expect(await fetchSavedDocument(wire.id)).toEqual({ ...camel, transcript: wire.transcript, fields: wire.fields });
  });

  it("saveDocument PUTs the content to the document's id", async () => {
    const fetchMock = stub(wire);
    await saveDocument(wire.id, { documentId: "sla", title: "SLA — Globex", transcript: [], fields: { a: "b" } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/saved-documents/${wire.id}`);
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ document_id: "sla", title: "SLA — Globex", transcript: [], fields: { a: "b" } });
  });

  it("deleteSavedDocument DELETEs and handles the empty 204", async () => {
    const fetchMock = stub(undefined, 204);
    await expect(deleteSavedDocument(wire.id)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
  });
});
