from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Protocol

import requests

from backend.config import Config

logger = logging.getLogger("llm_client")


@dataclass(frozen=True)
class LLMResult:
    text: str
    path: str  # "llm" or "deterministic"
    model: str | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    latency_ms: float | None = None
    http_status: int | None = None
    fallback_reason: str | None = None


class LLMClient(Protocol):
    def rephrase(self, system_prompt: str, user_context: str, fallback_text: str) -> LLMResult: ...


class NullLLMClient:
    """Zero-network stub used in tests: always takes the deterministic path."""

    def rephrase(self, system_prompt: str, user_context: str, fallback_text: str) -> LLMResult:
        return LLMResult(text=fallback_text, path="deterministic", fallback_reason="null_client")


class OpenRouterClient:
    def __init__(self, config: Config, timeout_s: float = 15.0) -> None:
        self._config = config
        self._timeout_s = timeout_s

    def rephrase(self, system_prompt: str, user_context: str, fallback_text: str) -> LLMResult:
        if not self._config.has_llm_key:
            logger.info("llm_call path=deterministic reason=no_api_key")
            return LLMResult(text=fallback_text, path="deterministic", fallback_reason="no_api_key")

        response, latency_ms, error = self._post(system_prompt, user_context)
        if error is not None:
            logger.warning("llm_call path=deterministic reason=%s latency_ms=%.0f", error, latency_ms)
            return LLMResult(text=fallback_text, path="deterministic", fallback_reason=error, latency_ms=latency_ms)

        if response.status_code != 200:
            logger.warning(
                "llm_call path=deterministic reason=http_error status=%s latency_ms=%.0f",
                response.status_code, latency_ms,
            )
            return LLMResult(
                text=fallback_text, path="deterministic", fallback_reason="http_error",
                http_status=response.status_code, latency_ms=latency_ms,
            )

        return self._parse_response(response, latency_ms, fallback_text)

    def _post(self, system_prompt: str, user_context: str):
        payload = {
            "model": self._config.openrouter_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_context},
            ],
            "max_tokens": 300,
            "temperature": 0.2,
        }
        headers = {
            "Authorization": f"Bearer {self._config.openrouter_api_key}",
            "Content-Type": "application/json",
        }
        started = time.monotonic()
        try:
            response = requests.post(
                self._config.openrouter_base_url, json=payload, headers=headers, timeout=self._timeout_s
            )
        except requests.RequestException:
            return None, (time.monotonic() - started) * 1000, "network_error"
        return response, (time.monotonic() - started) * 1000, None

    def _parse_response(self, response: requests.Response, latency_ms: float, fallback_text: str) -> LLMResult:
        try:
            body = response.json()
            text = body["choices"][0]["message"]["content"]
            if not isinstance(text, str) or not text.strip():
                raise ValueError("empty content")
            usage = body.get("usage") or {}
            model = body.get("model")
        except (KeyError, IndexError, ValueError, TypeError) as exc:
            logger.warning(
                "llm_call path=deterministic reason=invalid_shape error=%s latency_ms=%.0f", exc, latency_ms
            )
            return LLMResult(
                text=fallback_text, path="deterministic", fallback_reason="invalid_shape",
                http_status=response.status_code, latency_ms=latency_ms,
            )

        logger.info(
            "llm_call path=llm model=%s prompt_tokens=%s completion_tokens=%s latency_ms=%.0f http_status=%s",
            model, usage.get("prompt_tokens"), usage.get("completion_tokens"), latency_ms, response.status_code,
        )
        return LLMResult(
            text=text.strip(), path="llm", model=model,
            prompt_tokens=usage.get("prompt_tokens"), completion_tokens=usage.get("completion_tokens"),
            latency_ms=latency_ms, http_status=response.status_code,
        )
