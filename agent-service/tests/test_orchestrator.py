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
