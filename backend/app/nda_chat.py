"""AI chat logic specific to the Mutual NDA: prompt construction, the LLM's
structured-output contract, and validating/normalizing what it returns.

Kept separate from app.llm (which has no NDA-specific knowledge) so a future
document type can add its own `<doctype>_chat.py` alongside this one,
reusing app.llm.get_structured_completion unchanged.
"""

from __future__ import annotations

from pydantic import BaseModel

from app import llm
from app.schemas import ChatTurn, NdaFieldsPatch, PartyFieldsPatch
from app.text_clean import clean_date as _clean_date
from app.text_clean import clean_str as _clean_str

# Sent to the LLM every turn (no server-side conversation persistence -- the
# client resends the full transcript). Capped so a very long back-and-forth
# doesn't grow the prompt unbounded; current_fields (also sent fresh every
# turn) carries every confirmed value forward regardless of what's trimmed,
# so only conversational backstory is ever lost, not data.
MAX_HISTORY_MESSAGES = 40

_VALID_TERM_TYPES = {"expires", "continues"}
_VALID_CONFIDENTIALITY_TYPES = {"years", "perpetuity"}

FIELD_CATALOG = """\
- purpose: free text -- what Confidential Information may be used for.
- effectiveDate: ISO date YYYY-MM-DD. If the user doesn't care, it's fine to leave unset -- the app defaults it to today.
- termType: "expires" (the MNDA ends after termYears) or "continues" (runs until terminated).
- termYears: whole number 1-99, only meaningful if termType is "expires".
- confidentialityType: "years" or "perpetuity".
- confidentialityYears: whole number 1-99, only meaningful if confidentialityType is "years".
- governingLaw: a US state, e.g. "Delaware". REQUIRED -- always make sure this gets set.
- jurisdiction: city/county + state for disputes, e.g. "New Castle, DE". REQUIRED -- always make sure this gets set.
- modifications: optional free-text special terms/amendments.
- party1 / party2: each has name (signer), title, company, address (email or postal, for notices), date (signing date, YYYY-MM-DD).\
"""


class NdaChatExtraction(BaseModel):
    """The LLM's own structured-output contract (passed as response_format).

    Internal to this module -- the public HTTP contract is
    schemas.NdaChatResponse, built from this after normalize_patch/
    reconcile_field_names have vetted it.
    """

    reply: str
    updates: NdaFieldsPatch = NdaFieldsPatch()
    updated_field_names: list[str] = []


def _describe_current_fields(fields: NdaFieldsPatch) -> str:
    """Human-readable "here's what we already know" block for the prompt,
    skipping anything unset so the model doesn't waste words on blanks."""
    lines: list[str] = []
    for name, value in fields.model_dump(exclude={"party1", "party2"}).items():
        if value not in (None, ""):
            lines.append(f"- {name}: {value}")
    for party_name in ("party1", "party2"):
        party = getattr(fields, party_name)
        if party is None:
            continue
        for name, value in party.model_dump().items():
            if value not in (None, ""):
                lines.append(f"- {party_name}.{name}: {value}")
    return "\n".join(lines) if lines else "(nothing yet)"


def build_system_prompt(current_fields: NdaFieldsPatch) -> str:
    return f"""\
You are a friendly assistant helping a user fill in a Mutual Non-Disclosure Agreement \
(Common Paper Mutual NDA standard form). Have a natural conversation, asking about one \
or two things at a time rather than listing every field at once.

Fields you're collecting:
{FIELD_CATALOG}

Rules:
- Only set a field's value in `updates` if the user actually stated it. Never guess or \
invent a name, date, company, or state. This applies to effectiveDate and the parties' \
signing dates too: leave them unset unless the user gives an actual date -- do NOT fill \
in today's date, a guessed date, or any placeholder date yourself. If you're not sure, \
leave it unset and ask.
- Keep asking follow-up questions until both governingLaw and jurisdiction are set \
(either from the user's answers or already present below) -- these are the only two \
fields this app strictly requires.
- Whenever you set a field this turn, say so in your reply in plain language (e.g. \
"Got it, I've set the governing law to Delaware.") so the user can see and correct it.
- List the dotted names of every field you set this turn (e.g. "governingLaw", \
"party1.name") in `updated_field_names`.
- Keep replies short and conversational.

What's already been collected so far:
{_describe_current_fields(current_fields)}
"""


