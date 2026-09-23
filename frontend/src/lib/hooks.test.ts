import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatApiError } from "@/lib/api";
import { useFieldHighlight, usePdfDownload, useRetryableFetch } from "./hooks";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useFieldHighlight", () => {
  it("highlights the given fields, then clears them after a couple of seconds", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFieldHighlight());
    act(() => result.current.flash(["a", "b"]));
    expect([...result.current.highlighted]).toEqual(["a", "b"]);
    act(() => vi.advanceTimersByTime(2500));
    expect(result.current.highlighted.size).toBe(0);
  });

  it("a new flash restarts the timer", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useFieldHighlight());
    act(() => result.current.flash(["a"]));
    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.flash(["b"]));
    act(() => vi.advanceTimersByTime(2000));
    expect([...result.current.highlighted]).toEqual(["b"]);
  });

  it("clears its timer on unmount", () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const { result, unmount } = renderHook(() => useFieldHighlight());
    act(() => result.current.flash(["a"]));
    unmount();
    expect(clear).toHaveBeenCalled();
  });
});

describe("usePdfDownload", () => {
  it("reports a failure as an error and resets busy", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => usePdfDownload(() => Promise.reject(new Error("boom")), "x.pdf"));
    await act(() => result.current.download());
    expect(result.current.error).toMatch(/could not be generated/);
    expect(result.current.busy).toBe(false);
  });
});

describe("useRetryableFetch", () => {
  it("loads once, reports an error, and refetches on retry", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new ChatApiError("network_error", "Could not reach the server.", 0))
      .mockResolvedValueOnce(["ok"]);
    const { result, rerender } = renderHook(() => useRetryableFetch(() => fetcher()));
    await waitFor(() => expect(result.current.error).toBe("Could not reach the server."));
    rerender(); // re-rendering with a new inline fetcher must not refetch
    expect(fetcher).toHaveBeenCalledTimes(1);
    act(() => result.current.retry());
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.data).toEqual(["ok"]));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("ignores a response that arrives after unmount", async () => {
    let resolve!: (v: string) => void;
    const { result, unmount } = renderHook(() => useRetryableFetch(() => new Promise<string>((r) => (resolve = r))));
    unmount();
    await act(async () => resolve("late"));
    expect(result.current.data).toBeNull();
  });
});
