"""Every API route except signup, login and health requires a signed-in user."""

from __future__ import annotations

import pytest

PROTECTED = [
    ("get", "/api/auth/me"),
    ("get", "/api/catalog"),
    ("get", "/api/documents"),
    ("get", "/api/documents/sla"),
    ("post", "/api/documents/sla/chat"),
    ("post", "/api/intake/chat"),
    ("post", "/api/nda/chat"),
    ("get", "/api/saved-documents"),
    ("get", "/api/saved-documents/00000000-0000-4000-8000-000000000000"),
    ("put", "/api/saved-documents/00000000-0000-4000-8000-000000000000"),
    ("delete", "/api/saved-documents/00000000-0000-4000-8000-000000000000"),
]


@pytest.mark.parametrize(("method", "path"), PROTECTED)
def test_route_rejects_signed_out_requests(anon_client, method, path):
    response = anon_client.request(method, path, json={"messages": []})
    assert response.status_code == 401


@pytest.mark.parametrize(("method", "path"), PROTECTED)
def test_route_rejects_an_invalid_token(anon_client, method, path):
    response = anon_client.request(
        method, path, json={"messages": []}, headers={"Authorization": "Bearer not-a-token"}
    )
    assert response.status_code == 401


@pytest.mark.parametrize("path", ["/api/health"])
def test_public_routes_need_no_token(anon_client, path):
    assert anon_client.get(path).status_code == 200


def test_token_for_a_user_wiped_by_a_restart_is_rejected(anon_client):
    """The DB is recreated on every boot, so a stored token can outlive its
    user; the frontend relies on the 401 to send them back to sign in."""
    from app.security import create_access_token

    headers = {"Authorization": f"Bearer {create_access_token(9999)}"}
    response = anon_client.get("/api/documents", headers=headers)
    assert response.status_code == 401
    assert response.json()["detail"] == "User no longer exists"


def test_concurrent_authenticated_requests_all_succeed(client):
    """Every protected request opens a DB connection to resolve the user;
    FastAPI may use it from different threadpool threads, so it must not be
    bound to the thread that created it (a real browser's parallel requests
    hit this: sqlite3.ProgrammingError -> 500)."""
    from concurrent.futures import ThreadPoolExecutor

    paths = ["/api/documents", "/api/saved-documents", "/api/auth/me", "/api/catalog"] * 10
    with ThreadPoolExecutor(max_workers=8) as pool:
        statuses = list(pool.map(lambda p: client.get(p).status_code, paths))
    assert statuses == [200] * len(paths)
