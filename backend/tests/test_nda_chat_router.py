from __future__ import annotations

from unittest.mock import patch

from app import llm
from app.nda_chat import NdaChatExtraction
from app.schemas import NdaFieldsPatch, PartyFieldsPatch


def _request(messages, current_fields=None):
    return {
        "messages": messages,
        "current_fields": current_fields or {},
    }


def test_happy_path_returns_reply_and_updates(client):
    extraction = NdaChatExtraction(
        reply="Got it, I've set the purpose.",
        updates=NdaFieldsPatch(purpose="Evaluating a partnership"),
        updated_field_names=["purpose"],
    )
    with patch("app.routers.nda_chat.llm.get_structured_completion", return_value=extraction):
        response = client.post(
            "/api/nda/chat",
            json=_request([{"role": "user", "content": "We're evaluating a partnership"}]),
        )
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "Got it, I've set the purpose."
    assert body["updates"]["purpose"] == "Evaluating a partnership"
    assert body["updated_field_names"] == ["purpose"]


def test_nested_party_updates_round_trip(client):
    extraction = NdaChatExtraction(
        reply="Got Ann's details.",
        updates=NdaFieldsPatch(party1=PartyFieldsPatch(name="Ann Lee", company="Acme Inc")),
        updated_field_names=["party1.name", "party1.company"],
    )
    with patch("app.routers.nda_chat.llm.get_structured_completion", return_value=extraction):
        response = client.post("/api/nda/chat", json=_request([{"role": "user", "content": "Ann Lee from Acme Inc"}]))
    assert response.status_code == 200
    assert response.json()["updates"]["party1"] == {
        "name": "Ann Lee",
        "title": None,
        "company": "Acme Inc",
        "address": None,
        "date": None,
    }


def test_hallucinated_claim_without_a_real_value_is_dropped(client):
    # Model claims it set governingLaw, but the value is blank -- the router
    # should not pass that claim through to the frontend's highlight.
    extraction = NdaChatExtraction(
        reply="Sure.",
        updates=NdaFieldsPatch(governingLaw="   "),
        updated_field_names=["governingLaw"],
    )
    with patch("app.routers.nda_chat.llm.get_structured_completion", return_value=extraction):
        response = client.post("/api/nda/chat", json=_request([{"role": "user", "content": "hi"}]))
    assert response.status_code == 200
    body = response.json()
    assert body["updates"]["governingLaw"] is None
    assert body["updated_field_names"] == []


def test_invalid_enum_value_normalized_away_without_failing_the_request(client):
    extraction = NdaChatExtraction(
        reply="Ok.",
        updates=NdaFieldsPatch(termType="not-a-real-value", governingLaw="Texas"),
        updated_field_names=["termType", "governingLaw"],
    )
    with patch("app.routers.nda_chat.llm.get_structured_completion", return_value=extraction):
        response = client.post("/api/nda/chat", json=_request([{"role": "user", "content": "hi"}]))
    assert response.status_code == 200
    body = response.json()
    assert body["updates"]["termType"] is None
    assert body["updates"]["governingLaw"] == "Texas"
    assert body["updated_field_names"] == ["governingLaw"]


def test_malformed_llm_output_degrades_to_200_not_an_error(client):
    with patch(
        "app.routers.nda_chat.llm.get_structured_completion",
        side_effect=llm.LlmMalformedOutputError(),
    ):
        response = client.post("/api/nda/chat", json=_request([{"role": "user", "content": "hi"}]))
    assert response.status_code == 200
    body = response.json()
    assert "rephrase" in body["reply"].lower()
    assert body["updated_field_names"] == []


def test_rate_limited_returns_429_with_error_code(client):
    with patch(
        "app.routers.nda_chat.llm.get_structured_completion",
        side_effect=llm.LlmRateLimitedError(),
    ):
        response = client.post("/api/nda/chat", json=_request([{"role": "user", "content": "hi"}]))
    assert response.status_code == 429
    assert response.json()["detail"]["error_code"] == "llm_rate_limited"


def test_timeout_returns_504_with_error_code(client):
    with patch(
        "app.routers.nda_chat.llm.get_structured_completion",
        side_effect=llm.LlmTimeoutError(),
    ):
        response = client.post("/api/nda/chat", json=_request([{"role": "user", "content": "hi"}]))
    assert response.status_code == 504
    assert response.json()["detail"]["error_code"] == "llm_timeout"


def test_unavailable_returns_502_with_error_code(client):
    with patch(
        "app.routers.nda_chat.llm.get_structured_completion",
        side_effect=llm.LlmUnavailableError(),
    ):
        response = client.post("/api/nda/chat", json=_request([{"role": "user", "content": "hi"}]))
    assert response.status_code == 502
    assert response.json()["detail"]["error_code"] == "llm_unavailable"


def test_history_is_capped_before_reaching_the_llm(client):
    many_messages = [{"role": "user", "content": f"message {i}"} for i in range(100)]
    extraction = NdaChatExtraction(reply="ok", updates=NdaFieldsPatch(), updated_field_names=[])
    with patch(
        "app.routers.nda_chat.llm.get_structured_completion", return_value=extraction
    ) as mock_completion:
        response = client.post("/api/nda/chat", json=_request(many_messages))
    assert response.status_code == 200
    sent_messages = mock_completion.call_args[0][0]
    # +1 for the system prompt prepended by build_llm_messages.
    assert len(sent_messages) == 40 + 1
    assert sent_messages[0]["role"] == "system"
    # The most recent messages are kept, not the oldest.
    assert sent_messages[-1]["content"] == "message 99"


def test_system_prompt_mentions_required_fields_when_missing(client):
    extraction = NdaChatExtraction(reply="ok", updates=NdaFieldsPatch(), updated_field_names=[])
    with patch(
        "app.routers.nda_chat.llm.get_structured_completion", return_value=extraction
    ) as mock_completion:
        client.post("/api/nda/chat", json=_request([{"role": "user", "content": "hi"}]))
    system_prompt = mock_completion.call_args[0][0][0]["content"]
    assert "governingLaw" in system_prompt
    assert "jurisdiction" in system_prompt


def test_current_fields_are_reflected_in_the_prompt(client):
    extraction = NdaChatExtraction(reply="ok", updates=NdaFieldsPatch(), updated_field_names=[])
    with patch(
        "app.routers.nda_chat.llm.get_structured_completion", return_value=extraction
    ) as mock_completion:
        client.post(
            "/api/nda/chat",
            json=_request(
                [{"role": "user", "content": "hi"}],
                current_fields={"governingLaw": "Delaware"},
            ),
        )
    system_prompt = mock_completion.call_args[0][0][0]["content"]
    assert "Delaware" in system_prompt


def test_empty_messages_list_is_accepted(client):
    # Empty history is a legitimate opening state (the greeting is
    # client-only), so this should reach the model, not be rejected.
    extraction = NdaChatExtraction(reply="Hi!", updates=NdaFieldsPatch(), updated_field_names=[])
    with patch("app.routers.nda_chat.llm.get_structured_completion", return_value=extraction):
        response = client.post("/api/nda/chat", json={"messages": []})
    assert response.status_code == 200
