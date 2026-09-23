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
- **`src/lib/template.test.ts`** – the template parser against fixtures and every real template in `../templates`
  (all list items kept, clause numbering, no raw markup left in the text, only web links).
- **`src/lib/document.test.ts`, `src/components/Document*.test.tsx`, `src/app/page.test.tsx`** – template-driven
  documents (merge, preview, cover page, PDF download) and the start screen flow: cards, intake chat, unsupported
  requests, carrying the conversation into the chosen document, "Change document".
- **`src/lib/documentPdf.test.tsx`** – generates a template-driven PDF and reads it back (cover page first, filled
  terms, `[Term]` placeholders, the longest real template renders).
- **`e2e/documents.spec.ts`** – start screen and a full SLA flow in Chrome with the API mocked from
  `e2e/fixtures/*.json`. Those fixtures are captured from the real backend, and `backend/tests/test_e2e_fixtures.py`
  fails if they drift.
- **`e2e/nda.spec.ts`** – full flows in Chrome: fill every field, live preview, PDF download contents, mobile/tablet
  overflow, console cleanliness (no hydration warnings), keyboard use, control labelling.

Vitest pins `TZ=America/Los_Angeles` (`vitest.global.ts`) so local-vs-UTC date bugs are caught on any machine, and a
sentinel test fails if the pin ever stops reaching the workers. The e2e suite runs its date test in `Pacific/Kiritimati`
(UTC+14) with a fixed clock for the same reason.

**Running e2e:** locally it uses your installed Google Chrome (`channel: "chrome"`); with `CI=1` it uses Playwright's
Chromium (`npx playwright install chromium`). It always builds and starts its own server on port 3222 and never reuses one
that is already running, so it cannot test stale code.

The fidelity test reads `../templates/Mutual-NDA.md`, so run the tests from a full checkout of the repo.

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
| 16 | Arrow keys inside a radio set | Moves between the two options | **Fail → fixed** (code review): radios had no shared `name` and no group label; now `<fieldset>`/`<legend>` + shared name |
| 17 | Read clauses 1, 2 and 5 with default values | Grammatical | **Fail → fixed** (code review): "for the Evaluating whether to…" and "expires at the end of the MNDA Term (continuing until terminated)". Clauses now use the defined term "Purpose" and a bare "MNDA Term" for the open-ended case |
| 18 | Type two lines into "MNDA modifications" | Preview shows two lines, as the PDF does | **Fail → fixed** (code review): preview collapsed them; now `white-space: pre-wrap` |
| 19 | Type "1e21" / "100" years | Capped at 99 years | **Fail → fixed** (code review): produced "1e+21 years" |
| 20 | Leave governing law/jurisdiction empty | Visible warning about placeholders | Pass (added after review) |
| 21 | Type CJK / emoji into a field | Visible warning that the PDF may not show them | Pass (added after review) |

## Known limitations

- The PDF uses the built-in Times font (WinAnsi). Characters outside it (e.g. CJK, some Polish/Vietnamese letters, emoji)
  will not render correctly in the PDF. The page warns about them, and the PDF still builds. Embedding a Unicode font
  would remove the limitation.
- Clause 9 says "the laws of the State of …", so "governing law" must be a US state name (the field says so). This is the
  Common Paper template's wording.
- The tool shows a not-legal-advice notice but does no legal validation of the entries.
- Template-driven documents show each variable in the standard terms as its defined term (underlined once it has a
  value, `[Term]` until then), with the values on the generated cover page, rather than splicing free-text values
  into the legal prose.
