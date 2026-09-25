import type { Page } from "@playwright/test";
import documents from "./fixtures/documents.json" with { type: "json" };

/** Captured from the real backend; backend/tests/test_e2e_fixtures.py keeps them current. */
export { documents };

export const TEST_USER = { id: 1, email: "ada@example.com", created_at: "2026-09-25 12:00:00" };

/**
 * Start the page already signed in (see login.spec.ts for coverage of the
 * sign-in screen itself). This suite serves only the static frontend, so
 * autosaves are accepted by a mock, and returned for later assertions.
 */
export async function signIn(page: Page) {
  await page.addInitScript(
    (user) => localStorage.setItem("prelegal.session", JSON.stringify({ token: "e2e-token", user })),
    TEST_USER,
  );
  const saves: { id: string; body: Record<string, unknown> }[] = [];
  await page.route("**/api/saved-documents/*", (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    const id = new URL(route.request().url()).pathname.split("/").pop()!;
    const body = route.request().postDataJSON();
    saves.push({ id, body });
    return route.fulfill({ json: { id, ...body, created_at: "2026-09-25 12:00:00", updated_at: "2026-09-25 12:00:00" } });
  });
  return saves;
}

/** Mock the document list endpoint. */
export const mockDocumentList = (page: Page) =>
  page.route("**/api/documents", (route) => route.fulfill({ json: documents }));

/** Sign in, load the start screen and open the Mutual NDA creator. */
export async function openNda(page: Page) {
  const saves = await signIn(page);
  await mockDocumentList(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Mutual Non-Disclosure Agreement/ }).click();
  return saves;
}
