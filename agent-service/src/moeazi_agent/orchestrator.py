import asyncio
import time
from dataclasses import dataclass
from typing import Any

from .contracts import AgentRunView, EvidenceRef, MarketSynthesis, SignalReport
from .costs import Usage, deepseek_cost
from .providers import ProviderFailure, ProviderResponse, SignalProvider
from .roles import Assignment, assignments_for_tier
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
        assignments = assignments_for_tier(request.tier)
        outcomes = await asyncio.gather(
            *(self._one(item, request.market, request.evidence, request.evidence_refs) for item in assignments),
            return_exceptions=False,
        )
        reports = [report for report, _ in outcomes if report]
        calls = [call for _, call in outcomes]
        self._enforce_quorum(request.tier, assignments, reports)
        draft, synthesis_calls = await self._run_synthesis(request, reports)
        calls.extend(synthesis_calls)
        runs = [
            AgentRunView(
                role=call["role"], provider=call["provider"], model=call["model"],
                status=call["status"], evidence_ids=call.get("evidence_ids", []),
                latency_ms=call["latency_ms"], input_tokens=call.get("input_tokens", 0),
                output_tokens=call.get("output_tokens", 0),
                estimated_cost_usd=call.get("estimated_cost_usd"), error=call.get("error"),
            )
            for call in calls
        ]
        output = synthesize(request.market, request.tier, reports, runs, request.freshness_ms, draft=draft)
        return AnalysisResult(output, reports, calls)

    async def _one(
        self, assignment: Assignment, market: str, evidence: str,
        evidence_refs: tuple[EvidenceRef, ...],
    ):
        started = time.perf_counter()
        provider = self.providers[assignment.provider]
        try:
            async with self.semaphore:
                response = await provider.analyze(assignment, market, evidence)
            report, usage = _provider_value(response)
            report = report.model_copy(update={"evidence": list(evidence_refs[:30])})
            call = {
                "role": assignment.role.name, "provider": report.provider,
                "model": report.model, "status": "completed",
                "latency_ms": int((time.perf_counter() - started) * 1000),
                "evidence_ids": [item.id for item in report.evidence],
                **_usage_fields(report.provider, report.model, usage),
            }
            return report, call
        except ProviderFailure as exc:
            return None, {
                "role": assignment.role.name, "provider": provider.name,
                "model": "unknown", "status": "failed",
                "latency_ms": int((time.perf_counter() - started) * 1000), "error": str(exc)[:500],
            }

    async def _run_synthesis(self, request: AnalysisRequest, reports: list[SignalReport]):
        materials = [_synthesis_material(item) for item in reports]
        if request.tier == "focus":
            draft, call = await self._synthesis_call("openai", "synthesis", request, materials)
            return draft, [call]
        if request.tier == "pro":
            critic, critic_call = await self._synthesis_call("deepseek", "critic", request, materials)
            draft, synthesis_call = await self._synthesis_call(
                "openai", "synthesis", request, materials + [critic.model_dump(mode="json")]
            )
            return draft, [critic_call, synthesis_call]
        first, second = await asyncio.gather(
            self._synthesis_call("openai", "openai_synthesis", request, materials),
            self._synthesis_call("deepseek", "deepseek_synthesis", request, materials),
        )
        arbiter, arbiter_call = await self._synthesis_call(
            "openai", "arbiter", request,
            [first[0].model_dump(mode="json"), second[0].model_dump(mode="json")],
        )
        return arbiter, [first[1], second[1], arbiter_call]

    async def _synthesis_call(self, provider_name: str, step: str, request: AnalysisRequest, materials: list[dict]):
        started = time.perf_counter()
        provider = self.providers[provider_name]
        async with self.semaphore:
            response = await provider.synthesize(request.market, request.tier, step, materials)
        draft, usage = _provider_value(response)
        return draft, {
            "role": step, "provider": provider.name,
            "model": getattr(provider, "synthesis_model", "deterministic-v1"),
            "status": "completed", "kind": "synthesis",
            "latency_ms": int((time.perf_counter() - started) * 1000),
            **_usage_fields(provider.name, getattr(provider, "synthesis_model", "deterministic-v1"), usage),
        }

    def _enforce_quorum(self, tier: str, assignments: list[Assignment], reports: list[SignalReport]) -> None:
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


def _usage_fields(provider: str, model: str, usage: Usage) -> dict:
    cost = deepseek_cost(model, usage) if provider == "deepseek" else None
    return {
        "input_tokens": usage.input_tokens,
        "cached_input_tokens": usage.cached_input_tokens,
        "output_tokens": usage.output_tokens,
        "estimated_cost_usd": cost,
        "metadata": {
            "input_tokens": usage.input_tokens,
            "cached_input_tokens": usage.cached_input_tokens,
            "output_tokens": usage.output_tokens,
            "estimated_cost_usd": cost,
        },
    }


def _synthesis_material(report: SignalReport) -> dict:
    return {
        "role": report.role, "horizon": report.horizon, "stance": report.stance,
        "score": report.score, "confidence": report.confidence,
        "risks": report.risks[:5], "evidence_ids": [item.id for item in report.evidence],
    }
