from __future__ import annotations

import json

from app.config import REPO_ROOT


def test_catalog_matches_source_file(client):
    response = client.get("/api/catalog")
    assert response.status_code == 200

    expected = json.loads((REPO_ROOT / "catalog.json").read_text())
    assert response.json() == expected
    assert len(response.json()) == len(expected) > 0
