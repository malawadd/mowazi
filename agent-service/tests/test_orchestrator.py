from moeazi_agent.orchestrator import AnalysisOrchestrator, AnalysisRequest
from moeazi_agent.providers import DeterministicProvider


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
from moeazi_agent.contracts import EvidenceRef, utc_now
