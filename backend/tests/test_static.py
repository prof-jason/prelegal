from __future__ import annotations

from pathlib import Path


def test_root_serves_index_html(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "ok" in response.text


def test_static_asset_served_directly(client):
    response = client.get("/_next/app.js")
    assert response.status_code == 200
    assert "console.log" in response.text


def test_unknown_path_without_a_custom_404_page_returns_404(client):
    response = client.get("/some/deep/unknown/route")
    assert response.status_code == 404


def test_unknown_path_serves_the_frontend_build_own_404_page_if_present(
    static_dir: Path, client
):
    # `next build` with output: "export" always generates a 404.html; a
    # real deployment should serve it (with a 404 status), matching what
    # any static host (Vercel, Netlify, S3) would do.
    (static_dir / "404.html").write_text("<html><body>not found here</body></html>")

    response = client.get("/some/deep/unknown/route")
    assert response.status_code == 404
    assert "not found here" in response.text


def test_unknown_api_path_returns_404_not_a_200(client):
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404


def test_health_check(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_api_routes_are_not_shadowed_by_static_mount(client):
    response = client.get("/api/catalog")
    assert response.status_code == 200


def test_openapi_docs_not_shadowed_by_static_mount(client):
    response = client.get("/docs")
    assert response.status_code == 200
