"""AI chat endpoint for the Mutual NDA creator (issue #6).

No auth dependency and no persistence: the fake login screen already gates
the whole app, and conversation state lives entirely client-side (matching
the existing form state, which also isn't persisted across a refresh).
"""

from __future__ import annotations

from fastapi import APIRouter

from app import llm, nda_chat
from app.routers.llm_errors import http_exception
from app.schemas import NdaChatRequest, NdaChatResponse

router = APIRouter()


@router.post("/nda/chat", response_model=NdaChatResponse)
def chat(body: NdaChatRequest) -> NdaChatResponse:
    messages = nda_chat.build_llm_messages(body.messages, body.current_fields)

    try:
        extraction = llm.get_structured_completion(messages, nda_chat.NdaChatExtraction)
    except llm.LlmMalformedOutputError:
        # A parsing hiccup shouldn't dead-end the conversation -- degrade to
        # a normal (200) in-chat reply instead of an error the user has to
        # dismiss.
        extraction = nda_chat.degraded_extraction()
    except llm.LlmError as e:
        raise http_exception(e) from e

    normalized = nda_chat.normalize_patch(extraction.updates)
    field_names = nda_chat.reconcile_field_names(extraction.updated_field_names, normalized)
    return NdaChatResponse(reply=extraction.reply, updates=normalized, updated_field_names=field_names)
