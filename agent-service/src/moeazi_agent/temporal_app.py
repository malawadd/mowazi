import asyncio
import os
from datetime import timedelta

from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.common import RetryPolicy
from temporalio.worker import Worker

with workflow.unsafe.imports_passed_through():
    from .config import get_settings
    from .contracts import MarketSynthesis
    from .orchestrator import AnalysisOrchestrator, AnalysisRequest
    from .providers import DeepSeekProvider, OpenAIProvider
    from .storage import AnalysisRepository
    from .security import evidence_prompt_block


@activity.defn
async def analyze_market_activity(payload: dict) -> dict:
    settings = get_settings()
    providers = {"openai": OpenAIProvider(settings), "deepseek": DeepSeekProvider(settings)}
    repository = AnalysisRepository(settings.postgres_dsn)
    evidence = await repository.recent_evidence(payload["market"])
    request = AnalysisRequest(**{**payload, "evidence": evidence_prompt_block(evidence)})
    result = await AnalysisOrchestrator(providers, settings.provider_max_concurrency).run(request)
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
