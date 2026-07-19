import json

from temporalio.client import Client
from temporalio.exceptions import WorkflowAlreadyStartedError

from .config import Settings
from .convex import ConvexWorkerClient
from .costs import tier_estimate
from .credits import estimated_credits
from .temporal_app import MarketAnalysisWorkflow


async def dispatch_analysis_job(client: Client, settings: Settings, job_id: str) -> dict:
    convex = ConvexWorkerClient(settings)
    holder = f"event-{job_id}"
    claimed = await convex.claim_job(job_id, holder)
    if not claimed.get("claimed"):
        status = claimed.get("reason", "unavailable")
        return {"accepted": status in {"claimed", "running", "completed"}, "status": status}
    job = claimed["job"]
    try:
        _validate_manual_job(job, settings)
        if job.get("scope") == "private":
            reservation = await convex.command(
                "reserveAgentCredits", userId=job["userId"], jobId=job_id,
                amount=estimated_credits(job["tier"]), expiresAt=job["createdAt"] + 900_000,
                rateCardVersion=1,
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
                    },
                    "job": {
                        "job_id": job_id, "holder_id": holder, "scope": job["scope"],
                        "tier": job["tier"],
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


def _validate_manual_job(job: dict, settings: Settings) -> None:
    if job.get("trigger") not in {"manual_public", "manual_private"}:
        raise RuntimeError("Only explicitly requested manual jobs can be dispatched")
    if settings.provider_mode != "deepseek_only":
        raise RuntimeError("No active upfront rate card for the configured provider route")
    confirmation = json.loads(job.get("payloadJson") or "{}")
    estimate = tier_estimate(job["tier"])
    if (
        confirmation.get("pricingVersion") != estimate["pricingVersion"]
        or confirmation.get("estimatedCostMicrousd") != estimate["estimatedCostMicrousd"]
    ):
        raise RuntimeError("Current rate card was not confirmed")
