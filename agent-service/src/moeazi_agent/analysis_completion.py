from datetime import datetime, timezone
import json

from redis.asyncio import Redis
from temporalio import activity

from .config import get_settings
from .contracts import MarketSynthesis
from .convex import ConvexWorkerClient
from .execution_workflow import gateway_call
from .proposal_routing import proposal_from_synthesis
from .runtime_controls import RuntimeControlStore, RuntimeRunMetrics
from .storage import AnalysisRepository
from .tracing import TraceRepository


@activity.defn
async def complete_analysis_job_activity(payload: dict) -> dict | None:
    settings = get_settings()
    convex = ConvexWorkerClient(settings)
    job, result = payload["job"], payload["result"]
    convex_operations = 1
    await convex.complete(job["job_id"], job["holder_id"], result["synthesis"], result["calls"])
    proposal_result = None
    if job["scope"] == "private":
        billable = sum(
            int(call.get("platform_credits", 0))
            for call in result["calls"] if call["status"] == "completed"
        )
        await convex.command(
            "settleAgentCredits",
            jobId=job["job_id"],
            billableAmount=billable,
            rateCardVersion=2 if result.get("model_configuration_version") else 1,
            metadataJson=json.dumps({
                "billing": "validated outputs only",
                "modelConfigurationVersion": result.get("model_configuration_version"),
                "credentialSources": sorted(set(call.get("credential_source", "platform") for call in result["calls"])),
                "providerCostMicrousd": sum(int(call.get("provider_cost_microusd", 0)) for call in result["calls"]),
            }, separators=(",", ":")),
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
                await _record_proposal_trace(settings, synthesis, proposal, proposal_result)
                if proposal_result.get("status") == "simulated":
                    convex_operations += await _record_shadow_fill(
                        convex, proposal, proposal_result["proposalId"], settings,
                    )
    await _record_metrics(settings, result, convex_operations)
    return proposal_result


async def _record_shadow_fill(convex, proposal, proposal_id: str, settings) -> int:
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
        redis = Redis.from_url(settings.redis_url)
        try:
            repository = AnalysisRepository(settings.postgres_dsn)
            await TraceRepository(repository.engine, redis).append({
                "event_id": f"{proposal.analysis_id}:simulation",
                "analysis_id": proposal.analysis_id, "account_id": proposal.account_id,
                "event_type": "simulation", "status": "completed",
                "input_summary": {"venue": proposal.candidate_venues[0], "sizeUsd": proposal.size_usd},
                "output_summary": {"entryPrice": float(quote["raw"]["price"]), "quoteReference": quote["reference"]},
                "decision_summary": f"Recorded a shadow fill at {float(quote['raw']['price']):,.4f} without signing.",
            })
        finally:
            await redis.aclose()
        return 1
    except Exception:
        return 0


async def _record_proposal_trace(settings, synthesis, proposal, result) -> None:
    redis = Redis.from_url(settings.redis_url)
    try:
        repository = AnalysisRepository(settings.postgres_dsn)
        await TraceRepository(repository.engine, redis).append({
            "event_id": f"{synthesis.analysis_id}:proposal",
            "analysis_id": synthesis.analysis_id, "account_id": proposal.account_id,
            "event_type": "proposal", "status": result.get("status", "recorded"),
            "input_summary": {
                "evidenceIds": proposal.evidence_ids, "candidateVenues": proposal.candidate_venues,
            },
            "output_summary": proposal.model_dump(mode="json"),
            "decision_summary": (
                f"Proposed a {proposal.side} position sized at ${proposal.size_usd:,.2f}; "
                f"routing state is {result.get('status', 'recorded').replace('_', ' ')}."
            ),
        })
    except Exception:
        return
    finally:
        await redis.aclose()


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
