# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

The current implementation supports the Mutual NDA document type via AI chat (see Progress below); the other 10 document types are not wired up yet. Login is currently a fake, unauthenticated placeholder — real signup/login/me endpoints exist on the backend but the frontend doesn't call them yet — and there is no document persistence yet (chat/form state is client-side only, lost on refresh).

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
- **Not started yet**: AI chat / document generation for the other 10
  catalog document types; wiring the fake login screen to the real auth
  endpoints; any document persistence.

