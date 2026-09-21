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
    command: `npm run build && npx next start -p ${port}`,
    url: `http://localhost:${port}`,
    // Always start a fresh build so the suite can never run against a stale server.
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
