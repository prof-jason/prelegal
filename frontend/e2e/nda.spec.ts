import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { pdfPages } from "../src/test/pdfText";

const fillEverything = async (page: Page) => {
  await page.getByLabel(/^Purpose/).fill("Exploring a joint venture.");
  await page.getByLabel("Effective date").fill("2026-03-05");
  await page.getByLabel(/Governing law/).fill("Delaware");
  await page.getByLabel(/Jurisdiction/).fill("New Castle, DE");
  await page.getByLabel(/MNDA modifications/).fill("Section 3 is deleted.");
  const p1 = page.getByRole("group", { name: "Party 1" });
  await p1.getByLabel("Print name").fill("Ann Lee");
  await p1.getByLabel("Title").fill("CEO");
  await p1.getByLabel("Company").fill("Acme Inc");
  await p1.getByLabel(/Notice address/).fill("ann@acme.test");
  await p1.getByLabel("Signing date").fill("2026-03-06");
  const p2 = page.getByRole("group", { name: "Party 2" });
  await p2.getByLabel("Print name").fill("Bo Chen");
  await p2.getByLabel("Title").fill("CTO");
  await p2.getByLabel("Company").fill("Globex LLC");
  await p2.getByLabel(/Notice address/).fill("1 Main St, Springfield");
  await p2.getByLabel("Signing date").fill("2026-03-07");
};

const downloadPdf = async (page: Page) => {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  const path = await download.path();
  const bytes = await readFile(path);
  return { download, bytes, pages: await pdfPages(new Blob([new Uint8Array(bytes)])) };
};

test.beforeEach(async ({ page }) => {
  // Skip the fake login screen (see login.spec.ts for coverage of it) so
  // this suite can keep testing the NDA flow directly, as before.
  await page.addInitScript(() => localStorage.setItem("prelegal.auth", "1"));
  await page.goto("/");
});

test.describe("page load", () => {
  test("shows title, form and document with sensible defaults", async ({ page }) => {
    await expect(page).toHaveTitle("Mutual NDA Creator");
    await expect(page.getByRole("heading", { level: 1, name: "Mutual NDA Creator" })).toBeVisible();
    await expect(page.getByRole("form", { name: "Mutual NDA details" })).toBeVisible();
    const doc = page.getByRole("article");
    await expect(doc.getByRole("heading", { level: 2, name: "Mutual Non-Disclosure Agreement" })).toBeVisible();
    await expect(doc).toContainText("Expires 1 year from Effective Date.");
    await expect(doc).toContainText("Evaluating whether to enter into a business relationship");
    await expect(doc.getByRole("listitem")).toHaveCount(11);
  });

  test("has exactly one <h1> and a not-legal-advice notice", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByText(/does not provide legal advice/)).toBeVisible();
  });

  test("loads with no console errors or hydration warnings", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => ["error", "warning"].includes(m.type()) && problems.push(`${m.type()}: ${m.text()}`));
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    await page.reload();
    await page.getByRole("article").waitFor();
    // let hydration + the client-only date settle
    await expect(page.getByLabel("Effective date")).not.toHaveValue("");
    expect(problems).toEqual([]);
  });
});

test.describe("default effective date uses the visitor's local day, not UTC", () => {
  // Pacific/Kiritimati is UTC+14. At 2026-06-15T12:00Z it is already 16 June there, so a UTC-based
  // default ("2026-06-15") would be wrong and this test would fail.
  test.use({ timezoneId: "Pacific/Kiritimati" });

  test("shows 2026-06-16 when it is 16 June locally but 15 June in UTC", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-06-15T12:00:00Z"));
    await page.goto("/");
    await expect(page.getByLabel("Effective date")).toHaveValue("2026-06-16");
    await expect(page.getByRole("article")).toContainText("June 16, 2026");
  });
});

