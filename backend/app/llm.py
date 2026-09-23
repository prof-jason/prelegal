"""Generic LiteLLM/OpenRouter/Cerebras structured-completion wrapper.

Deliberately has no knowledge of the Mutual NDA or any other document type
-- that domain logic (system prompts, field schemas, validation) lives in
modules like app.nda_chat. This split means adding AI chat for another
document type later reuses this module unchanged.
"""

from __future__ import annotations

from typing import TypeVar

import litellm.exceptions as litellm_exc
from litellm import completion
from pydantic import BaseModel, ValidationError

from app import config

MODEL = "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free"
EXTRA_BODY = {"provider": {"order": ["cerebras"]}}


class LlmError(Exception):
    """Base for every failure mode this module raises."""

    user_message = "Something went wrong talking to the assistant. Please try again."


class LlmTimeoutError(LlmError):
    user_message = "The assistant took too long to respond. Please try again."


class LlmRateLimitedError(LlmError):
    user_message = (
        "The assistant is receiving too many requests right now. "
        "Please wait a moment and try again."
    )


class LlmUnavailableError(LlmError):
    user_message = "The assistant is temporarily unavailable. Please try again in a moment."


class LlmMalformedOutputError(LlmError):
    """The model never returned output matching the requested schema, even
    after a retry. Callers are expected to catch this and degrade to a
    canned in-conversation reply rather than surface it as an HTTP error --
    a parsing hiccup shouldn't dead-end the chat.
    """

    user_message = "Sorry, I didn't quite catch that -- could you rephrase?"


T = TypeVar("T", bound=BaseModel)


def get_structured_completion(
    messages: list[dict],
    response_format: type[T],
    *,
    timeout: float | None = None,
    max_attempts: int = 2,
) -> T:
    """Call the model and parse its reply as `response_format`.

    Retries once (asking the model to reply with valid JSON) if the first
    reply doesn't parse, before giving up with LlmMalformedOutputError.
    """
    if not config.openrouter_api_key():
        raise LlmUnavailableError("OPENROUTER_API_KEY is not configured")

    timeout = timeout if timeout is not None else config.llm_timeout_seconds()
    last_error: Exception | None = None

    for _attempt in range(max_attempts):
        try:
            response = completion(
                model=MODEL,
                messages=messages,
                response_format=response_format,
                reasoning_effort="low",
                extra_body=EXTRA_BODY,
                timeout=timeout,
                api_key=config.openrouter_api_key(),
            )
        except litellm_exc.Timeout as e:
            raise LlmTimeoutError() from e
        except litellm_exc.RateLimitError as e:
            raise LlmRateLimitedError() from e
        except (litellm_exc.APIConnectionError, litellm_exc.ServiceUnavailableError, litellm_exc.APIError) as e:
            raise LlmUnavailableError() from e
        except Exception as e:  # belt-and-braces: no unmapped exception reaches the router as a raw 500
            raise LlmUnavailableError() from e

        # `content` is None for a legitimate response with no parseable text
        # (e.g. a refusal, a tool-call-only reply, or output truncated by
        # finish_reason="length") -- and choices can in principle be empty.
        # Both are "malformed output" from this function's point of view,
        # not a reason to let a raw TypeError/IndexError escape to the router.
        content = response.choices[0].message.content if response.choices else None
        if content is None:
            last_error = ValueError("model returned no content")
        else:
            try:
                return response_format.model_validate_json(content)
            except (ValueError, ValidationError) as e:
                last_error = e

        messages = [
            *messages,
            {
                "role": "user",
                "content": (
                    "Your previous reply was not valid JSON for the required "
                    "schema. Reply again with ONLY valid JSON matching that schema."
                ),
            },
        ]

    raise LlmMalformedOutputError() from last_error
