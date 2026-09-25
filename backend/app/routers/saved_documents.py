"""A user's saved documents: list, open, autosave (idempotent PUT) and delete.

The frontend generates each document's UUID itself, so its debounced
autosave is always the same PUT -- there's no create-then-update race where
two quick saves could each create a document.
"""

from __future__ import annotations

import sqlite3
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app import documents, saved_documents
from app.db import get_db
from app.deps import get_current_user
from app.schemas import SavedDocumentDetail, SavedDocumentSummary, SavedDocumentUpsert, UserPublic

router = APIRouter()


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "Saved document not found")


@router.get("/saved-documents", response_model=list[SavedDocumentSummary])
def list_saved_documents(
    user: UserPublic = Depends(get_current_user), connection: sqlite3.Connection = Depends(get_db)
) -> list[SavedDocumentSummary]:
    return saved_documents.list_for_user(connection, user.id)


@router.get("/saved-documents/{doc_id}", response_model=SavedDocumentDetail)
def get_saved_document(
    doc_id: UUID,
    user: UserPublic = Depends(get_current_user),
    connection: sqlite3.Connection = Depends(get_db),
) -> SavedDocumentDetail:
    saved = saved_documents.get(connection, user.id, str(doc_id))
    if saved is None:
        raise _not_found()
    return saved


@router.put("/saved-documents/{doc_id}", response_model=SavedDocumentDetail)
def save_document(
    doc_id: UUID,
    body: SavedDocumentUpsert,
    user: UserPublic = Depends(get_current_user),
    connection: sqlite3.Connection = Depends(get_db),
) -> SavedDocumentDetail:
    if documents.get_document(body.document_id) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"No document {body.document_id!r}")
    saved = saved_documents.upsert(connection, user.id, str(doc_id), body)
    if saved is None:
        raise _not_found()
    return saved


@router.delete("/saved-documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_document(
    doc_id: UUID,
    user: UserPublic = Depends(get_current_user),
    connection: sqlite3.Connection = Depends(get_db),
) -> Response:
    if not saved_documents.delete(connection, user.id, str(doc_id)):
        raise _not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
