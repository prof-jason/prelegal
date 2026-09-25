"use client";

import { useEffect, useState, type ReactNode } from "react";
import { endSession, useAuthState } from "@/lib/auth";
import styles from "./AppShell.module.css";

export type Section = "new" | "documents";

type Props = {
  /** The nav item for the current screen (none while editing a document). */
  current?: Section;
  onNavigate: (section: Section) => void;
  children: ReactNode;
};

/** The signed-in app's frame: brand, main navigation, the signed-in user, and sign out. */
export default function AppShell({ current, onNavigate, children }: Props) {
  const auth = useAuthState();
  const email = auth.status === "authed" ? auth.session.user.email : null;

  // Signing out unmounts the current screen first, so a document's pending
  // autosave is sent (with the still-valid token) before the session ends.
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    if (signingOut) endSession();
  }, [signingOut]);

  const navItem = (section: Section, label: string) => (
    <button
      type="button"
      className={styles.navItem}
      aria-current={current === section ? "page" : undefined}
      onClick={() => onNavigate(section)}
    >
      {label}
    </button>
  );

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <button type="button" className={styles.brand} onClick={() => onNavigate("new")}>
          <span className={styles.logo} aria-hidden="true">
            P
          </span>
          Prelegal
        </button>
        <nav className={styles.nav} aria-label="Main">
          {navItem("new", "New document")}
          {navItem("documents", "My documents")}
        </nav>
        <div className={styles.account}>
          {email && (
            <span className={styles.email} title={email}>
              {email}
            </span>
          )}
          <button type="button" className={styles.signOut} onClick={() => setSigningOut(true)}>
            Sign out
          </button>
        </div>
      </header>
      {!signingOut && children}
    </div>
  );
}
