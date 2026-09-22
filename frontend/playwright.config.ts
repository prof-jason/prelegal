import { defineConfig } from "@playwright/test";

const port = 3222;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    // Locally: use the installed Chrome (no browser download). In CI: Playwright's own Chromium
    // (`npx playwright install chromium`).
    channel: process.env.CI ? undefined : "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    // `next start` needs the Next.js server runtime, which `output: "export"`
    // (see next.config.ts) doesn't produce -- serve the static export instead.
    command: `npm run build && npx serve out -l ${port} -s`,
    url: `http://localhost:${port}`,
    // Always start a fresh build so the suite can never run against a stale server.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
