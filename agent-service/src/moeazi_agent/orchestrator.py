import asyncio
import time
from dataclasses import dataclass
from typing import Any

from .contracts import AgentRunView, EvidenceRef, MarketSynthesis, SignalReport
from .costs import Usage
from .model_routing import ModelRoute, ModelRouting, call_cost, call_credits, routed_assignments
from .providers import ProviderFailure, ProviderResponse, SignalProvider
from .roles import Assignment, assignments_for_tier, lite_assignments
from .synthesis import synthesize


@dataclass(frozen=True)
class AnalysisRequest:
    market: str
    tier: str
    scope: str
    account_id: str | None = None
    evidence: str = ""
    evidence_refs: tuple[EvidenceRef, ...] = ()
    freshness_ms: int = 0
    lite_mode: bool = False
    model_routing: ModelRouting | None = None
    model_configuration_version: int | None = None
    automatic: bool = False
    task_queue: str = ""


@dataclass(frozen=True)
class AnalysisResult:
    synthesis: MarketSynthesis
    reports: list[SignalReport]
    calls: list[dict[str, Any]]


class AnalysisOrchestrator:
    def __init__(
        self, providers: dict[str, SignalProvider], max_concurrency: int = 40,
        allow_single_provider: bool = False,
    ):
        self.providers = providers
        self.semaphore = asyncio.Semaphore(max_concurrency)
        self.allow_single_provider = allow_single_provider

    async def run(self, request: AnalysisRequest) -> AnalysisResult:
        base = lite_assignments() if request.lite_mode else assignments_for_tier(request.tier)
        assignments = routed_assignments(base, request.model_routing)
        outcomes = await asyncio.gather(
            *(self._one(item, request.market, request.evidence, request.evidence_refs, request.model_routing) for item in assignments),
            return_exceptions=False,
        )
        reports = [report for report, _ in outcomes if report]
        calls = [call for _, call in outcomes]
        self._enforce_quorum(request.tier, assignments, reports, request.lite_mode)
        draft, synthesis_calls = (
            (None, []) if request.lite_mode else await self._run_synthesis(request, reports)
        )
        calls.extend(synthesis_calls)
        runs = [
            AgentRunView(
                role=call["role"], provider=call["provider"], model=call["model"],
                status=call["status"], evidence_ids=call.get("evidence_ids", []),
                latency_ms=call["latency_ms"], input_tokens=call.get("input_tokens", 0),
                cached_input_tokens=call.get("cached_input_tokens", 0),
                output_tokens=call.get("output_tokens", 0),
                estimated_cost_usd=call.get("estimated_cost_usd"),
                provider_cost_microusd=call.get("provider_cost_microusd", 0),
                platform_credits=call.get("platform_credits", 0),
                credential_source=call.get("credential_source", "platform"),
                decision_summary=call.get("decision_summary", ""), error=call.get("error"),
            )
            for call in calls
        ]
        output = synthesize(request.market, request.tier, reports, runs, request.freshness_ms, draft=draft)
        return AnalysisResult(output, reports, calls)

    async def _one(
        self, assignment: Assignment, market: str, evidence: str,
        evidence_refs: tuple[EvidenceRef, ...], routing: ModelRouting | None,
    ):
        started = time.perf_counter()
        provider = self.providers[assignment.provider]
        try:
            async with self.semaphore:
                response = await provider.analyze(assignment, market, evidence)
            report, usage = _provider_value(response)
            report = report.model_copy(update={"evidence": list(evidence_refs[:30])})
            route = routing.route(f"role:{assignment.role.name}") if routing else None
            call = {
                "role": assignment.role.name, "provider": report.provider,
                "model": report.model, "status": "completed",
                "latency_ms": int((time.perf_counter() - started) * 1000),
                "evidence_ids": [item.id for item in report.evidence],
                "decision_summary": report.decision_summary,
                **_usage_fields(route, report.provider, report.model, usage, "specialist"),
            }
            return report, call
        except ProviderFailure as exc:
            return None, {
                "role": assignment.role.name, "provider": provider.name,
                "model": assignment.model or "unknown", "status": "failed",
                "credential_source": assignment.credential_source,
                "latency_ms": int((time.perf_counter() - started) * 1000), "error": str(exc)[:500],
            }

    async def _run_synthesis(self, request: AnalysisRequest, reports: list[SignalReport]):
        materials = [_synthesis_material(item) for item in reports]
        if request.tier == "focus":
            draft, call = await self._synthesis_call("synthesis", "openai", request, materials)
            return draft, [call]
        if request.tier == "pro":
            critic, critic_call = await self._synthesis_call("critic", "deepseek", request, materials)
            draft, synthesis_call = await self._synthesis_call(
                "synthesis", "openai", request, materials + [critic.model_dump(mode="json")]
            )
            return draft, [critic_call, synthesis_call]
        first, second = await asyncio.gather(
            self._synthesis_call("openai_synthesis", "openai", request, materials),
            self._synthesis_call("deepseek_synthesis", "deepseek", request, materials),
        )
        arbiter, arbiter_call = await self._synthesis_call(
            "arbiter", "openai", request,
            [first[0].model_dump(mode="json"), second[0].model_dump(mode="json")],
        )
        return arbiter, [first[1], second[1], arbiter_call]

    async def _synthesis_call(self, step: str, default_provider: str, request: AnalysisRequest, materials: list[dict]):
        started = time.perf_counter()
        route = request.model_routing.route(step) if request.model_routing else None
        provider = self.providers[route.provider if route else default_provider]
        model = route.model if route else getattr(provider, "synthesis_model", "deterministic-v1")
        async with self.semaphore:
            response = await provider.synthesize(
                request.market, request.tier, step, materials, model=model,
                max_output_tokens=route.max_output_tokens if route else None,
                reasoning_effort=route.reasoning_effort if route else None,
            )
        draft, usage = _provider_value(response)
        return draft, {
            "role": step, "provider": provider.name,
            "model": model,
            "status": "completed", "kind": "synthesis",
            "decision_summary": draft.decision_summary,
            "latency_ms": int((time.perf_counter() - started) * 1000),
            **_usage_fields(route, provider.name, model, usage, "arbiter" if step == "arbiter" else "synthesis"),
        }

    def _enforce_quorum(
        self,
        tier: str,
        assignments: list[Assignment],
        reports: list[SignalReport],
        lite_mode: bool = False,
    ) -> None:
        if lite_mode:
            if len(reports) < 1:
                raise ProviderFailure("quorum", "Lite Mode requires one successful specialist")
            return
        completed = {(report.role, report.provider) for report in reports}
        if tier == "focus" and len(reports) < 4:
            raise ProviderFailure("quorum", "Focus requires four successful specialists")
        if tier in {"pro", "max"}:
            providers = {report.provider for report in reports}
            required = 8 if tier == "pro" else 14
            provider_quorum = self.allow_single_provider or {"openai", "deepseek"}.issubset(providers)
            if len(reports) < required or not provider_quorum:
                raise ProviderFailure("quorum", f"{tier.title()} provider quorum failed")
            critical = {item.role.name for item in assignments if item.role.critical}
            if any(not any(report.role == role for report in reports) for role in critical):
                raise ProviderFailure("quorum", "A critical role produced no valid output")


