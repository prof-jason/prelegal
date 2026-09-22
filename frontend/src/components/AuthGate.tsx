"use client";

import type { ReactNode } from "react";
import { logout, useAuthState } from "@/lib/auth";
import LoginScreen from "@/components/LoginScreen";
import styles from "./AuthGate.module.css";

export default function AuthGate({ children }: { children: ReactNode }) {
  const authState = useAuthState();

  // "unknown" is the prerendered/pre-hydration snapshot; render nothing so
  // the static export's HTML matches the client's first render exactly
  // (same technique page.tsx already uses for the client-only "today").
  if (authState === "unknown") return null;

  if (authState === "guest") return <LoginScreen />;

  return (
    <div className={styles.wrapper}>
      <div className={styles.bar}>
        <span className={styles.brand}>Prelegal</span>
        <button type="button" className={styles.logout} onClick={logout}>
          Log out
        </button>
      </div>
      {children}
    </div>
  );
}
