"""SQLite access.

Uses the stdlib sqlite3 module directly rather than an ORM: the schema is a
single table today, and the database is wiped and rebuilt from scratch on
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
    connection = sqlite3.connect(config.db_path())
    connection.row_factory = sqlite3.Row
    return connection


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency yielding a request-scoped connection."""
    connection = get_connection()
    try:
        yield connection
    finally:
        connection.close()
