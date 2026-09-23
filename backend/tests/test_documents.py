from __future__ import annotations

import json
import re

import pytest

from app import documents
from app.config import REPO_ROOT
from app.documents import NDA_ID, DocumentConfigError, DocumentType, build_generic_document
from app.field_hints import DOCUMENT_HINTS, SHARED_HINTS


@pytest.fixture()
def registry(configure_env):
    return documents.load_registry()


def _doc(doc_id: str = "test-doc") -> DocumentType:
    return DocumentType(doc_id, "Test", "A test document", "generic")


def test_every_catalog_entry_is_covered_and_nda_entries_merge(registry):
    catalog = json.loads((REPO_ROOT / "catalog.json").read_text())
    ids = [d.id for d in registry.documents]
    # Two Mutual NDA catalog entries -> one document.
    assert len(ids) == len(catalog) - 1 == len(set(ids))
    assert ids.count(NDA_ID) == 1
    assert {d.kind for d in registry.documents if d.id == NDA_ID} == {"nda"}
    assert len(registry.generic) == len(ids) - 1


def test_generic_documents_keep_catalog_name_and_description(registry):
    catalog = {e["name"]: e["description"] for e in json.loads((REPO_ROOT / "catalog.json").read_text())}
    for doc in registry.generic.values():
        assert catalog[doc.doc.name] == doc.doc.description


def test_every_generic_document_has_fields_and_two_parties(registry):
    for doc in registry.generic.values():
        assert doc.terms, doc.doc.id
        assert len(doc.parties) == 2
        assert [f.key for f in doc.parties[0].fields][0] == "party1_company"


def test_every_link_span_is_tagged_with_a_known_field_or_role(registry):
    for doc in registry.generic.values():
        keys = {f.key for f in doc.terms}
        spans = re.findall(r'<span class="\w+_link"[^>]*>', doc.markdown)
        assert spans
        for span in spans:
            field = re.search(r'data-field="([^"]+)"', span)
            role = re.search(r'data-role="(party1|party2|signature)"', span)
            assert bool(field) != bool(role), span
            if field:
                assert field.group(1) in keys


def test_possessives_and_plurals_fold_into_one_field():
    template = (
        '1. <span class="orderform_link">Subscription Period</span> and '
        '<span class="orderform_link">Subscription Periods</span> and '
        '<span class="keyterms_link">Provider Covered Claims</span> and '
        '<span class="keyterms_link">Provider Covered Claim</span>.'
    )
    doc = build_generic_document(_doc(), ("Provider", "Customer"), template)
    assert [f.label for f in doc.terms] == ["Subscription Period", "Provider Covered Claims"]


def test_party_role_spans_are_not_fields_even_when_they_share_a_class():
    template = (
        '1. <span class="orderform_link">Provider’s</span> duties to '
        "<span class=\"orderform_link\">Customer's</span> for the "
        '<span class="orderform_link">Pilot Period</span>.'
    )
    doc = build_generic_document(_doc(), ("Provider", "Customer"), template)
    assert [f.label for f in doc.terms] == ["Pilot Period"]
    assert 'data-role="party1">Provider’s</span>' in doc.markdown
    assert "data-role=\"party2\">Customer's</span>" in doc.markdown


def test_headings_and_definition_spans_are_not_fields():
    template = '1. <span class="header_2" id="1">Uptime</span>\n    1. <span id="4.1">**"Term"**</span> means x.'
    doc = build_generic_document(_doc(), ("Provider", "Customer"), template)
    assert doc.terms == ()
    assert doc.markdown == template


def test_notice_address_is_left_to_the_signature_block():
    template = '1. Send notices to the <span class="keyterms_link">Notice Address</span>.'
    doc = build_generic_document(_doc(), ("Provider", "Partner"), template)
    assert doc.terms == ()
    assert 'data-role="signature"' in doc.markdown


def test_group_and_type_come_from_class_and_date_fields():
    template = '1. <span class="keyterms_link">Effective Date</span> <span class="sow_link">Deliverables</span>'
    doc = build_generic_document(_doc(), ("Provider", "Customer"), template)
    effective, deliverables = doc.terms
    assert (effective.key, effective.type, effective.group) == ("effective_date", "date", "Key Terms")
    assert (deliverables.type, deliverables.group) == ("text", "Statement of Work")


def test_every_derived_field_has_a_curated_hint_and_no_hint_is_orphaned(registry):
    used_shared: set[str] = set()
    for doc_id, doc in registry.generic.items():
        labels = {f.label for f in doc.terms}
        specific = DOCUMENT_HINTS.get(doc_id, {})
        assert set(specific) <= labels, f"{doc_id}: hints for unknown fields {set(specific) - labels}"
        for label in labels:
            assert label in specific or label in SHARED_HINTS, f"{doc_id}: no hint for {label!r}"
            if label not in specific and label in SHARED_HINTS:
                used_shared.add(label)
    assert set(DOCUMENT_HINTS) <= set(registry.generic)
    assert set(SHARED_HINTS) == used_shared, f"unused shared hints: {set(SHARED_HINTS) - used_shared}"


def test_catalog_entry_without_registry_metadata_fails_loudly(tmp_path, monkeypatch, configure_env):
    catalog = tmp_path / "catalog.json"
    catalog.write_text(json.dumps([{"name": "Lease", "description": "A lease", "filename": "lease.md"}]))
    monkeypatch.setenv("PRELEGAL_CATALOG_PATH", str(catalog))
    with pytest.raises(DocumentConfigError, match="lease.md"):
        documents.load_registry()


def test_missing_template_fails_loudly(tmp_path, monkeypatch, configure_env):
    monkeypatch.setenv("PRELEGAL_TEMPLATES_DIR", str(tmp_path))
    with pytest.raises(DocumentConfigError, match="template not found"):
        documents.load_registry()