def _provider_value(response):
    if isinstance(response, ProviderResponse):
        return response.value, response.usage
    return response, Usage()


def _usage_fields(route: ModelRoute | None, provider: str, model: str, usage: Usage, kind: str) -> dict:
    cost_microusd = call_cost(route, usage) if route else 0
    credits = call_credits(route, kind) if route else (3 if kind == "specialist" else 9 if kind == "arbiter" else 7)
    return {
        "input_tokens": usage.input_tokens,
        "cached_input_tokens": usage.cached_input_tokens,
        "output_tokens": usage.output_tokens,
        "estimated_cost_usd": cost_microusd / 1_000_000,
        "provider_cost_microusd": cost_microusd,
        "platform_credits": credits,
        "credential_source": route.credential_source if route else "platform",
        "metadata": {
            "input_tokens": usage.input_tokens,
            "cached_input_tokens": usage.cached_input_tokens,
            "output_tokens": usage.output_tokens,
            "estimated_cost_usd": cost_microusd / 1_000_000,
        },
    }


def _synthesis_material(report: SignalReport) -> dict:
    return {
        "role": report.role, "horizon": report.horizon, "stance": report.stance,
        "score": report.score, "confidence": report.confidence,
        "risks": report.risks[:5], "evidence_ids": [item.id for item in report.evidence],
    }
