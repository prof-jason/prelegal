"use client";

import type { ReactNode } from "react";
import { useAuthState } from "@/lib/auth";
import LoginScreen from "@/components/LoginScreen";

/** Shows the sign-in screen until there's a session, then the app. */
export default function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuthState();

  // "unknown" is the prerendered/pre-hydration snapshot; render nothing so
  // the static export's HTML matches the client's first render exactly.
  if (auth.status === "unknown") return null;
  if (auth.status === "guest") return <LoginScreen />;
  return children;
}
