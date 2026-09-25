import { expect, test, type Page } from "@playwright/test";
import { mockDocumentList, TEST_USER } from "./helpers";

const START = "What would you like to draft?";

/** Mock the auth endpoints: `password` is the only one that works. */
async function mockAuth(page: Page, password = "hunter22") {
  const token = { access_token: "e2e-token", token_type: "bearer", user: TEST_USER };
  await page.route("**/api/auth/signup", (route) => route.fulfill({ status: 201, json: TEST_USER }));
  await page.route("**/api/auth/login", (route) =>
    route.request().postDataJSON().password === password
      ? route.fulfill({ json: token })
      : route.fulfill({ status: 401, json: { detail: "Invalid email or password" } }),
  );
}

const signInScreen = (page: Page) => page.getByRole("heading", { level: 1, name: "Welcome back" });

test.beforeEach(async ({ page }) => {
  await mockAuth(page);
  await mockDocumentList(page);
});

test("a fresh visit shows the sign-in screen, not the app", async ({ page }) => {
  await page.goto("/");
  await expect(signInScreen(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: START })).toHaveCount(0);
});

test("signing up creates an account and signs straight in, and a reload stays signed in", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => r.url().includes("/api/auth/") && requests.push(new URL(r.url()).pathname));
  await page.goto("/");
  await page.getByRole("tab", { name: "Sign up" }).click();
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Password", { exact: true }).fill("hunter22");
  await page.getByLabel("Confirm password").fill("hunter22");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { level: 1, name: START })).toBeVisible();
  await expect(page.getByText("ada@example.com")).toBeVisible();
  expect(requests).toEqual(["/api/auth/signup", "/api/auth/login"]);

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: START })).toBeVisible();
});

test("wrong credentials show the server's error", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Invalid" })).toHaveText("Invalid email or password");
  await expect(signInScreen(page)).toBeVisible();
});

test("signing out returns to the sign-in screen, and a reload stays signed out", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email").fill("ada@example.com");
  await page.getByLabel("Password").fill("hunter22");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(signInScreen(page)).toBeVisible();

  await page.reload();
  await expect(signInScreen(page)).toBeVisible();
});

test("a session the server no longer accepts (e.g. after a restart) returns to sign in", async ({ page }) => {
  await page.addInitScript(
    (user) => localStorage.setItem("prelegal.session", JSON.stringify({ token: "stale", user })),
    TEST_USER,
  );
  await page.unroute("**/api/documents");
  await page.route("**/api/documents", (route) => route.fulfill({ status: 401, json: { detail: "User no longer exists" } }));
  await page.goto("/");
  await expect(signInScreen(page)).toBeVisible();
});
