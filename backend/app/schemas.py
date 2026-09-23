"""Pydantic request/response models."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, field_validator

# Deliberately simple format check rather than pulling in the email-validator
# dependency: this backend doesn't send email yet, it just needs a
# plausible, consistent shape.
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SignupRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _valid_email(cls, value: str) -> str:
        value = value.strip().lower()
        if not _EMAIL_RE.match(value):
            raise ValueError("Not a valid email address")
        return value

    @field_validator("password")
    @classmethod
    def _valid_password(cls, value: str) -> str:
        if len(value) < 8:
            raise ValueError("Password must be at least 8 characters")
        return value


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class UserPublic(BaseModel):
    id: int
    email: str
    created_at: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class CatalogEntry(BaseModel):
    name: str
    description: str
    filename: str


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class PartyFieldsPatch(BaseModel):
    """Sparse patch for one NDA party; None = not mentioned/unchanged."""

    name: str | None = None
    title: str | None = None
    company: str | None = None
    address: str | None = None
    date: str | None = None  # ISO YYYY-MM-DD


class NdaFieldsPatch(BaseModel):
    """Mirrors the frontend's NdaForm shape (see frontend/src/lib/nda.ts)
    field-for-field. Used two ways:

    - As NdaChatRequest.current_fields: a full snapshot of the live form as
      the client currently has it, so the assistant knows what's already
      set and doesn't re-ask.
    - As NdaChatResponse.updates (and internally, the LLM's own structured
      output): a turn-scoped delta -- None means "not mentioned/unchanged
      this turn", for every field including effectiveDate.

    termType/confidentialityType are plain strings, not Literal: one bad
    enum value from the LLM would otherwise fail validation for the whole
    response and lose every other correctly-extracted field. Invalid values
    are dropped field-by-field in app.nda_chat.normalize_patch instead.
    """

    purpose: str | None = None
    effectiveDate: str | None = None
    termType: str | None = None
    termYears: str | None = None
    confidentialityType: str | None = None
    confidentialityYears: str | None = None
    governingLaw: str | None = None
    jurisdiction: str | None = None
    modifications: str | None = None
    party1: PartyFieldsPatch | None = None
    party2: PartyFieldsPatch | None = None


class NdaChatRequest(BaseModel):
    messages: list[ChatTurn]
    current_fields: NdaFieldsPatch = NdaFieldsPatch()


class NdaChatResponse(BaseModel):
    reply: str
    updates: NdaFieldsPatch
    updated_field_names: list[str] = []
