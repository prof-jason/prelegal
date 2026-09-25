import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pdfPages } from "../src/test/pdfText";
import sla from "./fixtures/sla-document.json" with { type: "json" };
import { mockDocumentList, signIn } from "./helpers";

type Reply = Record<string, unknown>;

/** Mock the chat endpoints with a queue of replies, recording each request body. */
async function mockChat(page: Page, path: string, replies: Reply[]) {
  const requests: Reply[] = [];
  await page.route(`**${path}`, (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({ json: replies.shift() });
  });
  return requests;
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
  await mockDocumentList(page);
  await page.route("**/api/documents/sla", (route) => route.fulfill({ json: sla }));
  await page.goto("/");
});

test("the start screen lists every document", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1, name: "What would you like to draft?" })).toBeVisible();
  const cards = page.getByRole("region", { name: "Available documents" }).getByRole("button");
  await expect(cards).toHaveCount(11);
  await expect(cards.filter({ hasText: "Service Level Agreement" })).toBeVisible();
});

test("an unsupported request is declined with the closest alternative, then accepted", async ({ page }) => {
  const intake = await mockChat(page, "/api/intake/chat", [
    {
      reply: "We can't generate employment contracts. The closest is a Professional Services Agreement — want that?",
      document_id: null,
    },
    { reply: "I'll start on the Service Level Agreement now.", document_id: "sla" },
  ]);
  await page.getByLabel("Message").fill("I need an employment contract");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/can't generate employment contracts/)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "What would you like to draft?" })).toBeVisible();

  await page.getByLabel("Message").fill("Actually I need an SLA");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Service Level Agreement" })).toBeVisible();
  // The conversation carries over into the document's chat.
  await expect(page.getByText("Actually I need an SLA")).toBeVisible();
  expect(intake[1].messages).toHaveLength(3);
});

test("chatting fills an SLA, the preview updates, and the PDF contains the values", async ({ page }) => {
  const chat = await mockChat(page, "/api/documents/sla/chat", [
    {
      reply: "Got it: Acme Cloud (Provider), Globex (Customer), 99.9% uptime.",
      updates: { party1_company: "Acme Cloud", party2_company: "Globex LLC", target_uptime: "99.9%" },
      updated_field_names: ["party1_company", "party2_company", "target_uptime"],
    },
  ]);
  await page.getByRole("button", { name: /Service Level Agreement/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Service Level Agreement" })).toBeVisible();
  const doc = page.getByRole("article");
  await expect(doc).toContainText("[Target Uptime]");

  await page.getByLabel("Message").fill("Acme Cloud and Globex LLC, 99.9% uptime");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(/Got it: Acme Cloud/)).toBeVisible();
  await expect(page.getByRole("group", { name: "Provider" }).getByLabel("Company name")).toHaveValue("Acme Cloud");
  await expect(doc).toContainText("Provider: Acme Cloud");
  await expect(doc.locator("u", { hasText: "Target Uptime" }).first()).toBeVisible();
  expect(chat[0].current_fields).toMatchObject({ target_uptime: "" });

  // A manual edit goes straight into the preview too.
  await page.getByLabel("Support Channel").fill("support@acme.test");
  await expect(doc).toContainText("support@acme.test");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download PDF" }).click()]);
  expect(download.suggestedFilename()).toBe("Service-Level-Agreement.pdf");
  const pages = await pdfPages(new Blob([new Uint8Array(await readFile(await download.path()))]));
  const text = pages.join(" ");
  expect(text).toContain("Provider: Acme Cloud");
  expect(text).toContain("Target Uptime 99.9%");
  expect(text).toContain("Support Channel support@acme.test");
  expect(text).toContain("[Scheduled Downtime]");
});

test("typed markup stays literal text in the preview", async ({ page }) => {
  await page.getByRole("button", { name: /Service Level Agreement/ }).click();
  await page.getByLabel("Target Uptime").fill("<b>x</b><script>window.hacked=1</script>");
  await expect(page.getByRole("article")).toContainText("<b>x</b><script>");
  expect(await page.evaluate(() => (window as unknown as { hacked?: number }).hacked)).toBeUndefined();
});

test("Change document returns to the start screen from a document", async ({ page }) => {
  await page.getByRole("button", { name: /Service Level Agreement/ }).click();
  await page.getByRole("button", { name: "Change document" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "What would you like to draft?" })).toBeVisible();
});

test("the document view fits a phone-width screen without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.getByRole("button", { name: /Service Level Agreement/ }).click();
  await expect(page.getByRole("article")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
