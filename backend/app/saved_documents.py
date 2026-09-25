"""Data access for a user's saved documents (the saved_documents table).

Every function takes the owning user's id and only ever touches that user's
rows, so another user's document id behaves exactly like one that doesn't
exist.
"""

from __future__ import annotations

import json
import sqlite3

from app.schemas import SavedDocumentDetail, SavedDocumentSummary, SavedDocumentUpsert

_SUMMARY_COLUMNS = "id, document_id, title, created_at, updated_at"


def _summary(row: sqlite3.Row) -> SavedDocumentSummary:
    return SavedDocumentSummary(**{key: row[key] for key in row.keys()})


def list_for_user(connection: sqlite3.Connection, user_id: int) -> list[SavedDocumentSummary]:
    rows = connection.execute(
        f"SELECT {_SUMMARY_COLUMNS} FROM saved_documents WHERE user_id = ? "
        "ORDER BY updated_at DESC, rowid DESC",
        (user_id,),
    ).fetchall()
    return [_summary(row) for row in rows]


def get(connection: sqlite3.Connection, user_id: int, doc_id: str) -> SavedDocumentDetail | None:
    row = connection.execute(
        f"SELECT {_SUMMARY_COLUMNS}, transcript, fields FROM saved_documents WHERE id = ? AND user_id = ?",
        (doc_id, user_id),
    ).fetchone()
    if row is None:
        return None
    return SavedDocumentDetail(
        **_summary(row).model_dump(),
        transcript=json.loads(row["transcript"]),
        fields=json.loads(row["fields"]),
    )


def upsert(
    connection: sqlite3.Connection, user_id: int, doc_id: str, body: SavedDocumentUpsert
) -> SavedDocumentDetail | None:
    """Create the document, or replace its contents if the user already has it.

    Returns None -- without touching anything -- when the id belongs to a
    different user; the WHERE on the conflict clause makes that check part
    of the same atomic statement.
    """
    cursor = connection.execute(
        """
        INSERT INTO saved_documents (id, user_id, document_id, title, transcript, fields)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
            document_id = excluded.document_id,
            title = excluded.title,
            transcript = excluded.transcript,
            fields = excluded.fields,
            updated_at = datetime('now')
        WHERE saved_documents.user_id = excluded.user_id
        """,
        (
            doc_id,
            user_id,
            body.document_id,
            body.title,
            json.dumps([turn.model_dump() for turn in body.transcript]),
            json.dumps(body.fields),
        ),
    )
    connection.commit()
    if cursor.rowcount == 0:
        return None
    return get(connection, user_id, doc_id)


def delete(connection: sqlite3.Connection, user_id: int, doc_id: str) -> bool:
    cursor = connection.execute(
        "DELETE FROM saved_documents WHERE id = ? AND user_id = ?", (doc_id, user_id)
    )
    connection.commit()
    return cursor.rowcount > 0
