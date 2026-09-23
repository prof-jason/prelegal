import { expect, test } from "@playwright/test";

const START = "What would you like to draft?";

test.describe("fake login gate", () => {
  test("a fresh visit shows the login screen, not the app", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Prelegal" })).toBeVisible();
    await expect(page.getByRole("heading", { name: START })).toHaveCount(0);
  });

  test("submitting any input proceeds into the app", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Email").fill("someone@example.com");
    await page.getByLabel("Password").fill("whatever");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { level: 1, name: START })).toBeVisible();
  });

  test("staying logged in survives a page reload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { level: 1, name: START })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: START })).toBeVisible();
  });

  test("logging out returns to the login screen, and a reload stays logged out", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page.getByRole("heading", { name: "Prelegal" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "Prelegal" })).toBeVisible();
  });
});
