import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  // The auth session (lib/auth.ts) lives in localStorage; without this it
  // leaks between test cases within a file. Some test files (e.g.
  // ndaPdf.test.tsx) opt into the "node" environment, which has no
  // localStorage at all, so guard for that.
  if (typeof localStorage !== "undefined") localStorage.clear();
});
