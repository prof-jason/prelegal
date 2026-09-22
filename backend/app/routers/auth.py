"""Signup / login / me endpoints.

Real, tested auth endpoints backed by the SQLite `users` table -- but
nothing in the frontend calls them yet. Issue #5 ("build the V1 technical
foundation") uses only a fake, unauthenticated login screen; these
endpoints exist so wiring up real auth in a future issue is an additive
frontend change, not a backend redesign.
"""

from __future__ import annotations

import sqlite3

from fastapi import APIRouter, Depends, HTTPException, status

from app import security
from app.db import get_db
from app.deps import get_current_user
from app.schemas import LoginRequest, SignupRequest, TokenResponse, UserPublic

router = APIRouter()


@router.post("/signup", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
def signup(
    body: SignupRequest, connection: sqlite3.Connection = Depends(get_db)
) -> UserPublic:
    password_hash = security.hash_password(body.password)
    try:
        cursor = connection.execute(
            "INSERT INTO users (email, password_hash) VALUES (?, ?)",
            (body.email, password_hash),
        )
        connection.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Email already registered"
        ) from None

    row = connection.execute(
        "SELECT id, email, created_at FROM users WHERE id = ?", (cursor.lastrowid,)
    ).fetchone()
    return UserPublic(id=row["id"], email=row["email"], created_at=row["created_at"])


@router.post("/login", response_model=TokenResponse)
def login(
    body: LoginRequest, connection: sqlite3.Connection = Depends(get_db)
) -> TokenResponse:
    row = connection.execute(
        "SELECT id, email, created_at, password_hash FROM users WHERE email = ?",
        (body.email,),
    ).fetchone()

    # Same error -- and, via verify_dummy_password, roughly the same
    # response time -- for "no such user" and "wrong password", so neither
    # the message nor the latency reveals whether an email is registered.
    invalid = HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if row is None:
        security.verify_dummy_password(body.password)
        raise invalid
    if not security.verify_password(body.password, row["password_hash"]):
        raise invalid

    token = security.create_access_token(row["id"])
    user = UserPublic(id=row["id"], email=row["email"], created_at=row["created_at"])
    return TokenResponse(access_token=token, user=user)


@router.get("/me", response_model=UserPublic)
def me(current_user: UserPublic = Depends(get_current_user)) -> UserPublic:
    return current_user
