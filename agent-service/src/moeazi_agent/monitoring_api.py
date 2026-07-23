import asyncio
import json

import orjson
from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import create_async_engine

from .config import get_settings
from .convex import ConvexWorkerClient
from .tracing import TraceRepository, sanitize


router = APIRouter(prefix="/v1/monitoring", tags=["agent monitoring"])
settings = get_settings()
engine = create_async_engine(settings.postgres_dsn, pool_pre_ping=True)


def authorize(value: str | None, subject: str | None) -> str:
    if value != f"Bearer {settings.worker_shared_secret.get_secret_value()}" or not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return subject


async def account_for(subject: str) -> str:
    owner = await ConvexWorkerClient(settings).command("getProviderOwnerContext", subject=subject)
    if not owner:
        raise HTTPException(status_code=404, detail="Strategy account not found")
    return str(owner["strategyAccountId"])


@router.get("/runs")
async def list_runs(
    days: int = Query(default=7, ge=1, le=7), market: str = "", limit: int = Query(default=50, ge=1, le=200),
    authorization: str | None = Header(default=None), x_moeazi_subject: str | None = Header(default=None),
):
    subject = authorize(authorization, x_moeazi_subject)
    account = await account_for(subject)
    rows = await TraceRepository(engine).list_runs(account, {"days": days, "market": market, "limit": limit})
    return {"runs": [_jsonable(row) for row in rows], "retentionDays": 7}


@router.get("/usage")
async def usage(
    days: int = Query(default=7, ge=1, le=7), authorization: str | None = Header(default=None),
    x_moeazi_subject: str | None = Header(default=None),
):
    subject = authorize(authorization, x_moeazi_subject)
    account = await account_for(subject)
    rows = await TraceRepository(engine).usage_summary(account, days)
    return {"usage": [_jsonable(row) for row in rows], "days": days}


@router.get("/runs/{analysis_id}")
async def run_trace(
    analysis_id: str, authorization: str | None = Header(default=None),
    x_moeazi_subject: str | None = Header(default=None),
):
    subject = authorize(authorization, x_moeazi_subject)
    account = await account_for(subject)
    trace = await TraceRepository(engine).get_trace(account, analysis_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Run trace not found or expired")
    events = [_jsonable(row) for row in trace["events"]]
    return {"run": _jsonable(trace["run"]), "events": events, "graph": _graph(events)}


@router.get("/stream")
async def stream(
    authorization: str | None = Header(default=None), x_moeazi_subject: str | None = Header(default=None),
):
    subject = authorize(authorization, x_moeazi_subject)
    account = await account_for(subject)

    async def events():
        redis = Redis.from_url(settings.redis_url)
        pubsub = redis.pubsub()
        await pubsub.subscribe(f"agent-trace:{account}")
        try:
            yield "event: ready\ndata: {}\n\n"
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=15)
                if message and message.get("data"):
                    data = message["data"].decode() if isinstance(message["data"], bytes) else str(message["data"])
                    yield f"event: trace\ndata: {data}\n\n"
                else:
                    yield "event: heartbeat\ndata: {}\n\n"
                await asyncio.sleep(0.05)
        finally:
            await pubsub.unsubscribe(f"agent-trace:{account}")
            await pubsub.aclose()
            await redis.aclose()

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


def _jsonable(value):
    return orjson.loads(orjson.dumps(sanitize(value), default=str))


def _graph(events: list[dict]) -> dict:
    nodes = [{
        "id": row["event_id"], "type": row["event_type"],
        "data": {
            "label": _label(row), "status": row["status"], "role": row.get("role"),
            "provider": row.get("provider"), "model": row.get("model"),
            "credentialSource": row.get("credential_source"),
            "servedModel": row.get("served_model"),
            "upstreamProvider": row.get("upstream_provider"),
            "modelFamily": row.get("model_family"),
            "routingStrategy": row.get("routing_strategy"),
            "fallbackAttempts": row.get("fallback_attempts", 0),
            "generationId": row.get("generation_id"),
            "costSource": row.get("cost_source", "rate_estimate"),
            "decisionSummary": row.get("decision_summary"),
            "input": row.get("input_summary", {}), "output": row.get("output_summary", {}),
            "tokens": {
                "input": row.get("input_tokens", 0), "cached": row.get("cached_input_tokens", 0),
                "output": row.get("output_tokens", 0),
            },
            "providerCostMicrousd": row.get("provider_cost_microusd", 0),
            "platformCredits": row.get("platform_credits", 0), "latencyMs": row.get("latency_ms", 0),
            "error": row.get("error"),
        },
    } for row in events]
    evidence = [row for row in events if row["event_type"] == "evidence"]
    specialists = [row for row in events if row["event_type"] == "model_call"]
    syntheses = [row for row in events if row["event_type"] == "synthesis"]
    decision = next((row for row in events if row["event_type"] == "analysis"), None)
    edges: list[dict] = []
    for specialist in specialists:
        wanted = set((specialist.get("input_summary") or {}).get("evidenceIds", []))
        sources = [row for row in evidence if not wanted or (row.get("output_summary") or {}).get("evidenceId") in wanted]
        for source in sources:
            edges.append(_edge(source["event_id"], specialist["event_id"]))
    if syntheses:
        first = [row for row in syntheses if row.get("role") in {
            "critic", "synthesis_primary", "synthesis_challenger",
            "openai_synthesis", "deepseek_synthesis", "synthesis",
        }]
        for specialist in specialists:
            for target in first:
                edges.append(_edge(specialist["event_id"], target["event_id"]))
        arbiter = next((row for row in syntheses if row.get("role") == "arbiter"), None)
        final = next((row for row in reversed(syntheses) if row.get("role") in {"arbiter", "synthesis"}), syntheses[-1])
        if arbiter:
            for source in syntheses:
                if source is not arbiter:
                    edges.append(_edge(source["event_id"], arbiter["event_id"]))
        if decision:
            edges.append(_edge(final["event_id"], decision["event_id"]))
    actions = [row for row in events if row["event_type"] in {
        "proposal", "policy_check", "quote", "simulation", "execution", "reconciliation",
    }]
    previous = decision["event_id"] if decision else (syntheses[-1]["event_id"] if syntheses else None)
    for action in actions:
        if previous:
            edges.append(_edge(previous, action["event_id"]))
        previous = action["event_id"]
    return {"nodes": nodes, "edges": edges}


def _edge(source: str, target: str) -> dict:
    return {"id": f"{source}->{target}", "source": source, "target": target}


def _label(row: dict) -> str:
    if row["event_type"] == "evidence": return str((row.get("output_summary") or {}).get("source", "Evidence"))
    if row["event_type"] == "analysis": return "Team decision"
    if row["event_type"] == "policy_check": return "Policy gate"
    if row["event_type"] == "reconciliation": return "Receipt reconciliation"
    return str(row.get("role") or row["event_type"]).replace("_", " ").title()
