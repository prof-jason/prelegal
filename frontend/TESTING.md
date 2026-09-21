# Testing

## Automated

| Command | What it runs |
| --- | --- |
| `npm test` | Vitest: unit, component and PDF-content tests (jsdom / node) |
| `npm run test:e2e` | Playwright against a production build, using the locally installed Chrome |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` / ESLint |

- **`src/lib/nda.test.ts`** – date/year helpers, cover-page wording, placeholder handling, and a fidelity test that
  compares every standard-terms clause word for word with `../templates/Mutual-NDA.md`.
- **`src/components/*.test.tsx`, `src/app/page.test.tsx`** – form fields, radio/number-input coupling, live preview,
  HTML-escaping, download button busy/error states (PDF builder mocked).
- **`src/lib/ndaPdf.test.tsx`** – generates the real PDF in Node and reads its text back with pdf.js: values present,
  clause order, no hyphenation, 3-page layout, signature table never split from its lead-in, no stranded clause number,
  accents/long text/non-Latin input do not crash.
- **`e2e/nda.spec.ts`** – full flows in Chrome: fill every field, live preview, PDF download contents, mobile/tablet
  overflow, console cleanliness (no hydration warnings), keyboard use, control labelling.

Vitest pins `TZ=America/Los_Angeles` so local-vs-UTC date bugs are caught on any machine.

## Manual checklist

Run `npm run build && npx next start` and open http://localhost:3000 in Chrome. Last run: 2026-09-21, Chrome, macOS.

| # | Step | Expected | Result |
| --- | --- | --- | --- |
| 1 | Load the page | Form left, agreement right; effective date = today; "Expires 1 year"; no console errors | Pass |
| 2 | Type a governing law | Appears live in the cover page and in clause 9 (twice) | Pass |
| 3 | Type a jurisdiction following the placeholder | Reads correctly in clause 9 | **Fail → fixed**: placeholder said "courts located in New Castle, DE" producing "courts located in courts located in…". Placeholder is now "New Castle, DE" |
| 4 | Choose "In perpetuity" | Years input disabled; cover page says "In perpetuity."; clause 5 updated | Pass |
| 5 | Choose "Continues until terminated" | Term years disabled; wording changes | Pass |
| 6 | Enter 0, -5, blank years | Document shows "1 year" | Pass |
| 7 | Fill both parties | Signature table shows both columns, dates formatted | Pass |
| 8 | Click **Download PDF** | `Mutual-NDA.pdf` saved; button shows "Generating…" then resets | Pass |
| 9 | Inspect the PDF (rendered to images) | Cover page on page 1; terms on pages 2–3; values underlined; attribution present | **Fail → fixed** (twice): signature table stranded alone on page 2 after hyphenation was disabled, and a lone "7." at the foot of page 2 with its text on page 3. Both fixed and covered by regression tests |
| 10 | PDF URL text | `commonpaper.com/standards/mutual-nda/1.0` not split by hyphenation | Pass (after disabling hyphenation) |
| 11 | Narrow window (375px) | Single column, no horizontal scroll, download still works | Pass |
| 12 | Tab through the form with keyboard; Enter on the button | Sensible order; downloads | Pass |
| 13 | Press Enter inside a text field | Page does not reload; data kept | Pass |
| 14 | Type `<b>x</b>` in modifications | Shown literally | Pass |
| 15 | Inspect controls with a screen-reader/label audit | Every control named | **Fail → fixed**: the two year inputs had no accessible name |

## Known limitations

- The PDF uses the built-in Times font (WinAnsi). Characters outside it (e.g. CJK) will not render correctly; the PDF still
  builds. Embedding a Unicode font would fix this.
- Only the Mutual NDA template is supported (issue #4 scope).
