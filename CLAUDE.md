# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

The current implementation supports every catalog document via AI chat (see Progress below): the Mutual NDA through its bespoke creator, and the other 10 through a template-driven engine. Users sign up and sign in for real (JWT bearer tokens), and every document they work on is autosaved to their account and listed under "My documents" to reopen later. The database — users and saved documents — is recreated empty every time the server starts.

## Development process

When instructed to build a feature:
1. Use your Github to read the feature instructions from Github issues
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use your Cerebras skill to use LiteLLM via OpenRouter to the `nvidia/nemotron-3-ultra-550b-a55b:free` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

There is an OPENROUTER_API_KEY in the .env file in the project root.

## Technical design

The entire project should be packaged into a Docker container.  
The backend should be in backend/ and be a uv project, using FastAPI.  
The frontend should be in frontend/  
The database should use SQLLite and be created from scratch each time the Docker container is brought up, allowing for a users table with sign up and sign in.  
Consider statically building the frontend and serving it via FastAPI, if that will work.  
There should be scripts in scripts/ for:  
```bash
# Mac
scripts/start-mac.sh    # Start
scripts/stop-mac.sh     # Stop

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1
scripts/stop-windows.ps1
```
Backend available at http://localhost:8000

## Color Scheme
- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)
- Dark Navy: `#032147` (headings)
- Gray Text: `#888888`

## Progress

- **Issue #5 (PR #11, merged)** — V1 technical foundation. Added `backend/`
  (uv-managed FastAPI), a SQLite `users` table recreated from scratch on
  every startup, real (but not yet frontend-wired) `POST /api/auth/signup`
  / `login` / `GET /api/auth/me`, a read-only `GET /api/catalog`, the
  frontend built as a static export and served by FastAPI, a fake
  localStorage-based login screen gating the app, and the `scripts/`
  start/stop files. No product features changed.
- **Issue #6 (PR #12, open)** — AI chat for the Mutual NDA. Replaced the
  Mutual NDA creator's form with a freeform chat UI (`POST
  /api/nda/chat`, LiteLLM → OpenRouter → Cerebras per the AI design
  section above). The backend's `app/llm.py` is a generic, document-type-
  agnostic wrapper; `app/nda_chat.py` holds the Mutual-NDA-specific
  prompt/field logic — the intended seam for adding the other 10 document
  types later. Users can still directly edit any field in an "editable
  summary" panel alongside chat. No auth and no server-side persistence
  for chat yet (client-side only, same as the form before it).
- **Issue #7** — All catalog document types. The app now opens on an
  intake chat (`POST /api/intake/chat`) plus a card per document
  (`GET /api/documents`); the assistant matches the request to a catalog
  document, or says we can't generate it and offers the closest one. The
  conversation carries over into the chosen document's chat. The Mutual NDA
  keeps its bespoke creator; the other 10 are template-driven:
  `app/documents.py` derives each document's fields from its template's
  `<span class="*_link">` variables (possessives/plurals folded, party roles
  and Notice Address excluded) and re-serves the template with each span
  tagged `data-field`/`data-role` (`GET /api/documents/{id}`);
  `app/field_hints.py` holds a curated hint per field (a test enforces full
  coverage); `app/document_chat.py` builds a per-document structured-output
  model (`POST /api/documents/{id}/chat`). The frontend parses the tagged
  template once (`lib/template.ts`) and renders it as a generated cover page
  plus standard terms, both as a live preview and as a PDF. Templates are
  loaded and validated at startup, and the Dockerfile now ships
  `templates/`.
- **Issue #8** — Multiple users & final polish. The sign-in/sign-up
  screen calls the real auth endpoints (sign-up signs straight in); the
  session (token + user) lives in localStorage (`lib/auth.ts`),
  `lib/api.ts` sends it as a bearer token and ends the session on any 401
  (e.g. after a restart wipes the user). Every `/api` route except
  signup/login/health requires a signed-in user, enforced per router in
  `app/main.py`. New `saved_documents` table + `app/saved_documents.py` +
  `GET/PUT/DELETE /api/saved-documents[/{uuid}]`: the client generates each
  draft's UUID so autosave is an idempotent, ownership-checked PUT upsert;
  transcript and fields are stored as opaque JSON (size-capped).
  `useAutosave` (`lib/hooks.ts`) debounces saves, saves on unmount, and
  only starts once the user changes something; `ChatPanel` reports its
  transcript via `onTurnsChange`. New `AppShell` (nav, user, sign out),
  `MyDocuments` (reopen/delete), and `WorkspaceHeader` (save status +
  "Draft — subject to legal review" banner) shared by both creators;
  every screen restyled with shared design tokens in `globals.css`.
  `db.get_connection` uses `check_same_thread=False` since FastAPI may use a
  request's connection from more than one threadpool thread.

