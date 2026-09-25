"use client";

import { useId, useState } from "react";
import { ChatApiError, logIn, signUp } from "@/lib/api";
import { startSession } from "@/lib/auth";
import styles from "./LoginScreen.module.css";

type Mode = "signIn" | "signUp";

// Mirrors the backend's checks (backend/app/schemas.py), so most mistakes are caught before a round trip.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 8;

function validate(mode: Mode, email: string, password: string, confirm: string): string | null {
  if (!EMAIL_RE.test(email.trim())) return "Enter a valid email address.";
  if (mode === "signIn") return password ? null : "Enter your password.";
  if (password.length < MIN_PASSWORD) return `Choose a password of at least ${MIN_PASSWORD} characters.`;
  if (password !== confirm) return "The passwords don't match.";
  return null;
}

const FEATURES = [
  "Describe your deal in plain English — the assistant fills in the agreement",
  "11 Common Paper standard agreements, from NDAs to cloud service terms",
  "Every draft saved to your account, ready to pick up where you left off",
];

/** Sign in or create an account. On success the session is stored and AuthGate shows the app. */
export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailId = useId();
  const passwordId = useId();
  const confirmId = useId();
  const signingUp = mode === "signUp";

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = validate(mode, email, password, confirm);
    if (invalid) return setError(invalid);

    setBusy(true);
    setError(null);
    try {
      startSession(await (signingUp ? signUp : logIn)(email.trim(), password));
    } catch (err) {
      setError(err instanceof ChatApiError ? err.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  return (
    <main className={styles.main}>
      <section className={styles.hero} aria-label="About Prelegal">
        <span className={styles.brand}>Prelegal</span>
        <p className={styles.tagline}>Draft legal agreements in minutes, not days.</p>
        <ul className={styles.features}>
          {FEATURES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>

      <section className={styles.formSide}>
        <form
          className={styles.card}
          onSubmit={handleSubmit}
          aria-label={signingUp ? "Create an account" : "Sign in"}
          // Validation is ours (above), with messages that match the backend's rules.
          noValidate
        >
          <h1 className={styles.title}>{signingUp ? "Create your account" : "Welcome back"}</h1>
          <p className={styles.subtitle}>
            {signingUp ? "Start drafting agreements with an AI assistant." : "Sign in to continue to your drafts."}
          </p>

          <div className={styles.tabs} role="tablist" aria-label="Sign in or sign up">
            <button
              type="button"
              role="tab"
              aria-selected={!signingUp}
              className={signingUp ? styles.tab : styles.tabActive}
              onClick={() => switchMode("signIn")}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={signingUp}
              className={signingUp ? styles.tabActive : styles.tab}
              onClick={() => switchMode("signUp")}
            >
              Sign up
            </button>
          </div>

          <label className={styles.label} htmlFor={emailId}>
            Email
          </label>
          <input
            id={emailId}
            className={styles.input}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className={styles.label} htmlFor={passwordId}>
            Password
          </label>
          <input
            id={passwordId}
            className={styles.input}
            type="password"
            autoComplete={signingUp ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {signingUp && (
            <>
              <label className={styles.label} htmlFor={confirmId}>
                Confirm password
              </label>
              <input
                id={confirmId}
                className={styles.input}
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <p className={styles.hint}>At least {MIN_PASSWORD} characters.</p>
            </>
          )}

          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}

          <button type="submit" className={styles.submit} disabled={busy} aria-busy={busy}>
            {busy ? (signingUp ? "Creating account…" : "Signing in…") : signingUp ? "Create account" : "Sign in"}
          </button>

          <p className={styles.notice}>
            Prelegal drafts documents for review; it does not provide legal advice. Accounts and drafts are kept only
            until the server restarts.
          </p>
        </form>
      </section>
    </main>
  );
}
