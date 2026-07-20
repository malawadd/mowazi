import asyncio
from datetime import timedelta

from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.common import RetryPolicy
from temporalio.worker import Worker

with workflow.unsafe.imports_passed_through():
    from moeazi_agent.config import get_settings
    from moeazi_agent.convex import ConvexWorkerClient
    from moeazi_agent.credits import estimated_credits
    from moeazi_agent.orchestrator import AnalysisOrchestrator, AnalysisRequest
    from moeazi_agent.providers import DeepSeekProvider, OpenAIProvider
    from moeazi_agent.execution_workflow import ExecutionWorkflow, execute_proposal_activity
    from moeazi_agent.analysis_completion import (
        complete_analysis_job_activity, fail_analysis_job_activity,
    )
    from moeazi_agent.runtime_controls import RuntimeControlStore
    from moeazi_agent.security import evidence_prompt_block
    from moeazi_agent.storage import AnalysisRepository


@activity.defn
async def analyze_market_activity(payload: dict) -> dict:
    settings = get_settings()
    from redis.asyncio import Redis
    redis = Redis.from_url(settings.redis_url)
    runtime = RuntimeControlStore(redis, settings)
    controls = await runtime.get()
    if payload.get("automatic") and controls.manual_guard:
        await redis.aclose()
        raise RuntimeError("Manual Guard blocks automatic analysis")
    effective_settings = settings.model_copy(update={
        "provider_retries": 0 if controls.lite_mode else settings.provider_retries,
        "provider_max_concurrency": 1 if controls.lite_mode else settings.provider_max_concurrency,
        "specialist_max_output_tokens": 250 if controls.lite_mode else settings.specialist_max_output_tokens,
        "evidence_max_items": 3 if controls.lite_mode else settings.evidence_max_items,
        "evidence_max_chars_per_item": 300 if controls.lite_mode else settings.evidence_max_chars_per_item,
    })
    deepseek = DeepSeekProvider(effective_settings)
    providers = (
        {"openai": deepseek, "deepseek": deepseek}
        if effective_settings.provider_mode == "deepseek_only" or controls.lite_mode
        else {"openai": OpenAIProvider(effective_settings), "deepseek": deepseek}
    )
    repository = AnalysisRepository(effective_settings.postgres_dsn)
    evidence = await repository.recent_evidence(
        payload["market"], effective_settings.evidence_max_items,
    )
    request = AnalysisRequest(**{
        **payload,
        "evidence": evidence_prompt_block(
            [(ref.id, content) for ref, content in evidence],
            effective_settings.evidence_max_chars_per_item,
        ),
        "evidence_refs": tuple(ref for ref, _ in evidence),
        "lite_mode": controls.lite_mode,
    })
    result = await AnalysisOrchestrator(
        providers, effective_settings.provider_max_concurrency,
        allow_single_provider=effective_settings.provider_mode == "deepseek_only" or controls.lite_mode,
    ).run(request)
    await repository.save_run(
        result.synthesis, result.reports, result.calls, payload["scope"], payload.get("account_id")
    )
    await redis.aclose()
    return {
        "synthesis": result.synthesis.model_dump(mode="json"),
        "reports": [item.model_dump(mode="json") for item in result.reports],
        "calls": result.calls,
    }


@activity.defn
async def prepare_scheduled_analysis_activity(payload: dict) -> dict | None:
    settings = get_settings()
    from redis.asyncio import Redis
    redis = Redis.from_url(settings.redis_url)
    runtime = RuntimeControlStore(redis, settings)
    convex = ConvexWorkerClient(settings)
    try:
        controls = await runtime.get()
        if controls.manual_guard:
            return None
        profile_data = await convex.command(
            "getAgentScheduleProfile", profileId=payload["profile_id"],
        )
        if not profile_data:
            return None
        if controls.lite_mode and profile_data.get("markets", [None])[0] != payload["market"]:
            return None
        result = await convex.command(
            "enqueueScheduledAnalysis",
            profileId=payload["profile_id"],
            marketId=payload["market"],
            scheduleRevision=payload["schedule_revision"],
            trigger="cadence:temporal",
        )
        if not result.get("created"):
            return None
        job = result["job"]
        holder = f"schedule-{job['_id']}"
        claimed = await convex.claim_job(job["_id"], holder)
        if not claimed.get("claimed"):
            return None
        if controls.lite_mode:
            await runtime.reserve_lite_run(job.get("strategyAccountId"))
        reservation = await convex.command(
            "reserveAgentCredits",
            userId=job["userId"],
            jobId=job["_id"],
            amount=estimated_credits(job["tier"]),
            expiresAt=job["createdAt"] + 900_000,
            rateCardVersion=1,
        )
        if reservation.get("insufficient"):
            await convex.fail(job["_id"], holder, "Insufficient credits", retryable=False)
            return None
        return {
            "analysis": {
                "market": job["marketId"],
                "tier": job["tier"],
                "scope": job["scope"],
                "account_id": job["strategyAccountId"],
                "evidence": "",
                "freshness_ms": 0,
                "automatic": True,
                "lite_mode": controls.lite_mode,
                "task_queue": payload["task_queue"],
            },
            "job": {
                "job_id": job["_id"],
                "holder_id": holder,
                "scope": job["scope"],
                "tier": job["tier"],
                "strategy_account_id": job["strategyAccountId"],
            },
        }
    finally:
        await redis.aclose()


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
                retry_policy=RetryPolicy(
                    maximum_attempts=1 if analysis.get("lite_mode") else 3,
                ),
            )
            if job:
                proposal = await workflow.execute_activity(
                    complete_analysis_job_activity,
                    {"job": job, "result": result},
                    start_to_close_timeout=timedelta(minutes=2),
                    retry_policy=RetryPolicy(maximum_attempts=5),
                )
                if proposal and proposal.get("status") == "approved":
                    await workflow.execute_child_workflow(
                        ExecutionWorkflow.run,
                        {"proposal_id": proposal["proposalId"], "automatic": True},
                        id=f"execution-{proposal['proposalId']}",
                        task_queue=analysis.get("task_queue", "moeazi-analysis"),
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


@workflow.defn
class ScheduledAnalysisWorkflow:
    @workflow.run
    async def run(self, payload: dict) -> dict:
        prepared = await workflow.execute_activity(
            prepare_scheduled_analysis_activity,
            payload,
            start_to_close_timeout=timedelta(minutes=1),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )
        if not prepared:
            return {"status": "skipped"}
        return await workflow.execute_child_workflow(
            MarketAnalysisWorkflow.run,
            prepared,
            id=f"analysis-{prepared['job']['job_id']}",
            task_queue=payload["task_queue"],
        )


async def run_worker() -> None:
    settings = get_settings()
    client = await Client.connect(settings.temporal_address, namespace=settings.temporal_namespace)
    worker = Worker(
        client, task_queue=settings.temporal_task_queue,
        workflows=[MarketAnalysisWorkflow, ScheduledAnalysisWorkflow, ExecutionWorkflow],
        activities=[
            analyze_market_activity, complete_analysis_job_activity,
            fail_analysis_job_activity, prepare_scheduled_analysis_activity,
            execute_proposal_activity,
        ],
    )
    await worker.run()


if __name__ == "__main__":
    asyncio.run(run_worker())
