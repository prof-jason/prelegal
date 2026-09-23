import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatApiError, fetchDocument, fetchDocuments, sendChatMessage, sendDocumentChatMessage, sendIntakeMessage } from "./api";

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
    expect(fetchMock.mock.calls[0]).toEqual(["/api/documents", undefined]);
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

  it("a plain-string FastAPI detail (e.g. a 404) falls back to the generic message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({ detail: "No document" }) }));
    await expect(fetchDocument("nope")).rejects.toMatchObject({ errorCode: "unknown_error", status: 404 });
  });
});
