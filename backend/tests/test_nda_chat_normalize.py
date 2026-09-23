from __future__ import annotations

from app.nda_chat import normalize_patch, reconcile_field_names
from app.schemas import NdaFieldsPatch, PartyFieldsPatch


def test_blank_strings_become_none():
    raw = NdaFieldsPatch(purpose="  ", governingLaw="   ")
    normalized = normalize_patch(raw)
    assert normalized.purpose is None
    assert normalized.governingLaw is None


def test_valid_values_pass_through_trimmed():
    raw = NdaFieldsPatch(governingLaw="  Delaware ", jurisdiction="New Castle, DE")
    normalized = normalize_patch(raw)
    assert normalized.governingLaw == "Delaware"
    assert normalized.jurisdiction == "New Castle, DE"


def test_invalid_term_type_dropped_but_other_fields_survive():
    raw = NdaFieldsPatch(termType="whenever", governingLaw="Texas")
    normalized = normalize_patch(raw)
    assert normalized.termType is None
    assert normalized.governingLaw == "Texas"


def test_invalid_confidentiality_type_dropped():
    raw = NdaFieldsPatch(confidentialityType="forever")
    assert normalize_patch(raw).confidentialityType is None


def test_valid_enum_values_kept():
    raw = NdaFieldsPatch(termType="continues", confidentialityType="perpetuity")
    normalized = normalize_patch(raw)
    assert normalized.termType == "continues"
    assert normalized.confidentialityType == "perpetuity"


def test_invalid_date_dropped():
    raw = NdaFieldsPatch(effectiveDate="next Tuesday")
    assert normalize_patch(raw).effectiveDate is None


def test_valid_iso_date_kept():
    raw = NdaFieldsPatch(effectiveDate="2026-03-05")
    assert normalize_patch(raw).effectiveDate == "2026-03-05"


def test_valid_years_kept():
    raw = NdaFieldsPatch(termYears="5", confidentialityYears="99")
    normalized = normalize_patch(raw)
    assert normalized.termYears == "5"
    assert normalized.confidentialityYears == "99"


def test_non_numeric_years_dropped():
    raw = NdaFieldsPatch(termYears="a decade")
    assert normalize_patch(raw).termYears is None


def test_years_with_text_dropped():
    # A value like "10 years" (rather than a bare "10") must not silently
    # become a different number, or be treated as an unbounded string.
    raw = NdaFieldsPatch(termYears="10 years")
    assert normalize_patch(raw).termYears is None


def test_out_of_range_years_dropped_not_clamped():
    raw = NdaFieldsPatch(termYears="500", confidentialityYears="0")
    normalized = normalize_patch(raw)
    assert normalized.termYears is None
    assert normalized.confidentialityYears is None


def test_boundary_years_kept():
    raw = NdaFieldsPatch(termYears="1", confidentialityYears="99")
    normalized = normalize_patch(raw)
    assert normalized.termYears == "1"
    assert normalized.confidentialityYears == "99"


def test_party_fields_cleaned_and_partial():
    raw = NdaFieldsPatch(party1=PartyFieldsPatch(name="Ann Lee", title="  ", date="not-a-date"))
    normalized = normalize_patch(raw)
    assert normalized.party1.name == "Ann Lee"
    assert normalized.party1.title is None
    assert normalized.party1.date is None


def test_all_empty_party_becomes_none():
    raw = NdaFieldsPatch(party1=PartyFieldsPatch(name="  ", title=None))
    normalized = normalize_patch(raw)
    assert normalized.party1 is None


def test_missing_party_stays_none():
    raw = NdaFieldsPatch()
    assert normalize_patch(raw).party1 is None
    assert normalize_patch(raw).party2 is None


def test_reconcile_keeps_claims_backed_by_real_values():
    normalized = NdaFieldsPatch(governingLaw="Delaware")
    result = reconcile_field_names(["governingLaw"], normalized)
    assert result == ["governingLaw"]


def test_reconcile_drops_claims_not_backed_by_a_value():
    normalized = NdaFieldsPatch(governingLaw=None)
    result = reconcile_field_names(["governingLaw", "jurisdiction"], normalized)
    assert result == []


def test_reconcile_handles_dotted_party_paths():
    normalized = NdaFieldsPatch(party1=PartyFieldsPatch(name="Ann Lee"))
    result = reconcile_field_names(["party1.name", "party1.title"], normalized)
    assert result == ["party1.name"]


def test_reconcile_handles_dotted_path_when_party_missing_entirely():
    normalized = NdaFieldsPatch()
    result = reconcile_field_names(["party1.name"], normalized)
    assert result == []
