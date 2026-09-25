"""Document types (issue #7): listing, template-driven document details,
the intake chat that picks a document, and the fill-in chat for any
template-driven document. The Mutual NDA keeps its own /api/nda/chat.

Stateless like /api/nda/chat: the client resends the whole transcript (and
current field values) every turn. Requires a signed-in user (see app.main).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app import document_chat, documents, intake_chat, llm
from app.documents import DocumentField, GenericDocument
from app.routers.llm_errors import http_exception
from app.schemas import (
    DocumentChatRequest,
    DocumentChatResponse,
    DocumentDetail,
    DocumentFieldOut,
    DocumentSummary,
    IntakeChatRequest,
    IntakeChatResponse,
    PartyOut,
)

router = APIRouter()


def _generic_or_404(doc_id: str) -> GenericDocument:
    document = documents.get_generic(doc_id)
    if document is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No template-driven document {doc_id!r}")
    return document


def _field_out(field: DocumentField) -> DocumentFieldOut:
    return DocumentFieldOut(key=field.key, label=field.label, hint=field.hint, type=field.type, group=field.group)


@router.get("/documents", response_model=list[DocumentSummary])
def list_documents() -> list[DocumentSummary]:
    return [DocumentSummary(id=d.id, name=d.name, description=d.description, kind=d.kind) for d in documents.list_documents()]


@router.get("/documents/{doc_id}", response_model=DocumentDetail)
def get_document(doc_id: str) -> DocumentDetail:
    document = _generic_or_404(doc_id)
    return DocumentDetail(
        id=document.doc.id,
        name=document.doc.name,
        description=document.doc.description,
        terms=[_field_out(f) for f in document.terms],
        parties=[PartyOut(role=p.role, fields=[_field_out(f) for f in p.fields]) for p in document.parties],
        markdown=document.markdown,
    )


@router.post("/documents/{doc_id}/chat", response_model=DocumentChatResponse)
def document_chat_turn(doc_id: str, body: DocumentChatRequest) -> DocumentChatResponse:
    document = _generic_or_404(doc_id)
    messages = document_chat.build_llm_messages(document, body.messages, body.current_fields)
    try:
        extraction = llm.get_structured_completion(messages, document_chat.extraction_model(document))
    except llm.LlmMalformedOutputError:
        return DocumentChatResponse(reply=document_chat.degraded_reply())
    except llm.LlmError as e:
        raise http_exception(e) from e

    updates = document_chat.normalize_updates(document, extraction.updates)
    return DocumentChatResponse(
        reply=extraction.reply,
        updates=updates,
        updated_field_names=document_chat.reconcile_field_names(extraction.updated_field_names, updates),
    )


@router.post("/intake/chat", response_model=IntakeChatResponse)
def intake_chat_turn(body: IntakeChatRequest) -> IntakeChatResponse:
    available = documents.list_documents()
    messages = intake_chat.build_llm_messages(available, body.messages)
    try:
        extraction = llm.get_structured_completion(messages, intake_chat.IntakeExtraction)
    except llm.LlmMalformedOutputError:
        return IntakeChatResponse(reply=document_chat.degraded_reply())
    except llm.LlmError as e:
        raise http_exception(e) from e

    return IntakeChatResponse(
        reply=extraction.reply,
        document_id=intake_chat.normalize_document_id(extraction.document_id, available),
    )