def build_llm_messages(history: list[ChatTurn], current_fields: NdaFieldsPatch) -> list[dict]:
    capped = history[-MAX_HISTORY_MESSAGES:]
    return [
        {"role": "system", "content": build_system_prompt(current_fields)},
        *[{"role": m.role, "content": m.content} for m in capped],
    ]


def _clean_enum(value: str | None, valid: set[str]) -> str | None:
    value = _clean_str(value)
    return value if value in valid else None


# Matches frontend/src/lib/nda.ts's MAX_YEARS.
_MAX_YEARS = 99


def _clean_years(value: str | None) -> str | None:
    """Whole number 1-99, as a string (matching NdaForm.termYears' type) --
    or None if the model didn't extract something that actually fits.

    Deliberately drops rather than clamps an out-of-range value (e.g.
    "500"): silently substituting a different number the model never said
    would be its own kind of hallucination.
    """
    value = _clean_str(value)
    if value is None:
        return None
    try:
        n = int(value)
    except ValueError:
        return None
    return str(n) if 1 <= n <= _MAX_YEARS else None


def _normalize_party(party: PartyFieldsPatch | None) -> PartyFieldsPatch | None:
    if party is None:
        return None
    cleaned = PartyFieldsPatch(
        name=_clean_str(party.name),
        title=_clean_str(party.title),
        company=_clean_str(party.company),
        address=_clean_str(party.address),
        date=_clean_date(party.date),
    )
    # Drop an all-empty party patch entirely rather than sending an object
    # of all-None fields.
    return cleaned if cleaned.model_dump(exclude_none=True) else None


def normalize_patch(raw: NdaFieldsPatch) -> NdaFieldsPatch:
    """Vet whatever the LLM extracted before it reaches the frontend.

    Blank/whitespace-only strings and invalid enum/date values become None
    ("not actually set") rather than raising -- one bad field should never
    cost every other correctly-extracted field in the same turn.
    """
    return NdaFieldsPatch(
        purpose=_clean_str(raw.purpose),
        effectiveDate=_clean_date(raw.effectiveDate),
        termType=_clean_enum(raw.termType, _VALID_TERM_TYPES),
        termYears=_clean_years(raw.termYears),
        confidentialityType=_clean_enum(raw.confidentialityType, _VALID_CONFIDENTIALITY_TYPES),
        confidentialityYears=_clean_years(raw.confidentialityYears),
        governingLaw=_clean_str(raw.governingLaw),
        jurisdiction=_clean_str(raw.jurisdiction),
        modifications=_clean_str(raw.modifications),
        party1=_normalize_party(raw.party1),
        party2=_normalize_party(raw.party2),
    )


def _get_dotted(patch: NdaFieldsPatch, dotted_name: str) -> object:
    parts = dotted_name.split(".")
    value: object = patch
    for part in parts:
        if value is None or not hasattr(value, part):
            return None
        value = getattr(value, part)
    return value


def reconcile_field_names(claimed: list[str], normalized: NdaFieldsPatch) -> list[str]:
    """Drop any field name the model *claims* to have set whose value didn't
    actually survive normalization -- guards the UI's "just updated"
    highlight against a claim that isn't backed by a real value.
    """
    return [name for name in claimed if _get_dotted(normalized, name) not in (None, "")]


def degraded_extraction() -> NdaChatExtraction:
    """What to return when the model never produced parseable output, even
    after a retry (app.llm.LlmMalformedOutputError). A parsing hiccup should
    read as an awkward reply, not break the chat. Reuses that error's own
    user_message so the wording lives in exactly one place.
    """
    return NdaChatExtraction(
        reply=llm.LlmMalformedOutputError().user_message, updates=NdaFieldsPatch(), updated_field_names=[]
    )
