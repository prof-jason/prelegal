"""Read-only endpoint exposing the document catalog.

Serves catalog.json as-is. The frontend lists documents via
/api/documents instead; this remains as a raw view of the catalog.
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
