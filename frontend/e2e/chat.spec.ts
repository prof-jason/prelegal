import { expect, test } from "@playwright/test";
import { openNda, skipLogin } from "./helpers";

test.describe("AI chat panel", () => {
  test("the start screen greets without contacting a chat backend", async ({ page }) => {
    await skipLogin(page);
    await page.goto("/");
    await expect(page.getByText(/What are you working on\?/)).toBeVisible();
  });

  test("with no backend at all, the start screen degrades to retryable errors, not a crash", async ({ page }) => {
    // This suite's webServer only serves the static frontend (see
    // playwright.config.ts), so with nothing mocked every API call fails.
    await skipLogin(page);
    await page.goto("/");
    await expect(page.getByText(/Couldn't load the document list/)).toBeVisible();
    await page.getByLabel("Message").fill("Hello");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: /^Hello — not sent$/ })).toBeVisible();
    await expect(page.getByText(/could not reach the server|something went wrong/i).last()).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(2);
  });

  test("the NDA chat shows its greeting and survives a failed send", async ({ page }) => {
    await openNda(page);
    await expect(page.getByText(/Let's put together your Mutual NDA/)).toBeVisible();
    await page.getByLabel("Message").fill("Hello");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("listitem").filter({ hasText: /^Hello/ })).toBeVisible();
    await expect(page.getByText(/could not reach the server|something went wrong/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    // The rest of the page (preview, other panels) still works.
    await expect(page.getByRole("article")).toBeVisible();
    await expect(page.getByLabel(/Governing law/)).toBeVisible();
  });
});