test.describe("live preview", () => {
  test("every field is reflected in the document as you type", async ({ page }) => {
    await fillEverything(page);
    const doc = page.getByRole("article");
    await expect(doc).toContainText("Exploring a joint venture.");
    await expect(doc).toContainText("March 5, 2026");
    await expect(doc).toContainText("Governing Law: Delaware");
    await expect(doc).toContainText("Jurisdiction: New Castle, DE");
    await expect(doc).toContainText("Section 3 is deleted.");
    const table = doc.getByRole("table");
    await expect(table.getByRole("row", { name: /Print Name Ann Lee Bo Chen/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /Company Acme Inc Globex LLC/ })).toBeVisible();
    await expect(table.getByRole("row", { name: /Date March 6, 2026 March 7, 2026/ })).toBeVisible();
    await expect(doc.getByRole("listitem").nth(8)).toContainText("laws of the State of Delaware");
  });

  test("radio options change the wording and enable/disable the year inputs", async ({ page }) => {
    const doc = page.getByRole("article");
    const [termYears, confYears] = await page.getByRole("spinbutton").all();
    await termYears.fill("4");
    await expect(doc).toContainText("Expires 4 years from Effective Date.");

    await page.getByRole("radio", { name: /Continues until terminated/ }).check();
    await expect(termYears).toBeDisabled();
    await expect(doc).toContainText("Continues until terminated in accordance with the terms of the MNDA.");

    await confYears.fill("7");
    await expect(doc).toContainText("7 years from Effective Date, but in the case of trade secrets");
    await page.getByRole("radio", { name: /In perpetuity/ }).check();
    await expect(confYears).toBeDisabled();
    await expect(doc).toContainText("In perpetuity.");
    await expect(page.getByRole("article").getByRole("listitem").nth(4)).toContainText(
      "Term of Confidentiality (in perpetuity)",
    );
  });

  test("invalid year values are normalised in the document", async ({ page }) => {
    const doc = page.getByRole("article");
    const [termYears] = await page.getByRole("spinbutton").all();
    await termYears.fill("0");
    await expect(doc).toContainText("Expires 1 year from Effective Date.");
    await termYears.fill("-5");
    await expect(doc).toContainText("Expires 1 year from Effective Date.");
    await termYears.fill("");
    await expect(doc).toContainText("Expires 1 year from Effective Date.");
    await termYears.fill("2");
    await expect(doc).toContainText("Expires 2 years from Effective Date.");
  });

  test("HTML typed into fields is shown literally", async ({ page }) => {
    await page.getByLabel(/MNDA modifications/).fill('<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>');
    await expect(page.getByRole("article")).toContainText("<img src=x");
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(await page.locator("article img").count()).toBe(0);
  });

  test("pressing Enter in a field does not submit the form or reload the page", async ({ page }) => {
    await page.evaluate(() => ((window as unknown as { __sentinel: number }).__sentinel = 1));
    await page.getByLabel(/Governing law/).fill("Texas");
    await page.getByLabel(/Governing law/).press("Enter");
    // A native GET submit would add "?" to the URL and reset the JS context (dropping the sentinel).
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => (window as unknown as { __sentinel?: number }).__sentinel)).toBe(1);
    await expect(page.getByLabel(/Governing law/)).toHaveValue("Texas");
  });

  test("line breaks typed into a textarea are preserved in the preview", async ({ page }) => {
    await page.getByLabel(/MNDA modifications/).fill("First change\nSecond change");
    const p = page.getByRole("article").getByText("First change");
    await expect(p).toHaveCSS("white-space", "pre-wrap");
    expect(await p.evaluate((el) => (el as HTMLElement).innerText)).toContain("First change\nSecond change");
  });

  test("shows a warning while governing law / jurisdiction are empty, and for PDF-unsafe characters", async ({ page }) => {
    const status = page.getByRole("status");
    await expect(status).toContainText("governing law and jurisdiction are still empty");
    await page.getByLabel(/Governing law/).fill("Delaware");
    await page.getByLabel(/Jurisdiction/).fill("Dover, DE");
    await expect(status).toHaveCount(0);
    await page.getByRole("group", { name: "Party 1" }).getByLabel("Company").fill("株式会社");
    await expect(status).toContainText("may not appear correctly in the PDF");
  });

  test("clearing the effective date leaves it blank (does not snap back)", async ({ page }) => {
    const date = page.getByLabel("Effective date");
    await expect(date).not.toHaveValue("");
    await date.fill("");
    await expect(date).toHaveValue("");
    await expect(page.getByRole("article").getByRole("heading", { name: "Effective Date" }).locator("+ p")).toHaveText("—");
  });
});

