import type { Page } from "@playwright/test";
import documents from "./fixtures/documents.json" with { type: "json" };

/** Captured from the real backend; backend/tests/test_e2e_fixtures.py keeps them current. */
export { documents };

/** Skip the fake login screen (see login.spec.ts for coverage of it). */
export const skipLogin = (page: Page) => page.addInitScript(() => localStorage.setItem("prelegal.auth", "1"));

/** This suite serves only the static frontend, so mock the document list endpoint. */
export const mockDocumentList = (page: Page) =>
  page.route("**/api/documents", (route) => route.fulfill({ json: documents }));

/** Log in, load the start screen and open the Mutual NDA creator. */
export async function openNda(page: Page) {
  await skipLogin(page);
  await mockDocumentList(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Mutual Non-Disclosure Agreement/ }).click();
}
