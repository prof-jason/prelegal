"""AI chat for filling in any template-driven ("generic") document -- the
document-type-agnostic twin of app.nda_chat.

The LLM's structured-output contract is built per document from its derived
fields (pydantic.create_model), so the provider gets a real, enumerated JSON
schema rather than an open-ended dict. The public HTTP contract stays a
plain {field key: value} map (see schemas.DocumentChatResponse).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import BaseModel, Field, create_model

from app import llm
from app.documents import DocumentField, GenericDocument
from app.nda_chat import MAX_HISTORY_MESSAGES
from app.schemas import ChatTurn
from app.text_clean import clean_date, clean_str


@lru_cache(maxsize=None)
def extraction_model(document: GenericDocument) -> type[BaseModel]:
    """`{reply, updates: {<one optional string per field>}, updated_field_names}`."""
    model_name = "".join(part.title() for part in document.doc.id.split("-"))
    updates_model = create_model(  # type: ignore[call-overload]
        f"{model_name}Updates",
        # No per-field descriptions: hint examples placed in the schema get
        # copied into values verbatim. The hints live in the prompt instead.
        **{f.key: (str | None, None) for f in document.all_fields},
    )
    return create_model(  # type: ignore[call-overload]
        f"{model_name}Extraction",
        reply=(str, ...),
        updates=(updates_model, Field(default_factory=updates_model)),
        updated_field_names=(list[str], Field(default_factory=list)),
    )


def _field_line(field: DocumentField, current: dict[str, str]) -> str:
    value = current.get(field.key, "").strip()
    status = f'currently "{value}"' if value else "not set yet"
    return f"- {field.key} ({field.label}; {status}): {field.hint}"


def build_system_prompt(document: GenericDocument, current_fields: dict[str, str]) -> str:
    groups: dict[str, list[DocumentField]] = {}
    for field in document.terms:
        groups.setdefault(field.group, []).append(field)
    sections = [
        f"{group}:\n" + "\n".join(_field_line(f, current_fields) for f in fields) for group, fields in groups.items()
    ]
    sections += [
        f"{party.role} (signature block):\n" + "\n".join(_field_line(f, current_fields) for f in party.fields)
        for party in document.parties
    ]
    roles = " and ".join(p.role for p in document.parties)
    field_catalog = "\n\n".join(sections)
    return f"""\
You are a friendly assistant helping a user fill in a {document.doc.name} (Common Paper \
standard form: {document.doc.description}). Guide them through it with a natural \
conversation, asking about one or two things at a time rather than listing every field.

Fields you're collecting, by the exact key to use in `updates`:

{field_catalog}

Rules:
- Start by establishing who the two parties are (the {roles}), then work through the \
remaining fields that are not set yet, in roughly the order listed.
- `updates` must contain ONLY values the user actually stated in their own messages \
(earlier in the conversation counts). Leave every other field null -- in a typical \
turn most fields stay null. Never guess, invent, or fill in placeholder names, people, \
titles, addresses, dates, amounts, or companies. The "e.g." examples in the field \
descriptions are illustrations only, NEVER values to use. Date fields must be \
YYYY-MM-DD; leave them null unless the user gives an actual date.
- Many of these terms can legitimately not apply. If the user says a term doesn't apply \
or they don't want it, set it to "None".
- Whenever you set a field, say so in plain language (e.g. "Got it, I've set the \
Target Uptime to 99.9%.") and list its key in `updated_field_names`.
- If the user asks what a term means, explain briefly using the hint above.
- When nothing important is left, tell the user the document is ready to download as \
a PDF, and that they can still edit any field directly.
- If the user wants a different kind of document, tell them to use the "Change \
document" button to pick another one.
- Keep replies short and conversational. This is a template, not legal advice.
"""


def build_llm_messages(document: GenericDocument, history: list[ChatTurn], current_fields: dict[str, str]) -> list[dict]:
    capped = history[-MAX_HISTORY_MESSAGES:]
    return [
        {"role": "system", "content": build_system_prompt(document, current_fields)},
        *[{"role": m.role, "content": m.content} for m in capped],
    ]


def normalize_updates(document: GenericDocument, raw: BaseModel) -> dict[str, str]:
    """Vet what the LLM extracted: only fields that survive cleaning, keyed
    by field key. Blank strings and non-ISO dates are dropped, not raised."""
    values = raw.model_dump()
    cleaned: dict[str, str] = {}
    for field in document.all_fields:
        clean = clean_date if field.type == "date" else clean_str
        value = clean(values.get(field.key))
        if value is not None:
            cleaned[field.key] = value
    return cleaned


def reconcile_field_names(claimed: list[str], updates: dict[str, str]) -> list[str]:
    """Drop any claimed field whose value didn't survive normalization (and
    any duplicate), guarding the UI's "just updated" highlight."""
    return list(dict.fromkeys(name for name in claimed if name in updates))


def degraded_reply() -> str:
    return llm.LlmMalformedOutputError().user_message
