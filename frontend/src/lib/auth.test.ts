import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { endSession, getToken, startSession, useAuthState } from "./auth";
import { testSession } from "@/test/session";

describe("auth session", () => {
  it("starts signed out", () => {
    expect(getToken()).toBeNull();
    expect(renderHook(() => useAuthState()).result.current).toEqual({ status: "guest" });
  });

  it("startSession() persists the token and user; endSession() clears them", () => {
    startSession(testSession());
    expect(getToken()).toBe("test-token");
    expect(JSON.parse(localStorage.getItem("prelegal.session")!).user.email).toBe("ada@example.com");

    endSession();
    expect(getToken()).toBeNull();
    expect(localStorage.getItem("prelegal.session")).toBeNull();
  });

  it("useAuthState follows sign in and sign out", () => {
    const { result } = renderHook(() => useAuthState());
    act(() => startSession(testSession()));
    expect(result.current).toEqual({ status: "authed", session: testSession() });
    act(() => endSession());
    expect(result.current).toEqual({ status: "guest" });
  });

  it("returns a stable state object between renders", () => {
    startSession(testSession());
    const { result, rerender } = renderHook(() => useAuthState());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });

  it.each(["not json", "{}", '{"token": 5}', '{"token": "t"}'])("treats a corrupt stored session (%s) as signed out", (raw) => {
    localStorage.setItem("prelegal.session", raw);
    expect(getToken()).toBeNull();
    expect(renderHook(() => useAuthState()).result.current).toEqual({ status: "guest" });
  });

  it("signals changes with an event other listeners can observe", () => {
    let fired = 0;
    const listener = () => fired++;
    window.addEventListener("prelegal-auth-changed", listener);
    startSession(testSession());
    endSession();
    window.removeEventListener("prelegal-auth-changed", listener);
    expect(fired).toBe(2);
  });
});
