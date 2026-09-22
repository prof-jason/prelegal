"use client";

import { useId, useState } from "react";
import { login } from "@/lib/auth";
import styles from "./LoginScreen.module.css";

/**
 * A deliberately fake login/sign-up screen: whatever is submitted proceeds
 * straight into the app (see lib/auth.ts). Real auth endpoints already
 * exist on the backend (POST /api/auth/signup, /login) but nothing calls
 * them yet -- wiring them up is scoped to a future issue.
 */
export default function LoginScreen() {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const emailId = useId();
  const passwordId = useId();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login();
  };

  return (
    <main className={styles.main}>
      <form
        className={styles.card}
        onSubmit={handleSubmit}
        aria-label="Log in to Prelegal"
        // Fake login: any input proceeds. noValidate stops the browser's
        // built-in type="email" format check from blocking submission.
        noValidate
      >
        <h1 className={styles.title}>Prelegal</h1>
        <p className={styles.subtitle}>Draft legal agreements with an AI assistant.</p>

        <div className={styles.tabs} role="tablist" aria-label="Sign in or sign up">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signIn"}
            className={mode === "signIn" ? styles.tabActive : styles.tab}
            onClick={() => setMode("signIn")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signUp"}
            className={mode === "signUp" ? styles.tabActive : styles.tab}
            onClick={() => setMode("signUp")}
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
          autoComplete={mode === "signIn" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit" className={styles.submit}>
          {mode === "signIn" ? "Sign in" : "Create account"}
        </button>

        <p className={styles.notice}>
          This is a preview build: any email and password will sign you in. Full account
          sign-up is coming soon.
        </p>
      </form>
    </main>
  );
}
