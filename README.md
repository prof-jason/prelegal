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

## Current state (issue #5: V1 technical foundation)

- The login screen is **fake**: any email/password submitted signs you
  straight into the app, and the session is remembered via `localStorage`
  until you log out. No real authentication is wired up yet.
- The backend does have real, tested `POST /api/auth/signup` and
  `POST /api/auth/login` endpoints backed by a SQLite `users` table — the
  frontend just doesn't call them yet. That's intentionally deferred to a
  future issue.
- `GET /api/catalog` serves `catalog.json`, proving the frontend/backend
  wiring works end-to-end, but no UI consumes it yet.
- Product features are otherwise unchanged from the existing prototype (the
  Mutual NDA creator).

## API reference

- `GET /api/health` → `{"status": "ok"}`
- `GET /api/catalog` → the document catalog (see `catalog.json`)
- `POST /api/auth/signup` → `{"email": ..., "password": ...}` (password ≥ 8
  chars) → `201` with the created user, or `409` if the email is already
  registered
- `POST /api/auth/login` → `{"email": ..., "password": ...}` → `200` with a
  bearer token and the user, or `401` on invalid credentials
- `GET /api/auth/me` (requires `Authorization: Bearer <token>`) → the current
  user

## Environment variables

Set in the root `.env` file (see `.gitignore` — this file is not committed):

- `OPENROUTER_API_KEY` — used by future AI-chat work (not yet wired up).

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
