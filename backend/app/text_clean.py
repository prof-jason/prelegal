"""Small, document-type-agnostic helpers for vetting values an LLM extracted.

Each returns None ("not actually set") instead of raising, so one bad value
never costs every other correctly-extracted field in the same turn.
"""

from __future__ import annotations

from datetime import datetime


def clean_str(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def clean_date(value: str | None) -> str | None:
    """A strict ISO YYYY-MM-DD date, or None."""
    value = clean_str(value)
    if value is None:
        return None
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        return None
    return value
