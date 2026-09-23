"""Maps app.llm failures to the HTTP error envelope every chat endpoint
returns: {"detail": {"error_code", "message"}}.

LlmMalformedOutputError is deliberately not handled here -- each chat
endpoint degrades that to a normal 200 in-chat reply instead.
"""

from __future__ import annotations

from fastapi import HTTPException, status

from app import llm

_STATUS: list[tuple[type[llm.LlmError], int, str]] = [
    (llm.LlmRateLimitedError, status.HTTP_429_TOO_MANY_REQUESTS, "llm_rate_limited"),
    (llm.LlmTimeoutError, status.HTTP_504_GATEWAY_TIMEOUT, "llm_timeout"),
]


def http_exception(error: llm.LlmError) -> HTTPException:
    for error_type, status_code, error_code in _STATUS:
        if isinstance(error, error_type):
            return HTTPException(status_code, {"error_code": error_code, "message": error.user_message})
    return HTTPException(
        status.HTTP_502_BAD_GATEWAY, {"error_code": "llm_unavailable", "message": error.user_message}
    )