test.describe("PDF download", () => {
  test("downloads Mutual-NDA.pdf containing the filled-in agreement", async ({ page }) => {
    await fillEverything(page);
    const { download, bytes, pages } = await downloadPdf(page);

    expect(download.suggestedFilename()).toBe("Mutual-NDA.pdf");
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages).toHaveLength(3);

    const text = pages.join(" ");
    for (const v of [
      "Exploring a joint venture.",
      "March 5, 2026",
      "Governing Law: Delaware",
      "Jurisdiction: New Castle, DE",
      "Section 3 is deleted.",
      "Ann Lee",
      "Bo Chen",
      "Acme Inc",
      "Globex LLC",
      "ann@acme.test",
      "1 Main St, Springfield",
      "March 6, 2026",
      "March 7, 2026",
      "laws of the State of Delaware",
    ]) {
      expect(text, v).toContain(v);
    }
    expect(text).not.toContain("[Governing Law]");
  });

  test("the PDF reflects the latest edits (not stale state)", async ({ page }) => {
    await page.getByLabel(/Governing law/).fill("Ohio");
    let { pages } = await downloadPdf(page);
    expect(pages.join(" ")).toContain("laws of the State of Ohio");

    await page.getByLabel(/Governing law/).fill("Oregon");
    await page.getByRole("radio", { name: /In perpetuity/ }).check();
    ({ pages } = await downloadPdf(page));
    const text = pages.join(" ");
    expect(text).toContain("laws of the State of Oregon");
    expect(text).not.toContain("State of Ohio");
    expect(text).toContain("In perpetuity.");
  });

  test("works with a completely untouched form", async ({ page }) => {
    const { pages } = await downloadPdf(page);
    const text = pages.join(" ");
    expect(text).toContain("[Governing Law]");
    expect(text).toContain("Expires 1 year from Effective Date.");
    expect(text).not.toMatch(/undefined|\[object|NaN/);
  });

  test("button returns to its idle state and can be used repeatedly", async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await downloadPdf(page);
      await expect(page.getByRole("button", { name: "Download PDF" })).toBeEnabled();
    }
    // (Next's route announcer also has role=alert, so target our error banner specifically)
    await expect(page.locator("p[role=alert]")).toHaveCount(0);
  });

  test("special characters survive into the PDF", async ({ page }) => {
    await page.getByRole("group", { name: "Party 1" }).getByLabel("Company").fill("Café Müller & Söhne");
    const { pages } = await downloadPdf(page);
    expect(pages.join(" ")).toContain("Café Müller & Söhne");
  });
});

test.describe("layout", () => {
  test("desktop: form and document sit side by side", async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    const form = await page.getByRole("form", { name: "Mutual NDA details" }).boundingBox();
    const doc = await page.getByRole("article").boundingBox();
    expect(form!.x + form!.width).toBeLessThanOrEqual(doc!.x);
    expect(Math.abs(form!.y - doc!.y)).toBeLessThan(40);
    await page.screenshot({ path: "e2e/.results/desktop.png", fullPage: true });
  });

  test("mobile: stacked, no horizontal scrolling, PDF still downloads", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await fillEverything(page);
    const form = await page.getByRole("form", { name: "Mutual NDA details" }).boundingBox();
    const doc = await page.getByRole("article").boundingBox();
    expect(doc!.y).toBeGreaterThan(form!.y + form!.height - 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: "e2e/.results/mobile.png", fullPage: true });
    const { bytes } = await downloadPdf(page);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("tablet width has no horizontal overflow either", async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("accessibility basics", () => {
  test("arrow keys move between the radios of a group (they share a name)", async ({ page }) => {
    const expires = page.getByRole("radio", { name: /Expires after/ });
    const continues = page.getByRole("radio", { name: /Continues until terminated/ });
    await expires.focus();
    await page.keyboard.press("ArrowDown");
    await expect(continues).toBeChecked();
    await expect(page.getByRole("article")).toContainText("Continues until terminated in accordance");
    await page.keyboard.press("ArrowUp");
    await expect(expires).toBeChecked();
  });

  test("radio sets are exposed as named groups", async ({ page }) => {
    await expect(page.getByRole("group", { name: "MNDA term" })).toBeVisible();
    await expect(page.getByRole("group", { name: "Term of confidentiality" })).toBeVisible();
  });

  test("every form control has an accessible name", async ({ page }) => {
    const controls = page.locator("form input, form textarea");
    const count = await controls.count();
    expect(count).toBeGreaterThan(15);
    for (let i = 0; i < count; i++) {
      const name = await controls.nth(i).evaluate((el) => {
        const labelled = (el as HTMLInputElement).labels?.[0]?.textContent?.trim();
        return labelled || el.getAttribute("aria-label") || "";
      });
      expect(name, `control #${i}`).not.toBe("");
    }
  });

  test("keyboard: Tab follows reading order through text fields; Enter on the button downloads", async ({ page }) => {
    // (The native date input has month/day/year sub-fields, so start after it.)
    await page.getByLabel(/Governing law/).focus();
    const order: string[] = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Tab");
      order.push(
        await page.evaluate(() => {
          const el = document.activeElement as HTMLInputElement;
          return el.labels?.[0]?.textContent?.trim() || el.getAttribute("aria-label") || el.tagName;
        }),
      );
    }
    expect(order[0]).toMatch(/^Jurisdiction/);
    expect(order[1]).toMatch(/^MNDA modifications/);
    expect(order[2]).toBe("Print name");
    await page.getByRole("button", { name: "Download PDF" }).focus();
    const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Enter")]);
    expect(download.suggestedFilename()).toBe("Mutual-NDA.pdf");
  });
});
