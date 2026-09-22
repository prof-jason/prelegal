"""Environment-driven configuration.

Paths are resolved lazily (as functions), never cached as module-level
constants. This matters for tests: pytest monkeypatches these env vars per
test, and a module-level constant computed at import time would not see
those overrides.
"""

from __future__ import annotations

import os
from pathlib import Path

# backend/app/config.py -> parents[2] is the repository root.
REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]


def db_path() -> Path:
    """Where the SQLite database file lives.

    Recreated from scratch on every process start (see app.db.reset_db), so
    this location never needs to be durable/persisted across restarts.
    """
    override = os.environ.get("PRELEGAL_DB_PATH")
    if override:
        return Path(override)
    return BACKEND_ROOT / "data" / "app.db"


def static_dir() -> Path:
    """Where the built (static-exported) frontend lives."""
    override = os.environ.get("PRELEGAL_STATIC_DIR")
    if override:
        return Path(override)
    return REPO_ROOT / "frontend" / "out"


def catalog_path() -> Path:
    """Where catalog.json (the list of available document types) lives."""
    override = os.environ.get("PRELEGAL_CATALOG_PATH")
    if override:
        return Path(override)
    return REPO_ROOT / "catalog.json"


def jwt_secret_key() -> str:
    """Secret used to sign auth tokens.

    Falls back to a fixed development value so local `uv run` / tests work
    without extra setup; every real deployment should set JWT_SECRET_KEY.
    """
    return os.environ.get(
        "JWT_SECRET_KEY", "dev-insecure-change-me-before-any-real-deployment"
    )


def jwt_expire_hours() -> int:
    return int(os.environ.get("JWT_EXPIRE_HOURS", "24"))


def cors_origins() -> list[str]:
    """Origins allowed to call the API with credentials.

    Includes the Next.js dev server ports so `npm run dev` (port 3000) and
    the Playwright e2e static server (port 3222) can reach this API while
    developing, even though nothing calls the API from the frontend yet.
    """
    override = os.environ.get("CORS_ORIGINS")
    if override:
        return [origin.strip() for origin in override.split(",") if origin.strip()]
    return ["http://localhost:3000", "http://localhost:3222"]
