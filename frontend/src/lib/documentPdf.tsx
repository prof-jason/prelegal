import type { ReactNode } from "react";
import { Document, Font, Link, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import { formatDate } from "@/lib/nda";
import { groupTerms, partyValue, signatureRows, type DocumentDetail, type FieldValues } from "@/lib/document";
import { inlineText, type Inline, type Item, type ParsedTemplate } from "@/lib/template";

// Legal text and URLs must not be auto-hyphenated (same as lib/ndaPdf.tsx).
Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: { padding: "48 52", fontSize: 10.5, lineHeight: 1.4, fontFamily: "Times-Roman" },
  h1: { fontSize: 19, textAlign: "center", marginBottom: 12, fontFamily: "Times-Bold" },
  h2: { fontSize: 9.5, textTransform: "uppercase", marginBottom: 6, fontFamily: "Times-Bold" },
  h3: { fontSize: 11.5, marginTop: 9, marginBottom: 2, fontFamily: "Times-Bold" },
  p: { marginTop: 4 },
  bold: { fontFamily: "Times-Bold" },
  under: { textDecoration: "underline" },
  termRow: { flexDirection: "row", marginTop: 3 },
  termLabel: { width: "34%", fontFamily: "Times-Bold", paddingRight: 8 },
  termValue: { flex: 1 },
  table: { marginTop: 8, borderTop: "1 solid #999", borderLeft: "1 solid #999" },
  row: { flexDirection: "row" },
  cell: { flex: 1, minHeight: 24, padding: 5, borderRight: "1 solid #999", borderBottom: "1 solid #999" },
  labelCell: { flex: 0.6, fontFamily: "Times-Bold", backgroundColor: "#f4f4f4" },
  signatureRow: { minHeight: 40 },
  clause: { flexDirection: "row", marginBottom: 6 },
  num: { width: 28, fontFamily: "Times-Bold" },
  nested: { paddingLeft: 16, marginTop: 4 },
  attribution: { marginTop: 14, fontSize: 8.5, color: "#666" },
});

type Props = { detail: DocumentDetail; template: ParsedTemplate; values: FieldValues };

function DocumentPdf({ detail, template, values }: Props) {
  const renderInline = (nodes: Inline[]): ReactNode[] =>
    nodes.map((n, i) => {
      switch (n.type) {
        case "text":
          return n.text;
        case "bold":
        case "heading":
          return (
            <Text key={i} style={s.bold}>
              {renderInline(n.children)}
            </Text>
          );
        case "link":
          return (
            <Link key={i} src={n.href}>
              {renderInline(n.children)}
            </Link>
          );
        case "field":
          return values[n.key]?.trim() ? (
            <Text key={i} style={s.under}>
              {renderInline(n.children)}
            </Text>
          ) : (
            `[${inlineText(n.children)}]`
          );
      }
    });

  const renderItems = (items: Item[]): ReactNode =>
    items.map((item, i) => (
      <View key={i}>
        <View style={s.clause} wrap={item.children.length > 0}>
          <Text style={s.num}>{item.label}</Text>
          <Text style={{ flex: 1 }}>{renderInline(item.content)}</Text>
        </View>
        {item.children.length > 0 && <View style={s.nested}>{renderItems(item.children)}</View>}
      </View>
    ));

  return (
    <Document title={detail.name}>
      <Page size="LETTER" style={s.page}>
        <Text style={s.h1}>{detail.name}</Text>
        <Text style={s.h2}>Cover Page</Text>
        <Text>
          This {detail.name} consists of this Cover Page and the Common Paper {template.title} standard terms that
          follow. Capitalized terms used in the standard terms have the values given on this Cover Page.
        </Text>

        <Text style={s.h3}>Parties</Text>
        {detail.parties.map((p, i) => (
          <Text key={p.role} style={s.p}>
            {p.role}: {values[`party${i + 1}_company`] || "—"}
          </Text>
        ))}

        {groupTerms(detail).map(([group, fields]) => (
          <View key={group}>
            <Text style={s.h3} minPresenceAhead={40}>
              {group}
            </Text>
            {fields.map((f) => (
              <View key={f.key} style={s.termRow} wrap={false}>
                <Text style={s.termLabel}>{f.label}</Text>
                <Text style={s.termValue}>{(f.type === "date" ? formatDate(values[f.key]) : values[f.key]) || "—"}</Text>
              </View>
            ))}
          </View>
        ))}

        {/* Keep the sentence and the signature table together on one page. */}
        <View wrap={false} style={{ marginTop: 10 }}>
          <Text style={s.p}>By signing this Cover Page, each party agrees to enter into this {detail.name}.</Text>
          <View style={s.table}>
            <View style={s.row}>
              <Text style={[s.cell, s.labelCell]} />
              {detail.parties.map((p) => (
                <Text key={p.role} style={[s.cell, s.bold, { textAlign: "center" }]}>
                  {p.role}
                </Text>
              ))}
            </View>
            {signatureRows.map((r) => (
              <View style={[s.row, r.suffix ? {} : s.signatureRow]} key={r.label}>
                <Text style={[s.cell, s.labelCell]}>{r.label}</Text>
                {detail.parties.map((p, i) => (
                  <Text key={p.role} style={s.cell}>
                    {partyValue(values, i, r.suffix, formatDate)}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </View>
      </Page>

      <Page size="LETTER" style={s.page}>
        <Text style={s.h1}>{template.title}</Text>
        <Text style={[s.h2, { textAlign: "center" }]}>Standard Terms</Text>
        {renderItems(template.items)}
        <Text style={s.attribution}>
          Based on the Common Paper {template.title} standard terms, free to use under{" "}
          <Link src="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Link>.
        </Text>
      </Page>
    </Document>
  );
}

export const buildDocumentPdf = (props: Props) => pdf(<DocumentPdf {...props} />).toBlob();
