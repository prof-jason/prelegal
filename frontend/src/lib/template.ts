/**
 * Parses a Common Paper standard-terms template (templates/*.md, as served by
 * GET /api/documents/{id}) into a small tree that both the HTML preview
 * (components/DocumentPreview.tsx) and the PDF (lib/documentPdf.tsx) render.
 *
 * The templates use a narrow markdown subset: a "# Title" line, then nested
 * numbered/lettered list items (4 spaces per level, one item per line)
 * containing **bold**, [links](url), <autolinks> and <span> tags. The
 * backend tags every variable span with data-field="<key>" (a fillable
 * field) or data-role (a party role like "Provider", shown as plain text).
 *
 * Output is plain data rendered as text nodes -- never HTML -- so nothing in
 * a template or a user's field value can inject markup.
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; children: Inline[] }
  /** A section/clause heading (header_2 / header_3 span). */
  | { type: "heading"; children: Inline[] }
  | { type: "field"; key: string; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export type Item = {
  /** Display number: "1.", "1.1", "a.", "i." */
  label: string;
  content: Inline[];
  children: Item[];
};

export type ParsedTemplate = { title: string; items: Item[] };

const ITEM_RE = /^( *)([0-9]+|[a-z]+)\.\s+(.*)$/;
const TOKEN_RE = /\*\*|<span\b([^>]*)>|<\/span>|\[([^\]]*)\]\(([^)\s]*)\)|<(https?:\/\/[^>\s]+)>/g;

const attr = (attrs: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];

/** Only ever link to web URLs; the templates have one scheme-less URL, which gets https://. */
const safeHref = (url: string) => (/^https?:\/\//.test(url) ? url : /^[\w.-]+\.[a-z]{2,}\//i.test(url) ? `https://${url}` : "");

type Open = { node: Inline & { children: Inline[] }; closer: "span" | "bold" } | { node: null; closer: "span" };

export function parseInline(source: string): Inline[] {
  const root: Inline[] = [];
  const stack: Open[] = [];
  const target = () => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const node = stack[i].node;
      if (node) return node.children;
    }
    return root;
  };
  const pushText = (text: string) => {
    if (!text) return;
    const list = target();
    const last = list[list.length - 1];
    if (last?.type === "text") last.text += text;
    else list.push({ type: "text", text });
  };
  const open = (node: Inline & { children: Inline[] }, closer: "span" | "bold") => {
    target().push(node);
    stack.push({ node, closer });
  };

  let at = 0;
  for (const m of source.matchAll(TOKEN_RE)) {
    pushText(source.slice(at, m.index));
    at = m.index + m[0].length;
    const [token, spanAttrs, linkText, linkUrl, autolink] = m;
    if (token === "**") {
      const top = stack[stack.length - 1];
      if (top?.closer === "bold") stack.pop();
      else open({ type: "bold", children: [] }, "bold");
    } else if (spanAttrs !== undefined) {
      const cls = attr(spanAttrs, "class") ?? "";
      const field = attr(spanAttrs, "data-field");
      if (field) open({ type: "field", key: field, children: [] }, "span");
      else if (/^header_\d$/.test(cls)) open({ type: "heading", children: [] }, "span");
      else stack.push({ node: null, closer: "span" }); // role / anchor spans: just their text
    } else if (token === "</span>") {
      // Close the innermost span, and anything left unclosed inside it.
      const i = stack.map((s) => s.closer).lastIndexOf("span");
      if (i >= 0) stack.length = i;
    } else {
      const href = safeHref(linkUrl ?? autolink);
      const children = linkText !== undefined ? parseInline(linkText) : [{ type: "text" as const, text: autolink }];
      if (href) target().push({ type: "link", href, children });
      else target().push(...children);
    }
  }
  pushText(source.slice(at));
  return root;
}

export function parseTemplate(markdown: string): ParsedTemplate {
  let title = "";
  const items: Item[] = [];
  // stack[d] = the most recent item at depth d.
  const stack: Item[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^#\s+(.*)$/.exec(line);
    if (heading) {
      title ||= heading[1].trim();
      continue;
    }
    const m = ITEM_RE.exec(line);
    if (!m) continue;
    // Clamp so a malformed jump in indentation nests one level, never orphans an item.
    const depth = Math.min(Math.floor(m[1].length / 4), stack.length);
    const marker = m[2];
    const label = depth === 1 && stack[0] ? `${stack[0].label.replace(/\.$/, "")}.${marker}` : `${marker}.`;
    const item: Item = { label, content: parseInline(m[3]), children: [] };
    (depth === 0 ? items : stack[depth - 1].children).push(item);
    stack.length = depth;
    stack.push(item);
  }
  return { title, items };
}

/** Plain text of some inline nodes (used for "[Term]" placeholders). */
export const inlineText = (nodes: Inline[]): string =>
  nodes.map((n) => (n.type === "text" ? n.text : inlineText(n.children))).join("");
