"""Password hashing and auth token helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

from app import config

_hasher = PasswordHasher()

JWT_ALGORITHM = "HS256"

# Verified against when login sees no matching user, so that path takes
# roughly the same time as a real (wrong-password) verification -- without
# this, an unknown email would return 401 near-instantly while a known
# email with a wrong password pays Argon2's deliberate hashing cost,
# letting an attacker enumerate registered emails via response latency.
_DUMMY_HASH = PasswordHasher().hash("not-a-real-password-used-only-for-timing")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def verify_dummy_password(password: str) -> None:
    """Burn the same time a real verify_password call would take.

    Call this on the "user not found" path in login so it isn't
    distinguishable by timing from the "wrong password" path.
    """
    verify_password(password, _DUMMY_HASH)


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(hours=config.jwt_expire_hours()),
    }
    return jwt.encode(payload, config.jwt_secret_key(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> int | None:
    """Return the user id encoded in a valid, unexpired token, else None."""
    try:
        payload = jwt.decode(token, config.jwt_secret_key(), algorithms=[JWT_ALGORITHM])
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None
