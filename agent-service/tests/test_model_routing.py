from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from moeazi_agent.model_routing import (
    ModelRoute,
    ModelRouting,
    call_cost,
    route_estimate,
)
from moeazi_agent.roles import assignments_for_tier


def route(slot: str, source: str = "platform") -> dict:
    return {
        "slot": slot,
        "provider": "openai",
        "model": "gpt-5-mini",
        "credentialSource": source,
        "connectionId": "connection-1" if source == "byok" else None,
        "maxOutputTokens": 250,
        "inputPriceMicrousdPerMillion": 1_000_000 if source == "byok" else 0,
        "cachedInputPriceMicrousdPerMillion": 100_000 if source == "byok" else 0,
        "outputPriceMicrousdPerMillion": 2_000_000 if source == "byok" else 0,
    }


def routing(source: str) -> ModelRouting:
    return ModelRouting.model_validate({
        "schemaVersion": 1,
        "routes": [route("specialist_default", source), route("synthesis", source)],
    })


def test_byok_reduces_platform_credits_and_estimates_provider_cost():
    assignments = assignments_for_tier("focus")
    platform = route_estimate("focus", assignments, routing("platform"))
    byok = route_estimate("focus", assignments, routing("byok"))

    assert byok["credits"] < platform["credits"]
    assert platform["provider_cost_microusd"] == 0
    assert byok["provider_cost_microusd"] > 0


def test_call_cost_accounts_for_cached_tokens():
    model = ModelRoute.model_validate(route("synthesis", "byok"))
    usage = SimpleNamespace(input_tokens=1_000, cached_input_tokens=400, output_tokens=200)
    assert call_cost(model, usage) == 1_040


def test_byok_requires_a_connection():
    invalid = route("specialist_default", "byok")
    invalid["connectionId"] = None
    with pytest.raises(ValidationError, match="BYOK route requires a connection"):
        ModelRouting.model_validate({
            "schemaVersion": 1,
            "routes": [invalid, route("synthesis", "byok")],
        })


def test_openrouter_is_byok_only_and_receives_safe_defaults():
    specialist = route("specialist_default", "byok")
    specialist.update({"provider": "openrouter", "model": "anthropic/claude-sonnet"})
    synthesis = {**specialist, "slot": "synthesis"}
    parsed = ModelRouting.model_validate({
        "schemaVersion": 2, "routes": [specialist, synthesis],
    })
    assert parsed.routes[0].openrouter.sort == "price"
    assert parsed.routes[0].openrouter.data_collection == "deny"
    assert parsed.routes[0].openrouter.zero_data_retention is True

    specialist["credentialSource"] = "platform"
    specialist["connectionId"] = None
    with pytest.raises(ValidationError, match="BYOK only"):
        ModelRouting.model_validate({
            "schemaVersion": 2, "routes": [specialist, synthesis],
        })


def test_v1_max_stage_aliases_resolve_to_provider_neutral_names():
    parsed = ModelRouting.model_validate({
        "schemaVersion": 1,
        "routes": [
            route("specialist_default"), route("synthesis"),
            route("openai_synthesis"), route("deepseek_synthesis"),
        ],
    })
    assert parsed.route("synthesis_primary").slot == "openai_synthesis"
    assert parsed.route("synthesis_challenger").slot == "deepseek_synthesis"
