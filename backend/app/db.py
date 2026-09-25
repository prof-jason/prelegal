"""SQLite access.

Uses the stdlib sqlite3 module directly rather than an ORM: the schema is a
couple of tables, and the database is wiped and rebuilt from scratch on
every process start (see reset_db), so there is no migration story to
manage. One connection is opened per request via the get_db dependency.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator

from app import config

SCHEMA = """
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A user's draft of one catalog document, autosaved by the frontend. The id
-- is a client-generated UUID so every save is an idempotent upsert (see
-- app.saved_documents). transcript and fields are JSON: the chat so far,
-- and the document's field values in the frontend's own shape (the NDA's
-- nested form, or a flat field-key map for template-driven documents).
CREATE TABLE saved_documents (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    document_id TEXT NOT NULL,
    title TEXT NOT NULL,
    transcript TEXT NOT NULL,
    fields TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX saved_documents_by_user ON saved_documents (user_id, updated_at);
"""


def reset_db() -> None:
    """Delete and recreate the database file with a fresh schema.

    Called on every application startup (see app.main's lifespan) so the
    database always starts empty, matching the project's "recreated from
    scratch each time the container is brought up" requirement.
    """
    path = config.db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        path.unlink()
    connection = sqlite3.connect(path)
    try:
        connection.executescript(SCHEMA)
        connection.commit()
    finally:
        connection.close()


def get_connection() -> sqlite3.Connection:
    # FastAPI runs a sync dependency's setup, the route, and its teardown on
    # threadpool threads that can differ within one request. Each connection
    # still belongs to exactly one request and is never used concurrently,
    # so sqlite3's same-thread check only gets in the way.
    connection = sqlite3.connect(config.db_path(), check_same_thread=False)
    connection.row_factory = sqlite3.Row
    return connection


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency yielding a request-scoped connection."""
    connection = get_connection()
    try:
        yield connection
    finally:
        connection.close()
