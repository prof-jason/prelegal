import { describe, expect, it } from "vitest";
import { login, logout } from "./auth";

// useAuthState (the useSyncExternalStore hook) is exercised through the
// components that consume it (AuthGate.test.tsx, LoginScreen.test.tsx);
// this file covers the plain localStorage read/write helpers directly.

describe("auth", () => {
  it("starts logged out", () => {
    expect(localStorage.getItem("prelegal.auth")).toBeNull();
  });

  it("login() persists to localStorage", () => {
    login();
    expect(localStorage.getItem("prelegal.auth")).toBe("1");
  });

  it("logout() clears localStorage", () => {
    login();
    logout();
    expect(localStorage.getItem("prelegal.auth")).toBeNull();
  });

  it("login() dispatches an event listeners can observe", () => {
    let fired = false;
    window.addEventListener("prelegal-auth-changed", () => {
      fired = true;
    });
    login();
    expect(fired).toBe(true);
  });
});
