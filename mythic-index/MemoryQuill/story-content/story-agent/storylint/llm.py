from __future__ import annotations

from dataclasses import dataclass
import json
import os
import time
from typing import Protocol

import httpx


class LLMError(RuntimeError):
    pass


class LLMClient(Protocol):
    def generate(self, prompt: str) -> str:  # pragma: no cover - protocol signature
        ...


@dataclass
class LLMSettings:
    provider: str
    model: str
    timeout_sec: float = 60.0
    max_retries: int = 2
    backoff_sec: float = 2.0


class MockLLMClient:
    def generate(self, prompt: str) -> str:
        response = {
            "overall_quality": 3,
            "strengths": ["Clear scene framing."],
            "risks": ["Continuity details need confirmation."],
            "issues": [],
            "questions": ["Are the scene outcomes aligned with the character arcs?"],
            "opportunities": ["Add a short reflection beat after each major scene."],
            "confidence": 0.3,
        }
        return json.dumps(response)


class OpenAIChatClient:
    def __init__(self, model: str, timeout_sec: float = 60.0):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise LLMError("OPENAI_API_KEY is not set.")
        self._api_key = api_key
        self._model = model
        self._timeout = timeout_sec

    def generate(self, prompt: str) -> str:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": "You are a precise narrative quality auditor."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        }
        with httpx.Client(timeout=self._timeout) as client:
            response = client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=payload,
            )
        response.raise_for_status()
        data = response.json()
        try:
            return data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise LLMError(f"Unexpected OpenAI response shape: {data}") from exc


def get_client(settings: LLMSettings) -> LLMClient:
    if settings.provider == "mock":
        return MockLLMClient()
    if settings.provider == "openai":
        return OpenAIChatClient(model=settings.model, timeout_sec=settings.timeout_sec)
    raise LLMError(f"Unknown provider: {settings.provider}")


def generate_with_retries(client: LLMClient, prompt: str, settings: LLMSettings) -> str:
    last_error: Exception | None = None
    for attempt in range(settings.max_retries + 1):
        try:
            return client.generate(prompt)
        except (httpx.HTTPError, LLMError) as exc:
            last_error = exc
            if attempt >= settings.max_retries:
                break
            time.sleep(settings.backoff_sec * (2 ** attempt))
    raise LLMError(f"LLM generation failed after retries: {last_error}")
