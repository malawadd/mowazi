import asyncio
import json
from abc import ABC, abstractmethod
from datetime import timedelta
from typing import Any

import httpx
from openai import AsyncOpenAI
from pydantic import ValidationError

from .config import Settings
from .contracts import SignalReport, SynthesisDraft, utc_now
from .roles import Assignment
from .security import SYSTEM_BOUNDARY


class ProviderFailure(RuntimeError):
    def __init__(self, provider: str, message: str, retryable: bool = True):
        super().__init__(message)
        self.provider = provider
        self.retryable = retryable


class SignalProvider(ABC):
    name: str

    @abstractmethod
    async def analyze(self, assignment: Assignment, market: str, evidence: str) -> SignalReport: ...

    @abstractmethod
    async def synthesize(self, market: str, tier: str, step: str, materials: list[dict]) -> SynthesisDraft: ...


def specialist_prompt(assignment: Assignment, market: str, evidence: str) -> str:
    schema = json.dumps(SignalReport.model_json_schema(), separators=(",", ":"))
    return (
        f"Market: {market}\nRole: {assignment.role.name}\nHorizon: {assignment.role.horizon}\n"
        "Score from -1 to 1. Calibrate confidence to evidence quality. Cite only supplied evidence IDs. "
        f"Return JSON matching this schema exactly: {schema}\n"
        f"{evidence}"
    )


class OpenAIProvider(SignalProvider):
    name = "openai"

    def __init__(self, settings: Settings):
        self.model = settings.openai_specialist_model
        self.synthesis_model = settings.openai_synthesis_model
        self.client = AsyncOpenAI(api_key=settings.openai_api_key.get_secret_value(), timeout=settings.provider_timeout_seconds)

    async def analyze(self, assignment: Assignment, market: str, evidence: str) -> SignalReport:
        try:
            response = await self.client.responses.parse(
                model=self.model,
                instructions=SYSTEM_BOUNDARY,
                input=specialist_prompt(assignment, market, evidence),
                text_format=SignalReport,
            )
            if response.output_parsed is None:
                raise ProviderFailure(self.name, "OpenAI returned no typed output")
            return response.output_parsed.model_copy(update={"provider": self.name, "model": self.model})
        except ProviderFailure:
            raise
        except Exception as exc:
            raise ProviderFailure(self.name, str(exc)) from exc

    async def synthesize(self, market: str, tier: str, step: str, materials: list[dict]) -> SynthesisDraft:
        try:
            response = await self.client.responses.parse(
                model=self.synthesis_model, instructions=SYSTEM_BOUNDARY,
                input=_synthesis_prompt(market, tier, step, materials), text_format=SynthesisDraft,
            )
            if response.output_parsed is None:
                raise ProviderFailure(self.name, "OpenAI returned no typed synthesis")
            return response.output_parsed
        except ProviderFailure:
            raise
        except Exception as exc:
            raise ProviderFailure(self.name, str(exc)) from exc


