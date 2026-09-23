from __future__ import annotations

from unittest.mock import patch

import pytest

from app import document_chat, documents, llm
from app.intake_chat import IntakeExtraction

COMPLETION = "app.routers.documents.llm.get_structured_completion"


def _sla_extraction(reply="ok", updated_field_names=(), **updates):
    model = document_chat.extraction_model(documents.get_generic("sla"))
    return model(reply=reply, updates=updates, updated_field_names=list(updated_field_names))


def _user(content="hi"):
    return [{"role": "user", "content": content}]


# ---- GET /api/documents, /api/documents/{id} ----


def test_list_documents_includes_nda_once_and_every_generic_document(client):
    body = client.get("/api/documents").json()
    ids = [d["id"] for d in body]
    assert ids.count("mutual-nda") == 1
    assert {"sla", "csa", "psa", "dpa", "baa"} <= set(ids)
    assert {d["kind"] for d in body} == {"nda", "generic"}
    assert all(d["name"] and d["description"] for d in body)


def test_document_detail_returns_fields_parties_and_tagged_markdown(client):
    response = client.get("/api/documents/sla")
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Service Level Agreement"
    assert body["terms"][0] == {
        "key": "target_uptime",
        "label": "Target Uptime",
        "hint": 'The monthly availability target, e.g. "99.9%".',
        "type": "text",
        "group": "Order Form",
    }
    assert [p["role"] for p in body["parties"]] == ["Provider", "Customer"]
    assert body["parties"][1]["fields"][0]["key"] == "party2_company"
    assert 'data-field="target_uptime"' in body["markdown"]
    assert body["markdown"].startswith("# Service Level Agreement")


@pytest.mark.parametrize("doc_id", ["mutual-nda", "employment-contract"])
def test_document_detail_404s_for_nda_and_unknown_ids(client, doc_id):
    assert client.get(f"/api/documents/{doc_id}").status_code == 404


# ---- POST /api/documents/{id}/chat ----


def test_chat_happy_path_returns_only_set_fields(client):
    extraction = _sla_extraction(
        reply="Got it, 99.9% uptime.", updated_field_names=["target_uptime"], target_uptime=" 99.9% "
    )
    with patch(COMPLETION, return_value=extraction):
        response = client.post("/api/documents/sla/chat", json={"messages": _user("99.9% uptime")})
    assert response.status_code == 200
    assert response.json() == {
        "reply": "Got it, 99.9% uptime.",
        "updates": {"target_uptime": "99.9%"},
        "updated_field_names": ["target_uptime"],
    }


def test_chat_uses_a_per_document_schema_with_every_field(client):
    with patch(COMPLETION, return_value=_sla_extraction()) as mock_completion:
        client.post("/api/documents/sla/chat", json={"messages": _user()})
    response_format = mock_completion.call_args[0][1]
    schema = response_format.model_json_schema()
    updates_schema = schema["$defs"][schema["properties"]["updates"]["$ref"].split("/")[-1]]
    assert {"target_uptime", "support_channel", "party1_company", "party2_date"} <= set(updates_schema["properties"])
    # Hint examples in the schema got copied into values verbatim in live
    # testing; they belong only in the prompt.
    assert not any("description" in prop for prop in updates_schema["properties"].values())


def test_chat_drops_blank_values_invalid_dates_and_unbacked_claims(client):
    csa = documents.get_generic("csa")
    model = document_chat.extraction_model(csa)
    extraction = model(
        reply="ok",
        updates={"governing_law": "  ", "effective_date": "next Tuesday", "party1_date": "2026-02-30", "chosen_courts": "Dover, DE"},
        updated_field_names=["governing_law", "effective_date", "party1_date", "chosen_courts", "chosen_courts", "made_up"],
    )
    with patch(COMPLETION, return_value=extraction):
        body = client.post("/api/documents/csa/chat", json={"messages": _user()}).json()
    assert body["updates"] == {"chosen_courts": "Dover, DE"}
    assert body["updated_field_names"] == ["chosen_courts"]


