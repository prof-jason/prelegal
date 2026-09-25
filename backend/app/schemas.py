"""Pydantic request/response models."""

from __future__ import annotations

import json
import re
from typing import Any, Literal

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


class DocumentSummary(BaseModel):
    id: str
    name: str
    description: str
    kind: Literal["nda", "generic"]


class DocumentFieldOut(BaseModel):
    key: str
    label: str
    hint: str
    type: Literal["text", "date"]
    group: str


class PartyOut(BaseModel):
    role: str
    fields: list[DocumentFieldOut]


class DocumentDetail(BaseModel):
    """A template-driven document: its fields plus its template markdown,
    with every variable span tagged data-field="<key>" or data-role (a party
    role name, rendered as plain text)."""

    id: str
    name: str
    description: str
    terms: list[DocumentFieldOut]
    parties: list[PartyOut]
    markdown: str


class DocumentChatRequest(BaseModel):
    messages: list[ChatTurn]
    # Every field the client currently has, keyed by field key ("" = unset).
    current_fields: dict[str, str] = {}


class DocumentChatResponse(BaseModel):
    reply: str
    # Only the fields set this turn (turn-scoped delta, like NdaChatResponse).
    updates: dict[str, str] = {}
    updated_field_names: list[str] = []


class IntakeChatRequest(BaseModel):
    messages: list[ChatTurn]


class IntakeChatResponse(BaseModel):
    reply: str
    # Set once the user has picked a document; null means keep chatting.
    document_id: str | None = None


# Saved documents persist (until restart), so cap what one save can store.
MAX_SAVED_TURNS = 200
MAX_SAVED_TURN_CHARS = 10_000
MAX_SAVED_FIELDS_BYTES = 100_000


class SavedDocumentUpsert(BaseModel):
    document_id: str  # a catalog document id, e.g. "mutual-nda" or "sla"
    title: str
    transcript: list[ChatTurn] = []
    # Opaque to the backend: stored and returned exactly as the client sent it.
    fields: dict[str, Any] = {}

    @field_validator("title")
    @classmethod
    def _non_blank_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Title must not be blank")
        return value[:200]

    @field_validator("transcript")
    @classmethod
    def _bounded_transcript(cls, value: list[ChatTurn]) -> list[ChatTurn]:
        if len(value) > MAX_SAVED_TURNS:
            raise ValueError(f"A saved chat can have at most {MAX_SAVED_TURNS} messages")
        if any(len(turn.content) > MAX_SAVED_TURN_CHARS for turn in value):
            raise ValueError(f"A saved chat message can be at most {MAX_SAVED_TURN_CHARS} characters")
        return value

    @field_validator("fields")
    @classmethod
    def _bounded_fields(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value).encode()) > MAX_SAVED_FIELDS_BYTES:
            raise ValueError(f"Saved fields can be at most {MAX_SAVED_FIELDS_BYTES} bytes")
        return value


class SavedDocumentSummary(BaseModel):
    id: str
    document_id: str
    title: str
    created_at: str
    updated_at: str


class SavedDocumentDetail(SavedDocumentSummary):
    transcript: list[ChatTurn]
    fields: dict[str, Any]
