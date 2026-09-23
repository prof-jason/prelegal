import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatApiError, sendChatMessage } from "./api";

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
