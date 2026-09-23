import type { DocumentDetail, DocumentSummary } from "@/lib/document";

const party = (n: 1 | 2, role: string) => ({
  role,
  fields: [
    { key: `party${n}_company`, label: "Company name", hint: `The ${role}'s company name.`, type: "text" as const, group: role },
    { key: `party${n}_name`, label: "Signer name", hint: `The ${role}'s signer name.`, type: "text" as const, group: role },
    { key: `party${n}_title`, label: "Signer title", hint: `The ${role}'s signer title.`, type: "text" as const, group: role },
    { key: `party${n}_address`, label: "Notice address", hint: `The ${role}'s notice address.`, type: "text" as const, group: role },
    { key: `party${n}_date`, label: "Signing date", hint: `The ${role}'s signing date.`, type: "date" as const, group: role },
  ],
});

/** A small SLA-shaped document, tagged the way GET /api/documents/{id} serves it. */
export const slaDetail = (): DocumentDetail => ({
  id: "sla",
  name: "Service Level Agreement",
  description: "Service levels for uptime and support response times.",
  terms: [
    { key: "target_uptime", label: "Target Uptime", hint: 'e.g. "99.9%".', type: "text", group: "Order Form" },
    { key: "support_channel", label: "Support Channel", hint: "Where requests go.", type: "text", group: "Order Form" },
    { key: "effective_date", label: "Effective Date", hint: "YYYY-MM-DD.", type: "date", group: "Key Terms" },
  ],
  parties: [party(1, "Provider"), party(2, "Customer")],
  markdown: [
    "# Service Level Agreement",
    "",
    '1. <span class="header_2" id="1">Uptime</span>',
    '    1. <span class="header_3" id="1.1">Target Uptime.</span>  <span class="coverpage_link" data-role="party1">Provider</span> will meet the <span class="orderform_link" data-field="target_uptime">Target Uptime</span> via the <span class="orderform_link" data-field="support_channel">Support Channel</span>.',
    "        a. Starting on the <span class=\"keyterms_link\" data-field=\"effective_date\">Effective Date</span>.",
    "2. <span class=\"header_2\" id=\"2\">Definitions</span>",
    '    1. <span id="2.1">**"SLA"**</span> means these terms, posted at <https://commonpaper.com/standards/service-level-agreement/2.0/>.',
  ].join("\n"),
});

export const documentSummaries = (): DocumentSummary[] => [
  { id: "mutual-nda", name: "Mutual Non-Disclosure Agreement", description: "Mutual NDA for two parties.", kind: "nda" },
  { id: "sla", name: "Service Level Agreement", description: "Service levels for uptime.", kind: "generic" },
];
