from dataclasses import replace
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .roles import Assignment


class ModelRoute(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    slot: str
    provider: str
    model: str
    credential_source: str = Field(alias="credentialSource")
    connection_id: str | None = Field(default=None, alias="connectionId")
    max_output_tokens: int = Field(alias="maxOutputTokens", ge=128, le=8_192)
    reasoning_effort: str | None = Field(default=None, alias="reasoningEffort")
    input_price: int = Field(alias="inputPriceMicrousdPerMillion", ge=0)
    cached_input_price: int = Field(alias="cachedInputPriceMicrousdPerMillion", ge=0)
    output_price: int = Field(alias="outputPriceMicrousdPerMillion", ge=0)


class ModelRouting(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    schema_version: int = Field(alias="schemaVersion")
    routes: list[ModelRoute]

    @model_validator(mode="after")
    def validate_routes(self):
        if self.schema_version != 1:
            raise ValueError("Unsupported model-routing schema")
        slots = {item.slot for item in self.routes}
        if not {"specialist_default", "synthesis"}.issubset(slots):
            raise ValueError("Specialist and synthesis routes are required")
        credentials: dict[str, str] = {}
        for route in self.routes:
            if route.provider not in {"openai", "deepseek"}:
                raise ValueError("Unsupported provider")
            if route.credential_source not in {"platform", "byok"}:
                raise ValueError("Unsupported credential source")
            if route.credential_source == "byok" and not route.connection_id:
                raise ValueError("BYOK route requires a connection")
            key = f"{route.credential_source}:{route.connection_id or 'platform'}"
            if route.provider in credentials and credentials[route.provider] != key:
                raise ValueError("Each provider must use one credential per configuration")
            credentials[route.provider] = key
        return self

    def route(self, slot: str) -> ModelRoute:
        exact = next((item for item in self.routes if item.slot == slot), None)
        if exact:
            return exact
        fallback = "specialist_default" if slot.startswith("role:") else "synthesis"
        return next(item for item in self.routes if item.slot == fallback)


def routed_assignments(assignments: list[Assignment], routing: ModelRouting | None) -> list[Assignment]:
    if not routing:
        return assignments
    return [
        replace(
            item,
            provider=routing.route(f"role:{item.role.name}").provider,
            model=routing.route(f"role:{item.role.name}").model,
            credential_source=routing.route(f"role:{item.role.name}").credential_source,
            max_output_tokens=routing.route(f"role:{item.role.name}").max_output_tokens,
            reasoning_effort=routing.route(f"role:{item.role.name}").reasoning_effort,
        )
        for item in assignments
    ]


def call_cost(route: ModelRoute, usage: Any) -> int:
    if route.credential_source != "byok":
        return 0
    cached = min(max(0, usage.cached_input_tokens), max(0, usage.input_tokens))
    uncached = max(0, usage.input_tokens - cached)
    return round((
        uncached * route.input_price + cached * route.cached_input_price
        + max(0, usage.output_tokens) * route.output_price
    ) / 1_000_000)


def call_credits(route: ModelRoute, kind: str) -> int:
    if route.credential_source == "platform":
        return 3 if kind == "specialist" else 9 if kind == "arbiter" else 7
    return 1 if kind == "specialist" else 3 if kind == "arbiter" else 2


def route_estimate(tier: str, assignments: list[Assignment], routing: ModelRouting | None) -> dict:
    if not routing:
        from .credits import estimated_credits
        return {"credits": estimated_credits(tier), "provider_cost_microusd": 0}
    specialist = routed_assignments(assignments, routing)
    steps = {
        "focus": ["synthesis"],
        "pro": ["critic", "synthesis"],
        "max": ["openai_synthesis", "deepseek_synthesis", "arbiter"],
    }[tier]
    calls = [(routing.route(f"role:{item.role.name}"), "specialist") for item in specialist]
    calls.extend((routing.route(step), "arbiter" if step == "arbiter" else "synthesis") for step in steps)
    cost = sum(
        round((route.input_price * 2_500 + route.output_price * route.max_output_tokens) / 1_000_000)
        for route, _ in calls if route.credential_source == "byok"
    )
    return {
        "credits": sum(call_credits(route, kind) for route, kind in calls),
        "provider_cost_microusd": cost,
    }
