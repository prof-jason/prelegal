"""The document registry: every catalog document type, and -- for the
template-driven ("generic") ones -- the fillable fields derived from the
template itself.

catalog.json stays the single source of each document's name/description/
filename. This module adds only what the catalog can't say: a stable id,
which documents share one experience (the Mutual NDA's cover page and
standard terms are one document), and each generic document's two party
roles.

Generic documents' fields come straight from their template: every
`<span class="xxx_link">Term</span>` is a variable the Common Paper standard
terms define on a cover page / order form / key terms page. The template is
re-served with each such span tagged (data-field / data-role) so the
frontend never has to re-derive which span belongs to which field.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Literal

from app import config
from app.field_hints import DATE_FIELDS, hint_for

NDA_ID = "mutual-nda"

# Keyed by catalog.json filename. A tuple is a generic document's two party
# roles, in the order they appear on the signature block; NDA_ID marks the
# bespoke Mutual NDA experience.
_DOCUMENT_META: dict[str, tuple[str, str] | str] = {
    "Mutual-NDA-coverpage.md": NDA_ID,
    "Mutual-NDA.md": NDA_ID,
    "AI-Addendum.md": ("Provider", "Customer"),
    "BAA.md": ("Provider", "Company"),
    "CSA.md": ("Provider", "Customer"),
    "DPA.md": ("Provider", "Customer"),
    "design-partner-agreement.md": ("Provider", "Partner"),
    "psa.md": ("Provider", "Customer"),
    "Partnership-Agreement.md": ("Company", "Partner"),
    "Pilot-Agreement.md": ("Provider", "Customer"),
    "sla.md": ("Provider", "Customer"),
    "Software-License-Agreement.md": ("Provider", "Customer"),
}

_NDA_NAME = "Mutual Non-Disclosure Agreement"
_NDA_DESCRIPTION = (
    "Mutual NDA (cover page and standard terms) for two parties sharing confidential "
    "information, capturing purpose, term and party details."
)

# Human-readable group names for the template's variable span classes.
_GROUP_LABELS = {
    "coverpage": "Cover Page",
    "keyterms": "Key Terms",
    "orderform": "Order Form",
    "businessterms": "Business Terms",
    "sow": "Statement of Work",
}

# (key suffix, label, type) for each party's signature-block fields -- the
# same shape as the Mutual NDA's Party.
_PARTY_ATTRS: tuple[tuple[str, str, Literal["text", "date"]], ...] = (
    ("company", "Company name", "text"),
    ("name", "Signer name", "text"),
    ("title", "Signer title", "text"),
    ("address", "Notice address", "text"),
    ("date", "Signing date", "date"),
)

# Terms the signature block already captures per party, so they aren't
# collected as a separate field (each party's notice address is there).
_SIGNATURE_BLOCK_TERMS = ("Notice Address",)

_LINK_SPAN_RE = re.compile(r'<span class="(\w+)_link"([^>]*)>(.*?)</span>', re.DOTALL)


class DocumentConfigError(Exception):
    """catalog.json and this registry (or a template) disagree. Raised at
    startup so a broken deploy fails loudly instead of on first use."""


@dataclass(frozen=True)
class DocumentField:
    key: str
    label: str
    hint: str
    type: Literal["text", "date"]
    group: str


@dataclass(frozen=True)
class PartyBlock:
    role: str
    fields: tuple[DocumentField, ...]


@dataclass(frozen=True)
class DocumentType:
    id: str
    name: str
    description: str
    kind: Literal["nda", "generic"]


@dataclass(frozen=True)
class GenericDocument:
    doc: DocumentType
    terms: tuple[DocumentField, ...]
    parties: tuple[PartyBlock, PartyBlock]
    # The template with every variable span tagged; see module docstring.
    markdown: str

    @property
    def all_fields(self) -> tuple[DocumentField, ...]:
        return self.terms + tuple(f for p in self.parties for f in p.fields)


@dataclass(frozen=True)
class Registry:
    documents: tuple[DocumentType, ...]
    generic: dict[str, GenericDocument]


def _canonical_term(raw: str) -> str:
    """Span text as a term name: tags/markdown stripped, possessive dropped
    ("Provider’s" -> "Provider")."""
    text = re.sub(r"<[^>]+>|\*", "", raw).replace("’", "'").strip()
    return re.sub(r"'s?$", "", text).strip()


def _merge_key(term: str) -> str:
    """Dedup key only: case-insensitive, singular/plural folded, so
    "Subscription Period" and "Subscription Periods" are one field."""
    return re.sub(r"s$", "", term.lower())


def slugify(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")


def build_generic_document(doc: DocumentType, roles: tuple[str, str], template: str) -> GenericDocument:
    """Derive a template's fields (document order, deduped) and tag its spans."""
    role_keys = {_merge_key(role): f"party{i + 1}" for i, role in enumerate(roles)}
    signature_keys = {_merge_key(term) for term in _SIGNATURE_BLOCK_TERMS}
    terms: dict[str, DocumentField] = {}

    def tag(match: re.Match[str]) -> str:
        css_class, attrs, inner = match.groups()
        merge_key = _merge_key(_canonical_term(inner))
        if merge_key in role_keys:
            data = f'data-role="{role_keys[merge_key]}"'
        elif merge_key in signature_keys:
            data = 'data-role="signature"'
        else:
            if merge_key not in terms:
                label = _canonical_term(inner)
                terms[merge_key] = DocumentField(
                    key=slugify(label),
                    label=label,
                    hint=hint_for(doc.id, label),
                    type="date" if label in DATE_FIELDS else "text",
                    group=_GROUP_LABELS.get(css_class, css_class.title()),
                )
            data = f'data-field="{terms[merge_key].key}"'
        return f'<span class="{css_class}_link"{attrs} {data}>{inner}</span>'

    markdown = _LINK_SPAN_RE.sub(tag, template)
    parties = tuple(
        PartyBlock(
            role=role,
            fields=tuple(
                DocumentField(
                    key=f"party{i + 1}_{suffix}",
                    label=label,
                    hint=f"The {role}'s {label.lower()}.",
                    type=type_,
                    group=role,
                )
                for suffix, label, type_ in _PARTY_ATTRS
            ),
        )
        for i, role in enumerate(roles)
    )
    result = GenericDocument(doc=doc, terms=tuple(terms.values()), parties=parties, markdown=markdown)  # type: ignore[arg-type]
    keys = [f.key for f in result.all_fields]
    if len(keys) != len(set(keys)):
        raise DocumentConfigError(f"{doc.id}: duplicate field keys {keys}")
    return result


