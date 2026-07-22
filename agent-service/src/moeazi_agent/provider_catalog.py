import json
from typing import Literal

import httpx
from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict, Field

from .config import Settings


class CompatibilityProbe(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision_summary: str = Field(min_length=2, max_length=160)
    key_factors: list[str] = Field(min_length=1, max_length=3)
    confidence: float = Field(ge=0, le=1)


KNOWN_PRICES = {
    "gpt-5.6-sol": (5_000_000, 500_000, 30_000_000),
    "gpt-5.6-terra": (2_500_000, 250_000, 15_000_000),
    "gpt-5.6-luna": (1_000_000, 100_000, 6_000_000),
    "gpt-5.4-mini": (0, 0, 0),
    "deepseek-v4-flash": (140_000, 2_800, 280_000),
    "deepseek-v4-pro": (435_000, 3_625, 870_000),
}


def model_view(model_id: str) -> dict:
    rates = KNOWN_PRICES.get(model_id)
    return {
        "id": model_id,
        "pricingKnown": rates is not None and any(rates),
        "inputPriceMicrousdPerMillion": rates[0] if rates else 0,
        "cachedInputPriceMicrousdPerMillion": rates[1] if rates else 0,
        "outputPriceMicrousdPerMillion": rates[2] if rates else 0,
    }


async def list_models(provider: Literal["openai", "deepseek"], api_key: str, settings: Settings) -> list[dict]:
    if provider == "openai":
        client = AsyncOpenAI(api_key=api_key, timeout=settings.provider_timeout_seconds)
        try:
            page = await client.models.list()
            ids = [item.id for item in page.data]
        finally:
            await client.close()
    else:
        async with httpx.AsyncClient(
            base_url=settings.deepseek_base_url,
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=settings.provider_timeout_seconds,
        ) as client:
            response = await client.get("/models")
            response.raise_for_status()
            ids = [str(item["id"]) for item in response.json().get("data", []) if item.get("id")]
    return [model_view(item) for item in sorted(set(ids))[:200]]


async def probe_model(
    provider: Literal["openai", "deepseek"], model: str, api_key: str, settings: Settings,
) -> dict:
    prompt = "Return a short structured compatibility result about BTC market data. Do not call tools."
    if provider == "openai":
        client = AsyncOpenAI(api_key=api_key, timeout=settings.provider_timeout_seconds)
        try:
            response = await client.responses.parse(
                model=model, instructions="Return only the requested typed result.", input=prompt,
                text_format=CompatibilityProbe, max_output_tokens=128,
            )
            if response.output_parsed is None:
                raise RuntimeError("Model returned no typed output")
            result = response.output_parsed.model_dump()
            usage = getattr(response, "usage", None)
            result["usage"] = {
                "inputTokens": int(getattr(usage, "input_tokens", 0) or 0),
                "outputTokens": int(getattr(usage, "output_tokens", 0) or 0),
            }
        finally:
            await client.close()
        return result
    schema = CompatibilityProbe.model_json_schema()
    async with httpx.AsyncClient(
        base_url=settings.deepseek_base_url,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=settings.provider_timeout_seconds,
    ) as client:
        response = await client.post("/chat/completions", json={
            "model": model,
            "messages": [
                {"role": "system", "content": "Return JSON matching the supplied schema."},
                {"role": "user", "content": f"{prompt}\nSchema: {json.dumps(schema)}"},
            ],
            "response_format": {"type": "json_object"}, "max_tokens": 128,
        })
        response.raise_for_status()
        payload = response.json()
    content = payload["choices"][0]["message"].get("content")
    if not content:
        raise RuntimeError("Model returned no typed output")
    result = CompatibilityProbe.model_validate_json(content).model_dump()
    usage = payload.get("usage") or {}
    result["usage"] = {
        "inputTokens": int(usage.get("prompt_tokens") or 0),
        "outputTokens": int(usage.get("completion_tokens") or 0),
    }
    return result
