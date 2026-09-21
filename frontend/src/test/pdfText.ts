import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Extract per-page text from a PDF Blob (test helper). */
export async function pdfPages(blob: Blob): Promise<string[]> {
  const data = new Uint8Array(await blob.arrayBuffer());
  const pdf = await getDocument({ data, useSystemFonts: true }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const content = await (await pdf.getPage(i)).getTextContent();
    pages.push(content.items.map((it) => ("str" in it ? it.str : "")).join(" ").replace(/\s+/g, " "));
  }
  return pages;
}