def load_registry() -> Registry:
    """Read catalog.json and every generic template, validating as it goes."""
    path = config.catalog_path()
    if not path.is_file():
        raise DocumentConfigError(f"catalog not found at {path}")
    entries = json.loads(path.read_text())

    documents: list[DocumentType] = []
    generic: dict[str, GenericDocument] = {}
    for entry in entries:
        meta = _DOCUMENT_META.get(entry["filename"])
        if meta is None:
            raise DocumentConfigError(f"catalog entry {entry['filename']!r} has no registry metadata")
        if meta == NDA_ID:
            if not any(d.id == NDA_ID for d in documents):
                documents.append(DocumentType(NDA_ID, _NDA_NAME, _NDA_DESCRIPTION, "nda"))
            continue
        doc = DocumentType(
            id=entry["filename"].removesuffix(".md").lower(),
            name=entry["name"],
            description=entry["description"],
            kind="generic",
        )
        template_path = config.templates_dir() / entry["filename"]
        if not template_path.is_file():
            raise DocumentConfigError(f"template not found at {template_path}")
        generic[doc.id] = build_generic_document(doc, meta, template_path.read_text())  # type: ignore[arg-type]
        documents.append(doc)
    return Registry(documents=tuple(documents), generic=generic)


_registry: Registry | None = None


def reload() -> Registry:
    """(Re)load the registry -- called once at app startup."""
    global _registry
    _registry = load_registry()
    return _registry


def registry() -> Registry:
    return _registry if _registry is not None else reload()


def list_documents() -> tuple[DocumentType, ...]:
    return registry().documents


def get_document(doc_id: str) -> DocumentType | None:
    return next((d for d in list_documents() if d.id == doc_id), None)


def get_generic(doc_id: str) -> GenericDocument | None:
    return registry().generic.get(doc_id)
