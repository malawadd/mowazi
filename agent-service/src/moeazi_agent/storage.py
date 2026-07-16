import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from .contracts import EvidenceRef, MarketSynthesis, SignalReport


class AnalysisRepository:
    def __init__(self, dsn: str):
        self.engine: AsyncEngine = create_async_engine(dsn, pool_pre_ping=True)

    async def save_evidence(self, item) -> None:
        async with self.engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO evidence
                  (evidence_id, source, reference, observed_at, event_at, quality_score,
                   content_hash, sanitized_content, provenance)
                VALUES (:id, :source, :reference, :observed, :event, :quality,
                        :hash, :content, CAST(:provenance AS jsonb))
                ON CONFLICT (evidence_id) DO NOTHING
            """), {
                "id": item.ref.id, "source": item.ref.source, "reference": str(item.ref.uri),
                "observed": item.ref.observed_at, "event": item.ref.event_at,
                "quality": item.ref.quality_score, "hash": item.ref.content_hash,
                "content": item.content, "provenance": json.dumps(item.metadata),
            })

    async def recent_evidence(self, market: str, limit: int = 100) -> list[tuple[EvidenceRef, str]]:
        async with self.engine.connect() as conn:
            rows = await conn.execute(text("""
                SELECT evidence_id, source, reference, observed_at, event_at, quality_score,
                       content_hash, sanitized_content FROM evidence
                WHERE provenance->>'market' = :market
                  AND observed_at > now() - interval '30 minutes'
                ORDER BY observed_at DESC LIMIT :limit
            """), {"market": market, "limit": max(1, min(500, limit))})
            return [(
                EvidenceRef(
                    id=row.evidence_id, source=row.source, uri=row.reference,
                    observed_at=row.observed_at, event_at=row.event_at,
                    quality_score=row.quality_score, content_hash=row.content_hash,
                ),
                row.sanitized_content,
            ) for row in rows]

    async def save_run(
        self,
        synthesis: MarketSynthesis,
        reports: list[SignalReport],
        provider_calls: list[dict[str, Any]],
        scope: str,
        account_id: str | None,
    ) -> None:
        async with self.engine.begin() as conn:
            await conn.execute(text("""
                INSERT INTO analysis_runs
                  (analysis_id, market, tier, scope, account_id, consensus, confidence,
                   disagreement, freshness_ms, synthesis, created_at, valid_until)
                VALUES (:id, :market, :tier, :scope, :account, :consensus, :confidence,
                        :disagreement, :freshness, CAST(:synthesis AS jsonb), :created, :valid)
                ON CONFLICT DO NOTHING
            """), {
                "id": synthesis.analysis_id, "market": synthesis.market, "tier": synthesis.tier,
                "scope": scope, "account": account_id, "consensus": synthesis.consensus,
                "confidence": synthesis.confidence, "disagreement": synthesis.disagreement,
                "freshness": synthesis.freshness_ms, "synthesis": synthesis.model_dump_json(),
                "created": synthesis.created_at, "valid": synthesis.valid_until,
            })
            for report in reports:
                await conn.execute(text("""
                    INSERT INTO signal_reports
                      (analysis_id, role, provider, model, score, confidence, report, expires_at)
                    VALUES (:analysis, :role, :provider, :model, :score, :confidence,
                            CAST(:report AS jsonb), :expires)
                """), {
                    "analysis": synthesis.analysis_id, "role": report.role, "provider": report.provider,
                    "model": report.model, "score": report.score, "confidence": report.confidence,
                    "report": report.model_dump_json(), "expires": report.expires_at,
                })
            for call in provider_calls:
                await conn.execute(text("""
                    INSERT INTO provider_calls
                      (analysis_id, role, provider, model, status, latency_ms, error, metadata)
                    VALUES (:analysis, :role, :provider, :model, :status, :latency, :error,
                            CAST(:metadata AS jsonb))
                """), {
                    "analysis": synthesis.analysis_id, "role": call["role"], "provider": call["provider"],
                    "model": call.get("model", "unknown"), "status": call["status"],
                    "latency": call.get("latency_ms", 0), "error": call.get("error"),
                    "metadata": json.dumps(call.get("metadata", {})),
                })
