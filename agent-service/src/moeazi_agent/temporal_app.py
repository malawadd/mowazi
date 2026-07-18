import asyncio
from datetime import timedelta

from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.common import RetryPolicy
from temporalio.worker import Worker

with workflow.unsafe.imports_passed_through():
    from moeazi_agent.config import get_settings
    from moeazi_agent.orchestrator import AnalysisOrchestrator, AnalysisRequest
    from moeazi_agent.providers import DeepSeekProvider, OpenAIProvider
    from moeazi_agent.security import evidence_prompt_block
    from moeazi_agent.storage import AnalysisRepository


@activity.defn
async def analyze_market_activity(payload: dict) -> dict:
    settings = get_settings()
    deepseek = DeepSeekProvider(settings)
    providers = (
        {"openai": deepseek, "deepseek": deepseek}
        if settings.provider_mode == "deepseek_only"
        else {"openai": OpenAIProvider(settings), "deepseek": deepseek}
    )
    repository = AnalysisRepository(settings.postgres_dsn)
    evidence = await repository.recent_evidence(payload["market"], settings.evidence_max_items)
    request = AnalysisRequest(**{
        **payload,
        "evidence": evidence_prompt_block(
            [(ref.id, content) for ref, content in evidence], settings.evidence_max_chars_per_item,
        ),
        "evidence_refs": tuple(ref for ref, _ in evidence),
    })
    result = await AnalysisOrchestrator(
        providers, settings.provider_max_concurrency,
        allow_single_provider=settings.provider_mode == "deepseek_only",
    ).run(request)
    await repository.save_run(
        result.synthesis, result.reports, result.calls, payload["scope"], payload.get("account_id")
    )
    return {
        "synthesis": result.synthesis.model_dump(mode="json"),
        "reports": [item.model_dump(mode="json") for item in result.reports],
        "calls": result.calls,
    }


@workflow.defn
class MarketAnalysisWorkflow:
    @workflow.run
    async def run(self, payload: dict) -> dict:
        return await workflow.execute_activity(
            analyze_market_activity,
            payload,
            start_to_close_timeout=timedelta(minutes=8),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )


async def run_worker() -> None:
    settings = get_settings()
    client = await Client.connect(settings.temporal_address, namespace=settings.temporal_namespace)
    worker = Worker(
        client, task_queue=settings.temporal_task_queue,
        workflows=[MarketAnalysisWorkflow], activities=[analyze_market_activity],
    )
    await worker.run()


if __name__ == "__main__":
    asyncio.run(run_worker())
