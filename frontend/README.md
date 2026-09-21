# Prelegal – Mutual NDA creator

A small Next.js app that fills in the [Common Paper Mutual NDA v1.0](https://commonpaper.com/standards/mutual-nda/1.0/)
from a form, shows the agreement live, and lets you download it as a PDF. Everything runs in the browser; nothing is sent
anywhere.

> The app produces a template agreement and is **not legal advice**. Have a qualified attorney review any agreement
> before signing.

## Run it

Requires Node 20.19+ (developed on Node 24).

```bash
npm install
npm run dev        # http://localhost:3000
```

Production build: `npm run build && npm start`.

## Test it

```bash
npm test           # unit / component / PDF-content tests (Vitest)
npm run test:e2e   # end-to-end tests (Playwright, needs Google Chrome installed; see TESTING.md for CI)
npm run typecheck
npm run lint
```

See [TESTING.md](./TESTING.md) for what each suite covers and the manual test checklist.

## Layout

- `src/lib/nda.ts` – form model, cover-page wording and the standard-terms text (checked against `../templates/Mutual-NDA.md`
  by a test, so the tests need the full repo checkout).
- `src/lib/ndaPdf.tsx` – PDF generation with `@react-pdf/renderer` (loaded on demand when you click Download).
- `src/components/` – form panel and the live document preview.
- `e2e/` – Playwright tests.

The agreement text is © Common Paper, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); attribution is
included in the preview and the PDF.
