from datetime import datetime, timedelta, timezone

from temporalio import activity, workflow
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    import httpx

    from moeazi_agent.config import get_settings
    from moeazi_agent.contracts import ProtectiveExits, TradeProposal
    from moeazi_agent.convex import ConvexWorkerClient
    from moeazi_agent.policy import AutomationPolicy, RiskContext
    from moeazi_agent.runtime_controls import RuntimeControlStore
    from moeazi_agent.storage import AnalysisRepository
    from moeazi_agent.tracing import TraceRepository


async def gateway_call(path: str, payload: dict) -> dict:
    settings = get_settings()
    async with httpx.AsyncClient(
        base_url=settings.execution_gateway_url,
        timeout=30,
        headers={
            "Authorization": f"Bearer {settings.worker_shared_secret.get_secret_value()}",
            "Content-Type": "application/json",
        },
    ) as client:
        response = await client.post(path, json=payload)
        response.raise_for_status()
        return response.json()


def protective_exits(proposal: TradeProposal, price: float) -> ProtectiveExits:
    if proposal.side == "long":
        return ProtectiveExits(stop_loss=price * 0.98, take_profit=price * 1.04)
    return ProtectiveExits(stop_loss=price * 1.02, take_profit=price * 0.96)


@activity.defn
async def execute_proposal_activity(payload: dict) -> dict:
    settings = get_settings()
    convex = ConvexWorkerClient(settings)
    context = await convex.command(
        "getTradeProposalExecutionContext", proposalId=payload["proposal_id"],
    )
    if not context:
        raise RuntimeError("Trade proposal execution context is unavailable")
    row = context["proposal"]
    proposal = TradeProposal.model_validate(row["payload"])
    if row["status"] not in {"approved", "executing"}:
        raise RuntimeError(f"Proposal is not executable: {row['status']}")
    if row["expiresAt"] <= int(datetime.now(timezone.utc).timestamp() * 1000):
        await convex.command("transitionTradeProposal", proposalId=row["_id"], status="expired")
        return {"status": "expired"}
    if context["profile"].get("paused") or context["strategy"].get("emergencyStop"):
        await convex.command("transitionTradeProposal", proposalId=row["_id"], status="blocked")
        return {"status": "blocked", "reason": "Agent or strategy is paused"}
    if context["availableCredits"] <= 0:
        await convex.command("transitionTradeProposal", proposalId=row["_id"], status="blocked")
        return {"status": "blocked", "reason": "Credits are exhausted"}
    if payload.get("automatic"):
        from redis.asyncio import Redis
        redis = Redis.from_url(settings.redis_url)
        try:
            controls = await RuntimeControlStore(redis, settings).get()
            if controls.manual_guard:
                await convex.command("transitionTradeProposal", proposalId=row["_id"], status="blocked")
                return {"status": "blocked", "reason": "Manual Guard blocks automatic execution"}
        finally:
            await redis.aclose()
    venue = proposal.candidate_venues[0]
    quote = await gateway_call("/internal/quote", {
        "venue": venue,
        "request": {
            "market": proposal.market,
            "side": proposal.side,
            "size_usd": proposal.size_usd,
        },
    })
    price = float(quote["raw"]["price"])
    await record_execution_trace(
        settings, proposal, "quote", "completed",
        {"venue": venue, "market": proposal.market, "sizeUsd": proposal.size_usd},
        {"reference": quote.get("reference"), "price": price},
        f"Fetched a fresh executable {venue} quote at {price:,.4f}.",
    )
    proposal = proposal.model_copy(update={"protective_exits": protective_exits(proposal, price)})
    policy = AutomationPolicy.from_convex({
        **context["policy"]["policy"],
        "version": context["policy"]["version"],
    })
    now = datetime.now(timezone.utc)
    risk = RiskContext(
        now=now,
        analysis_created_at=datetime.fromtimestamp(row["createdAt"] / 1000, timezone.utc),
        confidence=row["confidence"],
        consensus=row["consensus"],
        daily_volume_usd=0,
        current_exposure_usd=0,
        daily_loss_usd=0,
        drawdown_pct=0,
        concurrent_positions=0,
        credits_spent_today=0,
        emergency_stop=context["strategy"].get("emergencyStop", False),
        provider_quorum=True,
        evidence_complete=bool(proposal.evidence_ids),
        venue_healthy=True,
        reconciliation_clear=True,
    )
    idempotency_key = row["idempotencyKey"]
    await convex.command("transitionTradeProposal", proposalId=row["_id"], status="executing")
    checked = await gateway_call("/internal/preflight", {
        "venue": venue,
        "proposal": proposal.model_dump(mode="json"),
        "policy": policy.model_dump(mode="json"),
        "context": risk.model_dump(mode="json"),
        "quote_request": {
            "market": proposal.market,
            "side": proposal.side,
            "size_usd": proposal.size_usd,
        },
        "idempotency_key": idempotency_key,
    })
    decision = checked["decision"]
    await record_execution_trace(
        settings, proposal, "policy_check", "completed" if decision["result"] == "pass" else "blocked",
        {"policyVersion": policy.version, "quoteReference": quote.get("reference")},
        {"result": decision["result"], "checks": decision["checks"]},
        f"Deterministic execution policy {decision['result']}ed the fresh quote.",
    )
    if decision["result"] != "pass":
        await convex.command("transitionTradeProposal", proposalId=row["_id"], status="blocked")
        return {"status": "blocked", "checks": decision["checks"]}
    execution = await gateway_call("/internal/dispatch", {
        "venue": venue,
        "request": proposal.model_dump(mode="json"),
        "decision": decision,
        "idempotency_key": idempotency_key,
    })
    await record_execution_trace(
        settings, proposal, "execution", execution.get("status", "completed"),
        {"venue": venue, "idempotencyKey": idempotency_key}, execution,
        f"Execution gateway returned {execution.get('status', 'completed')} for {venue}.",
    )
    await convex.command("transitionTradeProposal", proposalId=row["_id"], status="executed")
    return {"status": execution["status"], "execution": execution, "checks": decision["checks"]}


async def record_execution_trace(
    settings, proposal: TradeProposal, event_type: str, status: str,
    input_summary: dict, output_summary: dict, decision_summary: str,
) -> None:
    from redis.asyncio import Redis
    redis = Redis.from_url(settings.redis_url)
    try:
        repository = AnalysisRepository(settings.postgres_dsn)
        await TraceRepository(repository.engine, redis).append({
            "event_id": f"{proposal.analysis_id}:{event_type}",
            "analysis_id": proposal.analysis_id, "account_id": proposal.account_id,
            "event_type": event_type, "status": status,
            "input_summary": input_summary, "output_summary": output_summary,
            "decision_summary": decision_summary,
        })
    except Exception:
        return
    finally:
        await redis.aclose()


@workflow.defn
class ExecutionWorkflow:
    @workflow.run
    async def run(self, payload: dict) -> dict:
        return await workflow.execute_activity(
            execute_proposal_activity,
            payload,
            start_to_close_timeout=timedelta(minutes=3),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )
