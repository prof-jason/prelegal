import { startSession, type Session } from "@/lib/auth";

export const testSession = (email = "ada@example.com"): Session => ({
  token: "test-token",
  user: { id: 1, email, created_at: "2026-09-25 12:00:00" },
});

/** Start a signed-in session, as a successful sign-in would. */
export const signIn = (email?: string) => startSession(testSession(email));
