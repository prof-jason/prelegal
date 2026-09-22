from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient


def test_database_is_recreated_empty_on_each_startup(
    tmp_path: Path, configure_env: None
) -> None:
    from app.main import create_app

    db_file = tmp_path / "app.db"

    with TestClient(create_app()) as client:
        response = client.post(
            "/api/auth/signup",
            json={"email": "restart@example.com", "password": "hunter22"},
        )
        assert response.status_code == 201

    # Simulate a container restart: a fresh app instance pointed at the
    # same DB file must wipe it clean on startup, not reuse prior data.
    with TestClient(create_app()):
        connection = sqlite3.connect(db_file)
        try:
            count = connection.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        finally:
            connection.close()
        assert count == 0


def test_database_recreated_even_if_file_is_pre_existing_garbage(
    tmp_path: Path, configure_env: None
) -> None:
    from app.main import create_app

    db_file = tmp_path / "app.db"
    db_file.parent.mkdir(parents=True, exist_ok=True)
    db_file.write_bytes(b"not a real sqlite file")

    with TestClient(create_app()) as client:
        response = client.get("/api/catalog")
        assert response.status_code == 200