class DeepSeekProvider(SignalProvider):
    name = "deepseek"

    def __init__(self, settings: Settings):
        self.model = settings.deepseek_specialist_model
        self.synthesis_model = settings.deepseek_synthesis_model
        self.retries = settings.provider_retries
        self.client = httpx.AsyncClient(
            base_url=settings.deepseek_base_url,
            headers={"Authorization": f"Bearer {settings.deepseek_api_key.get_secret_value()}"},
            timeout=settings.provider_timeout_seconds,
        )

    async def analyze(self, assignment: Assignment, market: str, evidence: str) -> SignalReport:
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM_BOUNDARY},
                {"role": "user", "content": specialist_prompt(assignment, market, evidence)},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
        }
        for attempt in range(self.retries + 1):
            try:
                response = await self.client.post("/chat/completions", json=body)
                if response.status_code in {408, 429, 500, 502, 503, 504}:
                    raise ProviderFailure(self.name, f"HTTP {response.status_code}")
                response.raise_for_status()
                content = response.json()["choices"][0]["message"].get("content")
                if not content or not content.strip():
                    raise ProviderFailure(self.name, "DeepSeek returned empty content")
                document = json.loads(content)
                document["evidence"] = []
                report = SignalReport.model_validate(document)
                return report.model_copy(update={"provider": self.name, "model": self.model})
            except (KeyError, json.JSONDecodeError, ValidationError, httpx.HTTPError, ProviderFailure) as exc:
                if attempt >= self.retries:
                    raise ProviderFailure(self.name, str(exc)) from exc
                await asyncio.sleep(min(2**attempt, 4))
        raise ProviderFailure(self.name, "DeepSeek retry loop exhausted")

    async def synthesize(self, market: str, tier: str, step: str, materials: list[dict]) -> SynthesisDraft:
        body = {
            "model": self.synthesis_model,
            "messages": [
                {"role": "system", "content": SYSTEM_BOUNDARY},
                {"role": "user", "content": _synthesis_prompt(market, tier, step, materials)},
            ],
            "response_format": {"type": "json_object"}, "temperature": 0.1,
        }
        for attempt in range(self.retries + 1):
            try:
                response = await self.client.post("/chat/completions", json=body)
                if response.status_code in {408, 429, 500, 502, 503, 504}:
                    raise ProviderFailure(self.name, f"HTTP {response.status_code}")
                response.raise_for_status()
                content = response.json()["choices"][0]["message"].get("content")
                if not content or not content.strip(): raise ProviderFailure(self.name, "DeepSeek returned empty synthesis")
                return SynthesisDraft.model_validate(json.loads(content))
            except (KeyError, json.JSONDecodeError, ValidationError, httpx.HTTPError, ProviderFailure) as exc:
                if attempt >= self.retries: raise ProviderFailure(self.name, str(exc)) from exc
                await asyncio.sleep(min(2**attempt, 4))
        raise ProviderFailure(self.name, "DeepSeek synthesis retry loop exhausted")


class DeterministicProvider(SignalProvider):
    """Stable provider for tests and local smoke runs without external billing."""

    def __init__(self, name: str = "deterministic"):
        self.name = name

    async def analyze(self, assignment: Assignment, market: str, evidence: str) -> SignalReport:
        score = ((sum(map(ord, assignment.role.name + market)) % 161) - 80) / 100
        stance = "neutral"
        if score >= 0.6: stance = "strong_bullish"
        elif score >= 0.15: stance = "bullish"
        elif score <= -0.6: stance = "strong_bearish"
        elif score <= -0.15: stance = "bearish"
        return SignalReport(
            role=assignment.role.name, provider="deterministic", model="deterministic-v1",
            horizon=assignment.role.horizon, stance=stance, score=score, confidence=0.65,
            evidence=[], risks=["Synthetic output; never use for live execution."],
            expires_at=utc_now() + timedelta(minutes=5),
        )

    async def synthesize(self, market: str, tier: str, step: str, materials: list[dict]) -> SynthesisDraft:
        scores = [float(item.get("score", item.get("consensus", 0))) for item in materials]
        consensus = sum(scores) / max(1, len(scores))
        from .synthesis import DISCLAIMER
        return SynthesisDraft(
            consensus=max(-1, min(1, consensus)), confidence=0.65,
            scenarios=[
                {"name": "Bull continuation", "probability": 0.34, "triggers": ["confirmation"], "invalidations": ["support loss"], "disclaimer": DISCLAIMER},
                {"name": "Range", "probability": 0.33, "triggers": ["compression"], "invalidations": ["breakout"], "disclaimer": DISCLAIMER},
                {"name": "Bear continuation", "probability": 0.33, "triggers": ["selling"], "invalidations": ["reclaim"], "disclaimer": DISCLAIMER},
            ], conflicts=[],
        )


def _synthesis_prompt(market: str, tier: str, step: str, materials: list[dict]) -> str:
    schema = json.dumps(SynthesisDraft.model_json_schema(), separators=(",", ":"))
    data = json.dumps(materials, separators=(",", ":"), default=str)
    return (
        f"Market: {market}\nTier: {tier}\nStep: {step}. Reconcile the validated analytical materials. "
        "Scenario probabilities must sum to 1. Return JSON matching this schema exactly:\n"
        f"{schema}\nMaterials:\n{data}"
    )
