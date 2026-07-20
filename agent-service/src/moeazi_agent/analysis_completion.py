from datetime import datetime, timezone

from redis.asyncio import Redis
from temporalio import activity

from .config import get_settings
from .contracts import MarketSynthesis
from .convex import ConvexWorkerClient
from .execution_workflow import gateway_call
from .proposal_routing import proposal_from_synthesis
from .runtime_controls import RuntimeControlStore, RuntimeRunMetrics


@activity.defn
async def complete_analysis_job_activity(payload: dict) -> dict | None:
    settings = get_settings()
    convex = ConvexWorkerClient(settings)
    job, result = payload["job"], payload["result"]
    convex_operations = 1
    await convex.complete(job["job_id"], job["holder_id"], result["synthesis"], result["calls"])
    proposal_result = None
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
            "settleAgentCredits",
            jobId=job["job_id"],
            billableAmount=specialists * 3 + syntheses * 7,
            rateCardVersion=1,
            metadataJson='{"billing":"validated outputs only"}',
        )
        convex_operations += 1
        context = None
        if job.get("strategy_account_id"):
            context = await convex.command(
                "getAgentExecutionContext",
                strategyAccountId=job["strategy_account_id"],
            )
            convex_operations += 1
        if context:
            synthesis = MarketSynthesis.model_validate(result["synthesis"])
            proposal = proposal_from_synthesis(
                synthesis, result["reports"], job["strategy_account_id"],
                context["policy"]["policy"],
            )
            if proposal:
                proposal_result = await convex.command(
                    "recordTradeProposal",
                    strategyAccountId=job["strategy_account_id"],
                    analysisId=synthesis.analysis_id,
                    policyVersion=context["policy"]["version"],
                    marketId=proposal.market,
                    side=proposal.side,
                    payloadJson=proposal.model_dump_json(),
                    confidence=synthesis.confidence,
                    consensus=abs(synthesis.consensus),
                    idempotencyKey=f"proposal:{synthesis.analysis_id}",
                    expiresAt=int(proposal.expires_at.timestamp() * 1000),
                )
                convex_operations += 1
                if proposal_result.get("status") == "simulated":
                    convex_operations += await _record_shadow_fill(
                        convex, proposal, proposal_result["proposalId"],
                    )
    await _record_metrics(settings, result, convex_operations)
    return proposal_result


async def _record_shadow_fill(convex, proposal, proposal_id: str) -> int:
    try:
        quote = await gateway_call("/internal/quote", {
            "venue": proposal.candidate_venues[0],
            "request": {
                "market": proposal.market,
                "side": proposal.side,
                "size_usd": proposal.size_usd,
            },
        })
        await convex.command(
            "recordShadowExecution",
            proposalId=proposal_id,
            entryPrice=float(quote["raw"]["price"]),
            sizeUsd=proposal.size_usd,
            quoteReference=quote["reference"],
        )
        return 1
    except Exception:
        return 0


async def _record_metrics(settings, result: dict, convex_operations: int) -> None:
    redis = Redis.from_url(settings.redis_url)
    try:
        successful = [call for call in result["calls"] if call["status"] == "completed"]
        await RuntimeControlStore(redis, settings).record_run_metrics(RuntimeRunMetrics(
            provider_calls=len(result["calls"]),
            successful_calls=len(successful),
            estimated_cost_usd=sum(
                float(call.get("estimated_cost_usd") or 0) for call in successful
            ),
            convex_operations=convex_operations,
            completed_at=datetime.now(timezone.utc).isoformat(),
        ))
    finally:
        await redis.aclose()


@activity.defn
async def fail_analysis_job_activity(payload: dict) -> None:
    settings = get_settings()
    convex = ConvexWorkerClient(settings)
    job = payload["job"]
    if job["scope"] == "private":
        await convex.command(
            "releaseAgentCredits",
            jobId=job["job_id"],
            reason=payload["error"],
            rateCardVersion=1,
        )
    await convex.fail(
        job["job_id"], job["holder_id"], payload["error"], retryable=False,
    )
