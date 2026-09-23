from __future__ import annotations

from unittest.mock import MagicMock, patch

import litellm.exceptions as litellm_exc
import pytest
from pydantic import BaseModel

from app import llm


class Foo(BaseModel):
    x: int


def _fake_response(content: str):
    response = MagicMock()
    response.choices = [MagicMock(message=MagicMock(content=content))]
    return response


def test_missing_api_key_raises_without_calling_completion(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    with patch("app.llm.completion") as mock_completion:
        with pytest.raises(llm.LlmUnavailableError):
            llm.get_structured_completion([], Foo)
        mock_completion.assert_not_called()


def test_success_parses_response(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    with patch("app.llm.completion", return_value=_fake_response('{"x": 5}')):
        result = llm.get_structured_completion([], Foo)
    assert result == Foo(x=5)


def test_timeout_mapped_to_llm_timeout_error(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    with patch("app.llm.completion", side_effect=litellm_exc.Timeout("slow", model="m", llm_provider="p")):
        with pytest.raises(llm.LlmTimeoutError):
            llm.get_structured_completion([], Foo)


def test_rate_limit_mapped_to_llm_rate_limited_error(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    error = litellm_exc.RateLimitError("too many", model="m", llm_provider="p")
    with patch("app.llm.completion", side_effect=error):
        with pytest.raises(llm.LlmRateLimitedError):
            llm.get_structured_completion([], Foo)


def test_connection_error_mapped_to_llm_unavailable_error(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    error = litellm_exc.APIConnectionError("down", model="m", llm_provider="p")
    with patch("app.llm.completion", side_effect=error):
        with pytest.raises(llm.LlmUnavailableError):
            llm.get_structured_completion([], Foo)


def test_unmapped_exception_still_becomes_llm_unavailable_error(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    with patch("app.llm.completion", side_effect=RuntimeError("boom")):
        with pytest.raises(llm.LlmUnavailableError):
            llm.get_structured_completion([], Foo)


def test_bad_json_is_retried_then_succeeds(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    responses = [_fake_response("not json"), _fake_response('{"x": 1}')]
    with patch("app.llm.completion", side_effect=responses) as mock_completion:
        result = llm.get_structured_completion([{"role": "user", "content": "hi"}], Foo)
    assert result == Foo(x=1)
    assert mock_completion.call_count == 2


def test_bad_json_after_max_attempts_raises_malformed_output_error(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    with patch("app.llm.completion", return_value=_fake_response("still not json")) as mock_completion:
        with pytest.raises(llm.LlmMalformedOutputError):
            llm.get_structured_completion([], Foo, max_attempts=2)
    assert mock_completion.call_count == 2


def test_none_content_is_treated_as_malformed_output_not_a_crash(monkeypatch):
    # A legitimate response can still have no parseable text (a refusal, a
    # tool-call-only reply, output truncated by finish_reason="length"...).
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    with patch("app.llm.completion", return_value=_fake_response(None)):
        with pytest.raises(llm.LlmMalformedOutputError):
            llm.get_structured_completion([], Foo, max_attempts=2)


def test_empty_choices_is_treated_as_malformed_output_not_a_crash(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    empty_response = MagicMock()
    empty_response.choices = []
    with patch("app.llm.completion", return_value=empty_response):
        with pytest.raises(llm.LlmMalformedOutputError):
            llm.get_structured_completion([], Foo, max_attempts=2)


def test_none_content_then_valid_content_succeeds_on_retry(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    responses = [_fake_response(None), _fake_response('{"x": 2}')]
    with patch("app.llm.completion", side_effect=responses) as mock_completion:
        result = llm.get_structured_completion([], Foo)
    assert result == Foo(x=2)
    assert mock_completion.call_count == 2