def test_chat_prompt_lists_fields_with_hints_and_current_values(client):
    with patch(COMPLETION, return_value=_sla_extraction()) as mock_completion:
        client.post(
            "/api/documents/sla/chat",
            json={"messages": _user(), "current_fields": {"target_uptime": "99.5%", "party1_company": ""}},
        )
    prompt = mock_completion.call_args[0][0][0]["content"]
    assert "Service Level Agreement" in prompt
    assert 'target_uptime (Target Uptime; currently "99.5%")' in prompt
    assert "party1_company (Company name; not set yet)" in prompt
    assert "Provider (signature block)" in prompt
    assert "support@provider.com" in prompt  # a curated hint


def test_chat_history_is_capped(client):
    many = [{"role": "user", "content": f"m{i}"} for i in range(100)]
    with patch(COMPLETION, return_value=_sla_extraction()) as mock_completion:
        client.post("/api/documents/sla/chat", json={"messages": many})
    sent = mock_completion.call_args[0][0]
    assert len(sent) == 41
    assert sent[-1]["content"] == "m99"


def test_chat_404s_for_nda_and_unknown_ids(client):
    for doc_id in ("mutual-nda", "lease"):
        assert client.post(f"/api/documents/{doc_id}/chat", json={"messages": _user()}).status_code == 404


def test_chat_malformed_output_degrades_to_200(client):
    with patch(COMPLETION, side_effect=llm.LlmMalformedOutputError()):
        response = client.post("/api/documents/sla/chat", json={"messages": _user()})
    assert response.status_code == 200
    assert "rephrase" in response.json()["reply"].lower()
    assert response.json()["updates"] == {}


@pytest.mark.parametrize(
    ("error", "status", "code"),
    [
        (llm.LlmRateLimitedError(), 429, "llm_rate_limited"),
        (llm.LlmTimeoutError(), 504, "llm_timeout"),
        (llm.LlmUnavailableError(), 502, "llm_unavailable"),
    ],
)
@pytest.mark.parametrize("path", ["/api/documents/sla/chat", "/api/intake/chat"])
def test_llm_errors_map_to_the_shared_error_envelope(client, error, status, code, path):
    with patch(COMPLETION, side_effect=error):
        response = client.post(path, json={"messages": _user()})
    assert response.status_code == status
    assert response.json()["detail"] == {"error_code": code, "message": error.user_message}


# ---- POST /api/intake/chat ----


def test_intake_returns_matched_document(client):
    with patch(COMPLETION, return_value=IntakeExtraction(reply="Let's do an SLA.", document_id="sla")):
        body = client.post("/api/intake/chat", json={"messages": _user("I need an SLA")}).json()
    assert body == {"reply": "Let's do an SLA.", "document_id": "sla"}


def test_intake_can_select_the_mutual_nda(client):
    with patch(COMPLETION, return_value=IntakeExtraction(reply="NDA it is.", document_id="mutual-nda")):
        body = client.post("/api/intake/chat", json={"messages": _user("An NDA please")}).json()
    assert body["document_id"] == "mutual-nda"


def test_intake_unsupported_request_keeps_chatting_and_hallucinated_ids_are_dropped(client):
    extraction = IntakeExtraction(
        reply="We can't generate employment contracts; the closest is a Professional Services Agreement.",
        document_id="employment-contract",
    )
    with patch(COMPLETION, return_value=extraction):
        body = client.post("/api/intake/chat", json={"messages": _user("employment contract")}).json()
    assert body["document_id"] is None
    assert "Professional Services Agreement" in body["reply"]


def test_intake_prompt_lists_every_document_and_the_unsupported_rule(client):
    with patch(COMPLETION, return_value=IntakeExtraction(reply="What do you need?")) as mock_completion:
        client.post("/api/intake/chat", json={"messages": []})
    prompt = mock_completion.call_args[0][0][0]["content"]
    for d in client.get("/api/documents").json():
        assert f"- {d['id']}: {d['name']}" in prompt
    assert "not on the list" in prompt
    assert mock_completion.call_args[0][1] is IntakeExtraction


def test_intake_malformed_output_degrades_to_200(client):
    with patch(COMPLETION, side_effect=llm.LlmMalformedOutputError()):
        response = client.post("/api/intake/chat", json={"messages": _user()})
    assert response.status_code == 200
    assert response.json()["document_id"] is None
