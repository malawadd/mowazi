import asyncio
from datetime import timedelta

from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.common import RetryPolicy
from temporalio.worker import Worker

with workflow.unsafe.imports_passed_through():
    from moeazi_agent.config import get_settings
    from moeazi_agent.convex import ConvexWorkerClient
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


@activity.defn
async def complete_analysis_job_activity(payload: dict) -> None:
    settings = get_settings()
    convex = ConvexWorkerClient(settings)
    job = payload["job"]
    result = payload["result"]
    await convex.complete(job["job_id"], job["holder_id"], result["synthesis"], result["calls"])
    if job["scope"] == "private":
        specialists = sum(
            call["status"] == "completed" and call.get("kind") != "synthesis"
            for call in result["calls"]
        )
        syntheses = sum(
            call["status"] == "completed" and call.get("kind") == "synthesis"
            for call in result["calls"]
        )
        await convex.command(
            "settleAgentCredits", jobId=job["job_id"],
            billableAmount=specialists * 3 + syntheses * 7,
            rateCardVersion=1, metadataJson='{"billing":"validated outputs only"}',
        )


@activity.defn
async def fail_analysis_job_activity(payload: dict) -> None:
    settings = get_settings()
    convex = ConvexWorkerClient(settings)
    job = payload["job"]
    if job["scope"] == "private":
        await convex.command(
            "releaseAgentCredits", jobId=job["job_id"],
            reason=payload["error"], rateCardVersion=1,
        )
    await convex.fail(
        job["job_id"], job["holder_id"], payload["error"], retryable=False,
    )


@workflow.defn
class MarketAnalysisWorkflow:
    @workflow.run
    async def run(self, payload: dict) -> dict:
        analysis = payload.get("analysis", payload)
        job = payload.get("job")
        try:
            result = await workflow.execute_activity(
                analyze_market_activity,
                analysis,
                start_to_close_timeout=timedelta(minutes=8),
                retry_policy=RetryPolicy(maximum_attempts=3),
            )
            if job:
                await workflow.execute_activity(
                    complete_analysis_job_activity,
                    {"job": job, "result": result},
                    start_to_close_timeout=timedelta(minutes=2),
                    retry_policy=RetryPolicy(maximum_attempts=5),
                )
            return result
        except Exception as exc:
            if job:
                await workflow.execute_activity(
                    fail_analysis_job_activity,
                    {"job": job, "error": str(exc)[:2_000]},
                    start_to_close_timeout=timedelta(minutes=1),
                    retry_policy=RetryPolicy(maximum_attempts=5),
                )
            raise


async def run_worker() -> None:
    settings = get_settings()
    client = await Client.connect(settings.temporal_address, namespace=settings.temporal_namespace)
    worker = Worker(
        client, task_queue=settings.temporal_task_queue,
        workflows=[MarketAnalysisWorkflow],
        activities=[
            analyze_market_activity, complete_analysis_job_activity,
            fail_analysis_job_activity,
        ],
    )
    await worker.run()


if __name__ == "__main__":
    asyncio.run(run_worker())
