import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("prelegal.auth", "1"));
  await page.goto("/");
});

test.describe("AI chat panel", () => {
  test("shows a greeting without contacting a backend", async ({ page }) => {
    await expect(page.getByText(/Let's put together your Mutual NDA/)).toBeVisible();
  });

  test("sending a message with no backend reachable shows a retryable error, not a crash", async ({ page }) => {
    // This suite's webServer only serves the static frontend (see
    // playwright.config.ts) -- no FastAPI backend runs alongside it, so a
    // sent chat message is expected to fail. This proves that failure
    // degrades gracefully in the UI instead of breaking the page.
    await page.getByLabel("Message").fill("Hello");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Hello")).toBeVisible();
    // Scoped to the chat panel's own error text (role="alert" also matches
    // Next.js's route announcer element elsewhere on the page).
    await expect(page.getByText(/could not reach the server|something went wrong/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    // The rest of the page (preview, other panels) still works.
    await expect(page.getByRole("article")).toBeVisible();
    await expect(page.getByLabel(/Governing law/)).toBeVisible();
  });
});
