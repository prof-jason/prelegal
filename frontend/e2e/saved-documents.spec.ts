import { expect, test } from "@playwright/test";
import sla from "./fixtures/sla-document.json" with { type: "json" };
import { mockDocumentList, openNda, signIn } from "./helpers";

test("edits to a new document are autosaved to one draft", async ({ page }) => {
  const saves = await openNda(page);
  await page.getByRole("group", { name: "Party 1" }).getByLabel("Company").fill("Acme Inc");
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.getByLabel(/Governing law/).fill("Delaware");
  await expect.poll(() => saves.at(-1)?.body.fields).toMatchObject({ governingLaw: "Delaware" });

  expect(new Set(saves.map((s) => s.id)).size).toBe(1);
  expect(saves.at(-1)!.body).toMatchObject({ document_id: "mutual-nda", title: "Mutual NDA — Acme Inc" });
});

test("My documents lists drafts and reopens one where it left off", async ({ page }) => {
  await signIn(page);
  await mockDocumentList(page);
  const draft = {
    id: "0d3c9b8e-2f7a-4a55-9d7e-6c1b2a3f4e5d",
    document_id: "sla",
    title: "Service Level Agreement — Globex",
    created_at: "2026-09-24 09:00:00",
    updated_at: "2026-09-25 17:30:00",
  };
  await page.route("**/api/saved-documents", (route) => route.fulfill({ json: [draft] }));
  await page.route(`**/api/saved-documents/${draft.id}`, (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          json: { ...draft, transcript: [{ role: "user", content: "An SLA for Globex" }], fields: { target_uptime: "99.95%" } },
        })
      : route.fallback(),
  );
  await page.route("**/api/documents/sla", (route) => route.fulfill({ json: sla }));

  await page.goto("/");
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "My documents" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "My documents" })).toBeVisible();
  await page.getByRole("button", { name: /^Service Level Agreement — Globex/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Service Level Agreement" })).toBeVisible();
  await expect(page.getByLabel("Target Uptime")).toHaveValue("99.95%");
  await expect(page.getByText("An SLA for Globex")).toBeVisible();
  await expect(page.getByText(/Welcome back! Your draft is saved/)).toBeVisible();
});
