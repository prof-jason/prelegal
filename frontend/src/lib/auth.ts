"use client";

import { useSyncExternalStore } from "react";

// This is a FAKE login: no credentials are checked and no request is made
// to the backend's real (already-built, but not-yet-wired-up) /api/auth
// endpoints. It exists only to gate the "platform" behind a login-shaped
// screen, per issue #5. Swapping this out for the real flow later only
// touches this file and LoginScreen.
const STORAGE_KEY = "prelegal.auth";
const AUTH_EVENT = "prelegal-auth-changed";

function readStoredAuth(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // localStorage can throw (private browsing, blocked storage, etc).
    // Fail "logged out" rather than crash the app.
    return false;
  }
}

export function login(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Nothing to do if storage is unavailable; the in-memory event still
    // fires so the UI updates for this session.
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function logout(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See login(): storage failures shouldn't crash the app.
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

function subscribe(callback: () => void): () => void {
  window.addEventListener(AUTH_EVENT, callback);
  window.addEventListener("storage", callback); // keep tabs in sync
  return () => {
    window.removeEventListener(AUTH_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export type AuthState = "unknown" | "guest" | "authed";

/**
 * "unknown" only ever describes the server-rendered snapshot (matches the
 * prerendered static HTML so hydration doesn't mismatch); on the client it
 * immediately resolves to "guest" or "authed" based on localStorage.
 */
export function useAuthState(): AuthState {
  return useSyncExternalStore(
    subscribe,
    () => (readStoredAuth() ? "authed" : "guest"),
    () => "unknown",
  );
}
