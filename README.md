# Prelegal

A SaaS product for drafting legal agreements from templates via AI chat. See
[`catalog.json`](catalog.json) for the list of supported document types and
[`templates/`](templates/) for the underlying agreement templates.

## Project layout

- `frontend/` — Next.js app (App Router), built as a static export and served
  by the backend. Currently implements the Mutual NDA creator.
- `backend/` — FastAPI backend (managed with [uv](https://docs.astral.sh/uv/)),
  serves both the API (under `/api`) and the built frontend.
- `templates/` / `catalog.json` — the document templates and the catalog of
  available document types.
- `scripts/` — start/stop scripts for the Dockerized app.

## Quick start (Docker)

```bash
# Mac
scripts/start-mac.sh
scripts/stop-mac.sh

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows (PowerShell)
scripts/start-windows.ps1
scripts/stop-windows.ps1
```

The app is available at **http://localhost:8000**. The database is SQLite and
is recreated from scratch every time the container starts.

## Local development

**Frontend** (Next.js dev server on port 3000, hot reload):

```bash
cd frontend
npm install
npm run dev
```

**Backend** (FastAPI on port 8000, with reload):

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Note: the backend serves the frontend's static build at `/`. Without running
`npm run build` in `frontend/` first, API routes under `/api/*` still work,
but `/` will 404.

## Current state

- Sign up / sign in with an email and password. Every document you work on
  is autosaved to your account; **My documents** lists your drafts to reopen
  or delete.
- Every catalog document can be drafted by chatting with the AI assistant
  (or editing fields directly), with a live preview and PDF download. Each
  document is marked as a draft, subject to legal review.
- The SQLite database (users and saved documents) is recreated empty every
  time the server starts, so accounts and drafts don't survive a restart.

## API reference

- `GET /api/health` → `{"status": "ok"}`
- `GET /api/catalog` → the document catalog (see `catalog.json`)
- `POST /api/auth/signup` → `{"email": ..., "password": ...}` (password ≥ 8
  chars) → `201` with the created user, or `409` if the email is already
  registered
- `POST /api/auth/login` → `{"email": ..., "password": ...}` → `200` with a
  bearer token and the user, or `401` on invalid credentials
- `GET /api/auth/me` → the current user

Every other route below requires `Authorization: Bearer <token>` (`401`
otherwise):

- `GET /api/documents`, `GET /api/documents/{id}`, `POST /api/intake/chat`,
  `POST /api/documents/{id}/chat`, `POST /api/nda/chat` — document types and
  the AI chats
- `GET /api/saved-documents` → your drafts, most recently edited first
- `GET /api/saved-documents/{uuid}` → one draft (transcript + fields)
- `PUT /api/saved-documents/{uuid}` → `{document_id, title, transcript,
  fields}` creates or replaces a draft (the client picks the UUID)
- `DELETE /api/saved-documents/{uuid}` → `204`

Another user's draft always behaves as `404`.

## Environment variables

Set in the root `.env` file (see `.gitignore` — this file is not committed):

- `OPENROUTER_API_KEY` — used by the AI chat (LiteLLM → OpenRouter).

The backend also reads these (all have sane defaults for local dev/Docker):

- `PRELEGAL_DB_PATH`, `PRELEGAL_STATIC_DIR`, `PRELEGAL_CATALOG_PATH`
- `JWT_SECRET_KEY`, `JWT_EXPIRE_HOURS`
- `CORS_ORIGINS`

## Testing

**Frontend** (run from `frontend/`; `npm test` also requires the repo's
`templates/` directory, so it needs a full checkout, not just `frontend/`):

```bash
npm test           # unit tests (Vitest)
npm run test:e2e    # end-to-end tests (Playwright)
npm run typecheck
npm run lint
```

**Backend** (run from `backend/`):

```bash
uv run pytest
```
