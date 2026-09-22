"""Read-only endpoint exposing the document catalog.

Serves catalog.json as-is. Nothing in the frontend consumes this yet in
issue #5 -- it exists to prove the frontend/backend wiring works and as
foundation for the document-picker UI a future issue will build.
"""

from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, status

from app import config
from app.schemas import CatalogEntry

router = APIRouter()


@router.get("/catalog", response_model=list[CatalogEntry])
def get_catalog() -> list[CatalogEntry]:
    path = config.catalog_path()
    if not path.is_file():
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR, "catalog.json not found"
        )
    entries = json.loads(path.read_text())
    return [CatalogEntry(**entry) for entry in entries]
