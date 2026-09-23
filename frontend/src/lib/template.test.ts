import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { inlineText, parseInline, parseTemplate, type Inline, type Item } from "./template";

const templatesDir = resolve(__dirname, "../../../templates");
const GENERIC_TEMPLATES = [
  "AI-Addendum.md",
  "BAA.md",
  "CSA.md",
  "DPA.md",
  "design-partner-agreement.md",
  "psa.md",
  "Partnership-Agreement.md",
  "Pilot-Agreement.md",
  "sla.md",
  "Software-License-Agreement.md",
];

const allText = (items: Item[]): string =>
  items.map((i) => `${inlineText(i.content)} ${allText(i.children)}`).join(" ");
const countItems = (items: Item[]): number => items.reduce((n, i) => n + 1 + countItems(i.children), 0);

describe("parseInline", () => {
  it("parses a tagged field span, keeping its original text", () => {
    expect(parseInline('the <span class="orderform_link" data-field="subscription_period">Subscription Periods</span>.')).toEqual([
      { type: "text", text: "the " },
      { type: "field", key: "subscription_period", children: [{ type: "text", text: "Subscription Periods" }] },
      { type: "text", text: "." },
    ]);
  });

  it("renders role spans and id-only anchor spans as plain text", () => {
    expect(parseInline('<span class="coverpage_link" data-role="party1">Provider’s</span> duty <span id="4.1"></span>x')).toEqual([
      { type: "text", text: "Provider’s duty x" },
    ]);
  });

  it("turns header spans into headings", () => {
    expect(parseInline('<span class="header_3" id="1.1">Target Uptime.</span>  If')).toEqual([
      { type: "heading", children: [{ type: "text", text: "Target Uptime." }] },
      { type: "text", text: "  If" },
    ]);
  });

  it("nests spans inside bold and bold inside spans", () => {
    const nodes = parseInline('**CAP IS THE <span class="keyterms_link" data-field="general_cap_amount">General Cap Amount</span>.** <span id="4.1">**"SLA"**</span> means');
    expect(nodes[0]).toEqual({
      type: "bold",
      children: [
        { type: "text", text: "CAP IS THE " },
        { type: "field", key: "general_cap_amount", children: [{ type: "text", text: "General Cap Amount" }] },
        { type: "text", text: "." },
      ],
    });
    expect(nodes[2]).toEqual({ type: "bold", children: [{ type: "text", text: '"SLA"' }] });
  });

  it("parses markdown links and autolinks, adding https:// to a scheme-less URL", () => {
    const nodes = parseInline("see [Version 1.0](commonpaper.com/x/1.0) or <https://commonpaper.com/y/>.");
    expect(nodes).toEqual([
      { type: "text", text: "see " },
      { type: "link", href: "https://commonpaper.com/x/1.0", children: [{ type: "text", text: "Version 1.0" }] },
      { type: "text", text: " or " },
      { type: "link", href: "https://commonpaper.com/y/", children: [{ type: "text", text: "https://commonpaper.com/y/" }] },
      { type: "text", text: "." },
    ]);
  });

  it("never produces a non-web link", () => {
    const nodes = parseInline("[click](javascript:alert(1))");
    expect(JSON.stringify(nodes)).not.toContain('"link"');
  });

  it("tolerates unbalanced markup without throwing or leaking tags", () => {
    const nodes: Inline[] = parseInline('**open <span class="header_2">x</span></span> tail');
    expect(inlineText(nodes)).toBe("open x tail");
  });
});

describe("parseTemplate", () => {
  it("builds nested items with clause numbers from indentation", () => {
    const parsed = parseTemplate(
      [
        "# Service Level Agreement",
        "",
        '1. <span class="header_2" id="1">Uptime</span>',
        '    1. <span class="header_3" id="1.1">Target Uptime.</span>  Text.',
        "        a. Letter item.",
        "            i. Roman item.",
        "    2. Second.",
        "2. Next section",
      ].join("\n"),
    );
    expect(parsed.title).toBe("Service Level Agreement");
    expect(parsed.items.map((i) => i.label)).toEqual(["1.", "2."]);
    const [first] = parsed.items;
    expect(first.children.map((i) => i.label)).toEqual(["1.1", "1.2"]);
    expect(first.children[0].children[0].label).toBe("a.");
    expect(first.children[0].children[0].children[0].label).toBe("i.");
  });

  it.each(GENERIC_TEMPLATES)("parses %s completely, leaving no raw markup in the text", (file) => {
    const markdown = readFileSync(resolve(templatesDir, file), "utf8");
    const parsed = parseTemplate(markdown);
    expect(parsed.title).toBe(markdown.split(/\r?\n/)[0].replace(/^#\s+/, ""));
    const listLines = markdown.split(/\r?\n/).filter((l) => /^ *([0-9]+|[a-z]+)\.\s/.test(l)).length;
    expect(countItems(parsed.items)).toBe(listLines);
    const text = allText(parsed.items);
    expect(text).not.toMatch(/<\/?span|\*\*|\]\(/);
  });
});
