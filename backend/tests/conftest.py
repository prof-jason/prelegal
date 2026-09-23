from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import REPO_ROOT


@pytest.fixture()
def static_dir(tmp_path: Path) -> Path:
    """A minimal fake "built frontend" directory, decoupled from an actual
    `next build` so backend tests don't depend on the frontend toolchain.
    """
    directory = tmp_path / "static"
    directory.mkdir()
    (directory / "index.html").write_text("<html><body>ok</body></html>")
    next_dir = directory / "_next"
    next_dir.mkdir()
    (next_dir / "app.js").write_text("console.log('ok');")
    return directory


@pytest.fixture()
def configure_env(
    tmp_path: Path, static_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Point every env-driven config path (see app.config) at isolated,
    per-test locations. Shared by the `client` fixture below and by tests
    that need to construct more than one app instance themselves (e.g.
    test_db_lifecycle.py, which simulates a container restart).
    """
    monkeypatch.setenv("PRELEGAL_DB_PATH", str(tmp_path / "app.db"))
    monkeypatch.setenv("PRELEGAL_STATIC_DIR", str(static_dir))
    monkeypatch.setenv("PRELEGAL_CATALOG_PATH", str(REPO_ROOT / "catalog.json"))
    monkeypatch.setenv("JWT_SECRET_KEY", "test-secret-at-least-32-bytes-long")
    # Never actually used to call the real API -- LLM calls are always
    # mocked in tests -- but app.llm treats a missing key as an immediate
    # LlmUnavailableError, so tests need *a* value set to exercise the real
    # completion-call path.
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-openrouter-key")


@pytest.fixture()
def client(configure_env: None):
    """A TestClient wired to an isolated, per-test DB/static/catalog setup.

    Entering the TestClient's context triggers the app's lifespan, which
    resets the (per-test) database -- so every test starts from a clean,
    freshly-created schema, same as a real container boot.
    """
    from app.main import create_app

    with TestClient(create_app()) as test_client:
        yield test_client
