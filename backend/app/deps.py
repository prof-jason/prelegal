"""Shared FastAPI dependencies."""

from __future__ import annotations

import sqlite3

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app import security
from app.db import get_db
from app.schemas import UserPublic

_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    connection: sqlite3.Connection = Depends(get_db),
) -> UserPublic:
    """Resolve the bearer token to a user, or raise 401.

    Nothing calls this yet (the frontend login is fake), but it's the
    dependency a future protected route reuses once real auth is wired up.
    """
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

    user_id = security.decode_access_token(credentials.credentials)
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

    row = connection.execute(
        "SELECT id, email, created_at FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User no longer exists")

    return UserPublic(id=row["id"], email=row["email"], created_at=row["created_at"])
