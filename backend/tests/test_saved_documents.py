from __future__ import annotations

import uuid

import pytest

from app.schemas import MAX_SAVED_FIELDS_BYTES, MAX_SAVED_TURN_CHARS, MAX_SAVED_TURNS
from tests.conftest import sign_up

NDA_FIELDS = {"purpose": "Evaluating a deal", "effectiveDate": None, "party1": {"name": "Ada"}}


def _body(**overrides):
    return {
        "document_id": "mutual-nda",
        "title": "Mutual NDA — Acme / Globex",
        "transcript": [
            {"role": "user", "content": "An NDA with Globex"},
            {"role": "assistant", "content": "Great, what's it for?"},
        ],
        "fields": NDA_FIELDS,
    } | overrides


def _new_id() -> str:
    return str(uuid.uuid4())


def test_list_starts_empty(client):
    response = client.get("/api/saved-documents")
    assert response.status_code == 200
    assert response.json() == []


def test_put_creates_then_get_round_trips_everything(client):
    doc_id = _new_id()
    created = client.put(f"/api/saved-documents/{doc_id}", json=_body())
    assert created.status_code == 200
    body = created.json()
    assert body["id"] == doc_id
    assert body["document_id"] == "mutual-nda"
    # Fields are stored opaquely, including nested objects and nulls.
    assert body["fields"] == NDA_FIELDS
    assert body["transcript"][0] == {"role": "user", "content": "An NDA with Globex"}
    assert body["created_at"] and body["updated_at"]

    assert client.get(f"/api/saved-documents/{doc_id}").json() == body


def test_put_again_updates_the_same_document(client):
    doc_id = _new_id()
    client.put(f"/api/saved-documents/{doc_id}", json=_body())
    updated = client.put(
        f"/api/saved-documents/{doc_id}",
        json=_body(title="Renamed", fields={"purpose": "Changed"}, transcript=[]),
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Renamed"
    assert updated.json()["fields"] == {"purpose": "Changed"}
    assert updated.json()["transcript"] == []
    assert len(client.get("/api/saved-documents").json()) == 1


def test_list_returns_summaries_most_recent_first(client):
    first, second = _new_id(), _new_id()
    client.put(f"/api/saved-documents/{first}", json=_body(title="First"))
    client.put(f"/api/saved-documents/{second}", json=_body(title="Second", document_id="sla", fields={"customer": "Acme"}))

    listed = client.get("/api/saved-documents").json()
    assert [d["title"] for d in listed] == ["Second", "First"]
    assert listed[0]["document_id"] == "sla"
    assert "fields" not in listed[0] and "transcript" not in listed[0]


def test_delete_removes_the_document(client):
    doc_id = _new_id()
    client.put(f"/api/saved-documents/{doc_id}", json=_body())
    assert client.delete(f"/api/saved-documents/{doc_id}").status_code == 204
    assert client.get(f"/api/saved-documents/{doc_id}").status_code == 404
    assert client.delete(f"/api/saved-documents/{doc_id}").status_code == 404


def test_unknown_document_is_404(client):
    assert client.get(f"/api/saved-documents/{_new_id()}").status_code == 404


def test_malformed_id_is_rejected(client):
    assert client.get("/api/saved-documents/not-a-uuid").status_code == 422
    assert client.put("/api/saved-documents/not-a-uuid", json=_body()).status_code == 422


def test_unknown_document_type_is_rejected(client):
    response = client.put(f"/api/saved-documents/{_new_id()}", json=_body(document_id="no-such-doc"))
    assert response.status_code == 422


@pytest.mark.parametrize(
    "overrides",
    [
        {"transcript": [{"role": "user", "content": "hi"}] * (MAX_SAVED_TURNS + 1)},
        {"transcript": [{"role": "user", "content": "x" * (MAX_SAVED_TURN_CHARS + 1)}]},
        {"fields": {"purpose": "x" * MAX_SAVED_FIELDS_BYTES}},
    ],
    ids=["too-many-turns", "turn-too-long", "fields-too-large"],
)
def test_oversized_saves_are_rejected(client, overrides):
    response = client.put(f"/api/saved-documents/{_new_id()}", json=_body(**overrides))
    assert response.status_code == 422
    assert client.get("/api/saved-documents").json() == []


def test_saves_at_the_limits_are_accepted(client):
    body = _body(transcript=[{"role": "user", "content": "x" * MAX_SAVED_TURN_CHARS}] * MAX_SAVED_TURNS)
    assert client.put(f"/api/saved-documents/{_new_id()}", json=body).status_code == 200


def test_blank_title_is_rejected(client):
    response = client.put(f"/api/saved-documents/{_new_id()}", json=_body(title="   "))
    assert response.status_code == 422


def test_users_cannot_see_or_touch_each_others_documents(client):
    doc_id = _new_id()
    client.put(f"/api/saved-documents/{doc_id}", json=_body())
    other = sign_up(client, "other@example.com")

    assert client.get("/api/saved-documents", headers=other).json() == []
    assert client.get(f"/api/saved-documents/{doc_id}", headers=other).status_code == 404
    assert client.delete(f"/api/saved-documents/{doc_id}", headers=other).status_code == 404
    # An upsert onto someone else's id must not overwrite (or reveal) it.
    hijack = client.put(f"/api/saved-documents/{doc_id}", json=_body(title="Hijacked"), headers=other)
    assert hijack.status_code == 404
    assert client.get(f"/api/saved-documents/{doc_id}").json()["title"] == "Mutual NDA — Acme / Globex"


def test_saved_documents_are_wiped_on_restart(client, configure_env):
    from fastapi.testclient import TestClient

    from app.main import create_app

    client.put(f"/api/saved-documents/{_new_id()}", json=_body())
    with TestClient(create_app()) as restarted:
        headers = sign_up(restarted, "fixture-user@example.com")
        assert restarted.get("/api/saved-documents", headers=headers).json() == []
