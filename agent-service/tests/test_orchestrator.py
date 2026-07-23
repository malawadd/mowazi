from datetime import timedelta

import pytest

from moeazi_agent.contracts import EvidenceRef, SignalReport, utc_now
from moeazi_agent.orchestrator import AnalysisOrchestrator, AnalysisRequest
from moeazi_agent.providers import DeterministicProvider, ProviderFailure
from moeazi_agent.roles import assignments_for_tier


async def test_focus_runs_six_concurrent_assignments():
    provider = DeterministicProvider()
    orchestrator = AnalysisOrchestrator({"openai": provider, "deepseek": provider}, max_concurrency=3)
    result = await orchestrator.run(AnalysisRequest(market="BTC-USD", tier="focus", scope="public"))
    assert len(result.reports) == 6
    assert len(result.calls) == 7
    assert result.calls[-1]["role"] == "synthesis"
    assert result.synthesis.tier == "focus"


async def test_worker_attaches_stored_evidence_instead_of_model_provenance():
    provider = DeterministicProvider()
    evidence = EvidenceRef(
        id="evidence-1", source="test", uri="http://localhost/evidence",
        observed_at=utc_now(), quality_score=.8, content_hash="a" * 64,
    )
    result = await AnalysisOrchestrator(
        {"openai": provider, "deepseek": provider}, max_concurrency=3,
    ).run(AnalysisRequest(
        market="BTC-USD", tier="focus", scope="public", evidence_refs=(evidence,),
    ))
    assert all(report.evidence == [evidence] for report in result.reports)


async def test_deepseek_only_mode_allows_pro_quorum_without_faking_provider_names():
    provider = DeterministicProvider()
    result = await AnalysisOrchestrator(
        {"openai": provider, "deepseek": provider}, max_concurrency=8,
        allow_single_provider=True,
    ).run(AnalysisRequest(market="BTC-USD", tier="pro", scope="public"))
    assert len(result.reports) == 16
    assert {call["provider"] for call in result.calls} == {"deterministic"}


async def test_lite_mode_runs_two_specialists_and_deterministic_synthesis():
    provider = DeterministicProvider()
    result = await AnalysisOrchestrator(
        {"openai": provider, "deepseek": provider},
        max_concurrency=1,
        allow_single_provider=True,
    ).run(AnalysisRequest(
        market="BTC-USD", tier="max", scope="private", lite_mode=True,
    ))
    assert len(result.reports) == 2
    assert len(result.calls) == 2
    assert {report.role for report in result.reports} == {"technical_trend", "liquidity"}


def _report(role: str, provider: str, model: str) -> SignalReport:
    return SignalReport(
        role=role, provider=provider, model=model, horizon="hours",
        stance="neutral", score=0, confidence=.6, evidence=[], risks=[],
        expires_at=utc_now() + timedelta(minutes=5),
    )


def test_pro_quorum_uses_model_family_not_gateway_or_host():
    assignments = assignments_for_tier("pro")
    reports = [
        _report(item.role.name, "openrouter", "model") for item in assignments[:8]
    ]
    calls = [
        {"status": "completed", "model_family": "anthropic", "upstream_provider": f"host-{index}"}
        for index in range(8)
    ]
    orchestrator = AnalysisOrchestrator({"openrouter": DeterministicProvider()})
    with pytest.raises(ProviderFailure, match="provider quorum"):
        orchestrator._enforce_quorum("pro", assignments, reports, calls)

    calls[-1]["model_family"] = "google"
    orchestrator._enforce_quorum("pro", assignments, reports, calls)


def test_unknown_openrouter_identity_cannot_supply_second_quorum_family():
    assignments = assignments_for_tier("pro")
    reports = [
        _report(item.role.name, "openrouter", "model") for item in assignments[:8]
    ]
    calls = [{"status": "completed", "model_family": "anthropic"} for _ in range(7)]
    calls.append({"status": "completed", "model_family": "unknown"})
    with pytest.raises(ProviderFailure, match="provider quorum"):
        AnalysisOrchestrator({"openrouter": DeterministicProvider()})._enforce_quorum(
            "pro", assignments, reports, calls,
        )
