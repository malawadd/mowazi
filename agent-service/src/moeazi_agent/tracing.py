import json
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


SECRET_PATTERN = re.compile(r"(?i)(sk-[a-z0-9_-]{8,}|bearer\s+[a-z0-9._-]+|api[_-]?key\s*[:=]\s*\S+)")


def sanitize(value: Any) -> Any:
    if isinstance(value, str):
        return SECRET_PATTERN.sub("[REDACTED]", value)[:4_000]
    if isinstance(value, list):
        return [sanitize(item) for item in value[:30]]
    if isinstance(value, dict):
        return {
            str(key)[:80]: "[REDACTED]" if any(token in str(key).lower() for token in ("secret", "api_key", "authorization")) else sanitize(item)
            for key, item in list(value.items())[:60]
        }
    return value


class TraceRepository:
    def __init__(self, engine: AsyncEngine, redis: Redis | None = None):
        self.engine = engine
        self.redis = redis

    async def record_analysis(self, synthesis, reports, calls, evidence_items, account_id: str | None) -> None:
        root_id = f"{synthesis.analysis_id}:run"
        await self.append({
            "event_id": root_id, "analysis_id": synthesis.analysis_id, "account_id": account_id,
            "event_type": "analysis", "status": "completed",
            "input_summary": {"market": synthesis.market, "tier": synthesis.tier},
            "output_summary": {
                "consensus": synthesis.consensus, "confidence": synthesis.confidence,
                "disagreement": synthesis.disagreement, "conflicts": synthesis.conflicts,
            },
            "decision_summary": _synthesis_summary(synthesis),
            "created_at": synthesis.created_at, "completed_at": synthesis.created_at,
        })
        for item in evidence_items:
            ref, content = item if isinstance(item, tuple) else (item, "")
            await self.append({
                "event_id": f"{synthesis.analysis_id}:evidence:{ref.id}",
                "analysis_id": synthesis.analysis_id, "account_id": account_id,
                "parent_event_id": root_id, "event_type": "evidence", "status": "completed",
                "input_summary": {}, "output_summary": {
                    "evidenceId": ref.id, "source": ref.source, "reference": str(ref.uri),
                    "observedAt": ref.observed_at.isoformat(), "quality": ref.quality_score,
                    "contentHash": ref.content_hash, "excerpt": sanitize(content[:1_000]),
                },
                "decision_summary": f"Evidence from {ref.source}", "created_at": synthesis.created_at,
            })
        report_map = {(item.role, item.provider): item for item in reports}
        specialist_ids: list[str] = []
        for index, call in enumerate(calls):
            event_id = f"{synthesis.analysis_id}:call:{index}"
            report = report_map.get((call.get("role"), call.get("provider")))
            kind = "synthesis" if call.get("kind") == "synthesis" else "model_call"
            output = report.model_dump(mode="json") if report else (
                {"consensus": synthesis.consensus, "confidence": synthesis.confidence}
                if kind == "synthesis" else {}
            )
            if call.get("metadata"):
                output = {**output, "routing": call["metadata"]}
            await self.append({
                "event_id": event_id, "analysis_id": synthesis.analysis_id,
                "account_id": account_id, "parent_event_id": root_id,
                "event_type": kind, "role": call.get("role"), "provider": call.get("provider"),
                "model": call.get("model"), "credential_source": call.get("credential_source", "platform"),
                "served_model": call.get("served_model"),
                "upstream_provider": call.get("upstream_provider"),
                "model_family": call.get("model_family"),
                "routing_strategy": call.get("routing_strategy"),
                "fallback_attempts": call.get("fallback_attempts", 0),
                "generation_id": call.get("generation_id"),
                "cost_source": call.get("cost_source", "rate_estimate"),
                "status": call.get("status", "failed"),
                "input_summary": {"evidenceIds": call.get("evidence_ids", []), "promptVersion": "agent-v2"},
                "output_summary": output,
                "decision_summary": call.get("decision_summary") or _report_summary(report),
                "input_tokens": call.get("input_tokens", 0),
                "cached_input_tokens": call.get("cached_input_tokens", 0),
                "output_tokens": call.get("output_tokens", 0),
                "provider_cost_microusd": call.get("provider_cost_microusd", 0),
                "platform_credits": call.get("platform_credits", 0) if call.get("status") == "completed" else 0,
                "latency_ms": call.get("latency_ms", 0), "error": call.get("error"),
                "created_at": synthesis.created_at, "completed_at": synthesis.created_at,
            })
            if kind == "model_call": specialist_ids.append(event_id)

    async def append(self, event: dict) -> None:
        values = _event_values(event)
        async with self.engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO agent_trace_events
                  (event_id, analysis_id, account_id, parent_event_id, event_type, role, provider,
                   model, credential_source, served_model, upstream_provider, model_family,
                   routing_strategy, fallback_attempts, generation_id, cost_source,
                   status, input_summary, output_summary, decision_summary,
                   input_tokens, cached_input_tokens, output_tokens, provider_cost_microusd,
                   platform_credits, latency_ms, retry_number, error, created_at, completed_at)
                VALUES (:event_id, :analysis_id, :account_id, :parent_event_id, :event_type, :role,
                  :provider, :model, :credential_source, :served_model, :upstream_provider,
                  :model_family, :routing_strategy, :fallback_attempts, :generation_id, :cost_source,
                  :status, CAST(:input_summary AS jsonb),
                  CAST(:output_summary AS jsonb), :decision_summary, :input_tokens,
                  :cached_input_tokens, :output_tokens, :provider_cost_microusd, :platform_credits,
                  :latency_ms, :retry_number, :error, :created_at, :completed_at)
                ON CONFLICT (event_id, created_at) DO NOTHING
            """), values)
            if event.get("account_id") and event.get("provider"):
                await conn.execute(text("""
                    INSERT INTO agent_usage_daily
                      (day, account_id, provider, model, credential_source, calls, successful_calls,
                       input_tokens, cached_input_tokens, output_tokens, provider_cost_microusd,
                       platform_credits, latency_ms)
                    VALUES (CURRENT_DATE, :account_id, :provider, :model, :credential_source, 1,
                      :successful, :input_tokens, :cached_input_tokens, :output_tokens,
                      :provider_cost_microusd, :platform_credits, :latency_ms)
                    ON CONFLICT (day, account_id, provider, model, credential_source) DO UPDATE SET
                      calls = agent_usage_daily.calls + 1,
                      successful_calls = agent_usage_daily.successful_calls + EXCLUDED.successful_calls,
                      input_tokens = agent_usage_daily.input_tokens + EXCLUDED.input_tokens,
                      cached_input_tokens = agent_usage_daily.cached_input_tokens + EXCLUDED.cached_input_tokens,
                      output_tokens = agent_usage_daily.output_tokens + EXCLUDED.output_tokens,
                      provider_cost_microusd = agent_usage_daily.provider_cost_microusd + EXCLUDED.provider_cost_microusd,
                      platform_credits = agent_usage_daily.platform_credits + EXCLUDED.platform_credits,
                      latency_ms = agent_usage_daily.latency_ms + EXCLUDED.latency_ms
                """), {**values, "successful": 1 if event.get("status") == "completed" else 0})
        if self.redis and event.get("account_id"):
            await self.redis.publish(
                f"agent-trace:{event['account_id']}", json.dumps(sanitize(event), default=str),
            )

    async def list_runs(self, account_id: str, filters: dict) -> list[dict]:
        days = max(1, min(7, int(filters.get("days", 7))))
        async with self.engine.connect() as conn:
            rows = await conn.execute(text("""
                SELECT analysis_id, market, tier, consensus, confidence, disagreement,
                       synthesis, billing_route, created_at, valid_until
                FROM analysis_runs WHERE account_id = :account
                  AND created_at >= :since
                  AND (:market = '' OR market = :market)
                ORDER BY created_at DESC LIMIT :limit
            """), {
                "account": account_id, "since": datetime.now(timezone.utc) - timedelta(days=days),
                "market": str(filters.get("market", "")).upper(),
                "limit": max(1, min(200, int(filters.get("limit", 50)))),
            })
            return [dict(row._mapping) for row in rows]

    async def get_trace(self, account_id: str, analysis_id: str) -> dict | None:
        async with self.engine.connect() as conn:
            run = (await conn.execute(text("""
                SELECT analysis_id, market, tier, synthesis, billing_route, created_at
                FROM analysis_runs WHERE account_id = :account AND analysis_id = :analysis
                ORDER BY created_at DESC LIMIT 1
            """), {"account": account_id, "analysis": analysis_id})).first()
            if not run:
                return None
            events = await conn.execute(text("""
                SELECT * FROM agent_trace_events WHERE account_id = :account
                  AND analysis_id = :analysis AND created_at > now() - interval '7 days'
                ORDER BY created_at, event_id
            """), {"account": account_id, "analysis": analysis_id})
            return {"run": dict(run._mapping), "events": [dict(row._mapping) for row in events]}

    async def usage_summary(self, account_id: str, days: int = 7) -> list[dict]:
        async with self.engine.connect() as conn:
            rows = await conn.execute(text("""
                SELECT day, provider, model, credential_source, calls, successful_calls,
                       input_tokens, cached_input_tokens, output_tokens, provider_cost_microusd,
                       platform_credits, latency_ms
                FROM agent_usage_daily WHERE account_id = :account AND day >= CURRENT_DATE - :days
                ORDER BY day DESC, provider, model
            """), {"account": account_id, "days": max(0, min(6, days - 1))})
            return [dict(row._mapping) for row in rows]


def _event_values(event: dict) -> dict:
    defaults = {
        "parent_event_id": None, "role": None, "provider": None, "model": None,
        "credential_source": None, "input_summary": {}, "output_summary": {},
        "served_model": None, "upstream_provider": None, "model_family": None,
        "routing_strategy": None, "fallback_attempts": 0, "generation_id": None,
        "cost_source": "rate_estimate",
        "decision_summary": None, "input_tokens": 0, "cached_input_tokens": 0,
        "output_tokens": 0, "provider_cost_microusd": 0, "platform_credits": 0,
        "latency_ms": 0, "retry_number": 0, "error": None,
        "created_at": datetime.now(timezone.utc), "completed_at": None,
    }
    values = {**defaults, **event}
    values["input_summary"] = json.dumps(sanitize(values["input_summary"]), default=str)
    values["output_summary"] = json.dumps(sanitize(values["output_summary"]), default=str)
    values["error"] = sanitize(values["error"]) if values["error"] else None
    return values


def _report_summary(report) -> str:
    if not report:
        return "Model call did not produce a validated report."
    return report.decision_summary or f"{report.role.replace('_', ' ').title()} was {report.stance.replace('_', ' ')} at {report.confidence:.0%} confidence."


def _synthesis_summary(synthesis) -> str:
    direction = "bullish" if synthesis.consensus > 0.15 else "bearish" if synthesis.consensus < -0.15 else "mixed"
    return f"The validated team synthesis was {direction} at {synthesis.confidence:.0%} confidence."
