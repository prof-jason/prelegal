/**
 * Characters the PDF's built-in Times font (WinAnsi) can draw. Anything else in user text shows in the
 * browser preview but can come out blank or garbled in the PDF.
 */
const PDF_SAFE = /^[\u0009\u000A\u000D -~ -ÿŒœŠšŸŽžƒˆ˜–—‘-‚“-„†-•…‰‹›€™]$/;

/** Distinct characters across these strings that the PDF font cannot render. */
export const unsupportedPdfCharsIn = (texts: string[]): string[] => [
  ...new Set([...texts.join("")].filter((c) => !PDF_SAFE.test(c))),
];
