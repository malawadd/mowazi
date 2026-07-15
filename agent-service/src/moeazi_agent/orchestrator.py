import asyncio
import time
from dataclasses import dataclass
from typing import Any

from .contracts import AgentRunView, MarketSynthesis, SignalReport
from .providers import ProviderFailure, SignalProvider
from .roles import Assignment, assignments_for_tier
from .synthesis import synthesize


@dataclass(frozen=True)
class AnalysisRequest:
    market: str
    tier: str
    scope: str
    account_id: str | None = None
    evidence: str = ""
    freshness_ms: int = 0


@dataclass(frozen=True)
class AnalysisResult:
    synthesis: MarketSynthesis
    reports: list[SignalReport]
    calls: list[dict[str, Any]]


class AnalysisOrchestrator:
    def __init__(self, providers: dict[str, SignalProvider], max_concurrency: int = 40):
        self.providers = providers
        self.semaphore = asyncio.Semaphore(max_concurrency)

    async def run(self, request: AnalysisRequest) -> AnalysisResult:
        assignments = assignments_for_tier(request.tier)
        outcomes = await asyncio.gather(
            *(self._one(item, request.market, request.evidence) for item in assignments),
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
                latency_ms=call["latency_ms"], error=call.get("error"),
            )
            for call in calls
        ]
        output = synthesize(request.market, request.tier, reports, runs, request.freshness_ms, draft=draft)
        return AnalysisResult(output, reports, calls)

    async def _one(self, assignment: Assignment, market: str, evidence: str):
        started = time.perf_counter()
        provider = self.providers[assignment.provider]
        try:
            async with self.semaphore:
                report = await provider.analyze(assignment, market, evidence)
            call = {
                "role": assignment.role.name, "provider": assignment.provider,
                "model": report.model, "status": "completed",
                "latency_ms": int((time.perf_counter() - started) * 1000),
                "evidence_ids": [item.id for item in report.evidence],
            }
            return report, call
        except ProviderFailure as exc:
            return None, {
                "role": assignment.role.name, "provider": assignment.provider,
                "model": "unknown", "status": "failed",
                "latency_ms": int((time.perf_counter() - started) * 1000), "error": str(exc)[:500],
            }

    async def _run_synthesis(self, request: AnalysisRequest, reports: list[SignalReport]):
        materials = [item.model_dump(mode="json") for item in reports]
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
            draft = await provider.synthesize(request.market, request.tier, step, materials)
        return draft, {
            "role": step, "provider": provider_name,
            "model": getattr(provider, "synthesis_model", "deterministic-v1"),
            "status": "completed", "kind": "synthesis",
            "latency_ms": int((time.perf_counter() - started) * 1000),
        }

    @staticmethod
    def _enforce_quorum(tier: str, assignments: list[Assignment], reports: list[SignalReport]) -> None:
        completed = {(report.role, report.provider) for report in reports}
        if tier == "focus" and len(reports) < 4:
            raise ProviderFailure("quorum", "Focus requires four successful specialists")
        if tier in {"pro", "max"}:
            providers = {report.provider for report in reports}
            required = 8 if tier == "pro" else 14
            if len(reports) < required or not {"openai", "deepseek"}.issubset(providers):
                raise ProviderFailure("quorum", f"{tier.title()} provider quorum failed")
            critical = {item.role.name for item in assignments if item.role.critical}
            if any(not any(report.role == role for report in reports) for role in critical):
                raise ProviderFailure("quorum", "A critical role produced no valid output")
