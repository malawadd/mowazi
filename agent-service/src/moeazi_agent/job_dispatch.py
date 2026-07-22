import json

from temporalio.client import Client
from temporalio.exceptions import WorkflowAlreadyStartedError
from redis.asyncio import Redis

from .config import Settings
from .convex import ConvexWorkerClient
from .costs import tier_estimate
from .credits import estimated_credits
from .temporal_app import MarketAnalysisWorkflow
from .runtime_controls import RuntimeControlStore
from .model_routing import ModelRouting, route_estimate
from .roles import assignments_for_tier


async def dispatch_analysis_job(client: Client, settings: Settings, job_id: str) -> dict:
    convex = ConvexWorkerClient(settings)
    holder = f"event-{job_id}"
    claimed = await convex.claim_job(job_id, holder)
    if not claimed.get("claimed"):
        status = claimed.get("reason", "unavailable")
        return {"accepted": status in {"claimed", "running", "completed"}, "status": status}
    job = claimed["job"]
    redis = Redis.from_url(settings.redis_url)
    runtime = RuntimeControlStore(redis, settings)
    try:
        model_config = None
        if job.get("strategyAccountId"):
            model_config = await convex.command(
                "getModelRunConfiguration", strategyAccountId=job["strategyAccountId"],
            )
        _validate_manual_job(job, settings, model_config)
        controls = await runtime.get()
        if controls.lite_mode:
            await runtime.reserve_lite_run(job.get("strategyAccountId"))
        if job.get("scope") == "private":
            routing = ModelRouting.model_validate(model_config["routes"]) if model_config else None
            estimate = route_estimate(job["tier"], assignments_for_tier(job["tier"]), routing)
            reservation = await convex.command(
                "reserveAgentCredits", userId=job["userId"], jobId=job_id,
                amount=estimate["credits"], expiresAt=job["createdAt"] + 900_000,
                rateCardVersion=2 if model_config else 1,
            )
            if reservation.get("insufficient"):
                raise RuntimeError("Insufficient credits")
        try:
            handle = await client.start_workflow(
                MarketAnalysisWorkflow.run,
                {
                    "analysis": {
                        "market": job["marketId"], "tier": job["tier"], "scope": job["scope"],
                        "account_id": job.get("strategyAccountId"), "evidence": "", "freshness_ms": 0,
                        "lite_mode": controls.lite_mode,
                        "model_configuration_version": model_config.get("version") if model_config else None,
                        "task_queue": settings.temporal_task_queue,
                    },
                    "job": {
                        "job_id": job_id, "holder_id": holder, "scope": job["scope"],
                        "tier": job["tier"],
                        "strategy_account_id": job.get("strategyAccountId"),
                    },
                },
                id=f"analysis-{job_id}", task_queue=settings.temporal_task_queue,
            )
        except WorkflowAlreadyStartedError:
            return {
                "accepted": True, "status": "already_dispatched",
                "workflowId": f"analysis-{job_id}",
            }
        return {"accepted": True, "status": "dispatched", "workflowId": handle.id}
    except Exception as exc:
        if job.get("scope") == "private":
            await convex.command("releaseAgentCredits", jobId=job_id, reason=str(exc), rateCardVersion=1)
        await convex.fail(job_id, holder, str(exc), retryable=False)
        raise
    finally:
        await redis.aclose()


def _validate_manual_job(job: dict, settings: Settings, model_config: dict | None = None) -> None:
    if job.get("trigger") not in {"manual_public", "manual_private"}:
        raise RuntimeError("Only explicitly requested manual jobs can be dispatched")
    if not model_config and settings.provider_mode != "deepseek_only":
        raise RuntimeError("No active upfront rate card for the configured provider route")
    confirmation = json.loads(job.get("payloadJson") or "{}")
    estimate = tier_estimate(job["tier"]) if not model_config else {
        "pricingVersion": model_config["pricingVersion"],
        "estimatedCostMicrousd": model_config["estimatedProviderCostMicrousd"],
    }
    if (
        confirmation.get("pricingVersion") != estimate["pricingVersion"]
        or confirmation.get("estimatedCostMicrousd") != estimate["estimatedCostMicrousd"]
    ):
        raise RuntimeError("Current rate card was not confirmed")
