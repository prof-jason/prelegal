"""The frontend's Playwright suite runs without a backend, mocking the API
with JSON captured from it (frontend/e2e/fixtures). Fail here if those
captures drift from what the backend actually serves.

To refresh them, write each endpoint's response to its fixture file, e.g.:
    uv run python -c "import json; from fastapi.testclient import TestClient; \\
    from app.main import create_app; c = TestClient(create_app()); \\
    print(json.dumps(c.get('/api/documents/sla').json(), indent=2, ensure_ascii=False))"
"""

from __future__ import annotations

import json

import pytest

from app.config import REPO_ROOT

FIXTURES = REPO_ROOT / "frontend" / "e2e" / "fixtures"


@pytest.mark.parametrize(
    ("path", "fixture"),
    [("/api/documents", "documents.json"), ("/api/documents/sla", "sla-document.json")],
)
def test_e2e_fixture_matches_the_live_response(client, path, fixture):
    assert client.get(path).json() == json.loads((FIXTURES / fixture).read_text())
