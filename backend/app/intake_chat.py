"""The opening "what do you need?" chat: works out which catalog document
the user wants, or -- if we don't have a template for it -- says so and
offers the closest one we can generate.
"""

from __future__ import annotations

from pydantic import BaseModel

from app.documents import DocumentType
from app.nda_chat import MAX_HISTORY_MESSAGES
from app.schemas import ChatTurn


class IntakeExtraction(BaseModel):
    """The LLM's structured-output contract for an intake turn."""

    reply: str
    document_id: str | None = None


def build_system_prompt(documents: tuple[DocumentType, ...]) -> str:
    catalog = "\n".join(f"- {d.id}: {d.name} -- {d.description}" for d in documents)
    return f"""\
You are the intake assistant for Prelegal, which drafts legal agreements from Common \
Paper standard templates. Your only job right now is to work out which document the \
user needs. These are the ONLY documents we can generate (id: name -- description):

{catalog}

Rules:
- If it isn't clear what they need, ask a short question about their situation (who \
the parties are, what the relationship is), then recommend the best-fitting document \
from the list and briefly say why.
- If the user asks for a document that is not on the list (for example an employment \
contract, a lease, or a will), say plainly that we can't generate that one, then \
suggest the closest document from the list (or say none is close) and ask whether \
they'd like to use it instead.
- Set `document_id` to the matching id ONLY when the user has clearly said they want \
that specific document -- either by asking for it directly, or by agreeing to your \
suggestion. When you set it, reply with one short sentence saying you'll start on it \
now. Otherwise leave `document_id` null.
- Never set `document_id` to anything other than an id from the list above.
- Keep replies short and friendly. You don't give legal advice.
"""


def build_llm_messages(documents: tuple[DocumentType, ...], history: list[ChatTurn]) -> list[dict]:
    capped = history[-MAX_HISTORY_MESSAGES:]
    return [
        {"role": "system", "content": build_system_prompt(documents)},
        *[{"role": m.role, "content": m.content} for m in capped],
    ]


def normalize_document_id(raw: str | None, documents: tuple[DocumentType, ...]) -> str | None:
    """Drop (to None) any id the model made up."""
    raw = (raw or "").strip()
    return raw if any(d.id == raw for d in documents) else None
