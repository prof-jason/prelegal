import { Document, Page, Text, View, StyleSheet, Link, pdf } from "@react-pdf/renderer";
import {
  type NdaForm,
  type Party,
  standardTerms,
  refValue,
  formatDate,
  termText,
  confidentialityText,
} from "@/lib/nda";

const s = StyleSheet.create({
  page: { padding: 56, fontSize: 10.5, lineHeight: 1.45, fontFamily: "Times-Roman" },
  h1: { fontSize: 20, textAlign: "center", marginBottom: 16, fontFamily: "Times-Bold" },
  h2: { fontSize: 9.5, textTransform: "uppercase", marginBottom: 6, fontFamily: "Times-Bold" },
  h3: { fontSize: 12, marginTop: 12, fontFamily: "Times-Bold" },
  hint: { color: "#666", fontSize: 9, fontFamily: "Times-Italic" },
  p: { marginTop: 4 },
  bold: { fontFamily: "Times-Bold" },
  under: { textDecoration: "underline" },
  table: { marginVertical: 14, borderTop: "1 solid #999", borderLeft: "1 solid #999" },
  row: { flexDirection: "row" },
  cell: { flex: 1, minHeight: 26, padding: 5, borderRight: "1 solid #999", borderBottom: "1 solid #999" },
  labelCell: { flex: 0.6, fontFamily: "Times-Bold", backgroundColor: "#f4f4f4" },
  clause: { marginBottom: 9, flexDirection: "row" },
  num: { width: 22 },
  attribution: { marginTop: 18, fontSize: 8.5, color: "#666" },
});

const rows: { label: string; get: (p: Party) => string }[] = [
  { label: "Signature", get: () => "" },
  { label: "Print Name", get: (p) => p.name },
  { label: "Title", get: (p) => p.title },
  { label: "Company", get: (p) => p.company },
  { label: "Notice Address", get: (p) => p.address },
  { label: "Date", get: (p) => formatDate(p.date) },
];

const Attribution = () => (
  <Text style={s.attribution}>
    Common Paper Mutual Non-Disclosure Agreement (Version 1.0) free to use under{" "}
    <Link src="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Link>.
  </Text>
);

function NdaPdf({ form }: { form: NdaForm }) {
  const field = (title: string, hint: string | null, value: string) => (
    <View wrap={false}>
      <Text style={s.h3}>{title}</Text>
      {hint && <Text style={s.hint}>{hint}</Text>}
      <Text style={s.p}>{value || "—"}</Text>
    </View>
  );
  return (
    <Document title="Mutual Non-Disclosure Agreement">
      <Page size="LETTER" style={s.page}>
        <Text style={s.h1}>Mutual Non-Disclosure Agreement</Text>
        <Text style={s.h2}>Using this Mutual Non-Disclosure Agreement</Text>
        <Text>
          This Mutual Non-Disclosure Agreement (the “MNDA”) consists of: (1) this Cover Page (“
          <Text style={s.bold}>Cover Page</Text>”) and (2) the Common Paper Mutual NDA Standard Terms Version 1.0 (“
          <Text style={s.bold}>Standard Terms</Text>”) identical to those posted at{" "}
          <Link src="https://commonpaper.com/standards/mutual-nda/1.0">commonpaper.com/standards/mutual-nda/1.0</Link>.
          Any modifications of the Standard Terms should be made on the Cover Page, which will control over conflicts
          with the Standard Terms.
        </Text>
        {field("Purpose", "How Confidential Information may be used", form.purpose)}
        {field("Effective Date", null, formatDate(form.effectiveDate))}
        {field("MNDA Term", "The length of this MNDA", termText(form))}
        {field("Term of Confidentiality", "How long Confidential Information is protected", confidentialityText(form))}
        {field(
          "Governing Law & Jurisdiction",
          null,
          `Governing Law: ${form.governingLaw || "—"}\nJurisdiction: ${form.jurisdiction || "—"}`,
        )}
        {field("MNDA Modifications", null, form.modifications || "None.")}
        <Text style={[s.p, { marginTop: 12 }]}>
          By signing this Cover Page, each party agrees to enter into this MNDA as of the Effective Date.
        </Text>
        <View style={s.table} wrap={false}>
          <View style={s.row}>
            <Text style={[s.cell, s.labelCell]} />
            <Text style={[s.cell, s.bold, { textAlign: "center" }]}>Party 1</Text>
            <Text style={[s.cell, s.bold, { textAlign: "center" }]}>Party 2</Text>
          </View>
          {rows.map((r) => (
            <View style={s.row} key={r.label}>
              <Text style={[s.cell, s.labelCell]}>{r.label}</Text>
              <Text style={s.cell}>{r.get(form.party1)}</Text>
              <Text style={s.cell}>{r.get(form.party2)}</Text>
            </View>
          ))}
        </View>
        <Attribution />
      </Page>

      <Page size="LETTER" style={s.page}>
        <Text style={s.h1}>Standard Terms</Text>
        {standardTerms.map((c, i) => (
          <View style={s.clause} key={c.title}>
            <Text style={s.num}>{i + 1}.</Text>
            <Text style={{ flex: 1 }}>
              <Text style={s.bold}>{c.title}</Text>.{" "}
              {c.body.map((seg, j) =>
                typeof seg === "string" ? seg : (
                  <Text key={j} style={s.under}>
                    {refValue(form, seg.ref)}
                  </Text>
                ),
              )}
            </Text>
          </View>
        ))}
        <Attribution />
      </Page>
    </Document>
  );
}

export const buildNdaPdf = (form: NdaForm) => pdf(<NdaPdf form={form} />).toBlob();
