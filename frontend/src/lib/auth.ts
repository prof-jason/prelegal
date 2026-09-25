"use client";

import { useMemo, useSyncExternalStore } from "react";

/** The signed-in user, as returned by POST /api/auth/login. */
export type SessionUser = { id: number; email: string; created_at: string };
export type Session = { token: string; user: SessionUser };

// The session lives in localStorage so it survives a reload. The backend's
// database is wiped on every restart, so a stored token can outlive its
// user: lib/api.ts ends the session on any 401, which returns the app to the
// sign-in screen.
const STORAGE_KEY = "prelegal.session";
const AUTH_EVENT = "prelegal-auth-changed";

function readRaw(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage can throw (private browsing, blocked storage, etc).
    // Fail "signed out" rather than crash the app.
    return null;
  }
}

function parseSession(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    return typeof session?.token === "string" && typeof session?.user?.email === "string" ? session : null;
  } catch {
    return null;
  }
}

function writeRaw(value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Nothing to do if storage is unavailable; the event below still fires,
    // but the session can't be kept.
  }
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export const startSession = (session: Session): void => writeRaw(JSON.stringify(session));

export const endSession = (): void => writeRaw(null);

/** The current bearer token, if signed in. */
export const getToken = (): string | null => parseSession(readRaw())?.token ?? null;

function subscribe(callback: () => void): () => void {
  window.addEventListener(AUTH_EVENT, callback);
  window.addEventListener("storage", callback); // keep tabs in sync
  return () => {
    window.removeEventListener(AUTH_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export type AuthState = { status: "unknown" } | { status: "guest" } | { status: "authed"; session: Session };

/**
 * "unknown" only ever describes the server-rendered snapshot (matches the
 * prerendered static HTML so hydration doesn't mismatch); on the client it
 * immediately resolves to "guest" or "authed" from localStorage.
 */
export function useAuthState(): AuthState {
  // Snapshot the raw string (stable between reads), and parse it separately.
  const raw = useSyncExternalStore(subscribe, readRaw, () => undefined);
  return useMemo(() => {
    if (raw === undefined) return { status: "unknown" };
    const session = parseSession(raw);
    return session ? { status: "authed", session } : { status: "guest" };
  }, [raw]);
}
