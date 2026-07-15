from typing import Any

import httpx

from .config import Settings


class ConvexWorkerClient:
    def __init__(self, settings: Settings):
        self.client = httpx.AsyncClient(
            timeout=20,
            headers={"Authorization": f"Bearer {settings.worker_shared_secret.get_secret_value()}"},
        )
        self.url = settings.convex_worker_url

    async def command(self, command: str, **payload: Any) -> Any:
        response = await self.client.post(self.url, json={"command": command, "payload": payload})
        response.raise_for_status()
        data = response.json()
        if isinstance(data, dict) and data.get("error"):
            raise RuntimeError(data["error"])
        return data

    async def claim(self, holder_id: str) -> dict | None:
        return await self.command("claimNextAnalysisJob", holderId=holder_id, leaseMs=120_000)

    async def heartbeat(self, job_id: str, holder_id: str) -> None:
        await self.command("heartbeatAnalysisJob", jobId=job_id, holderId=holder_id, leaseMs=120_000)

    async def complete(self, job_id: str, holder_id: str, synthesis: dict, providers: list[dict]) -> None:
        payload = {
            **synthesis["visualization"],
            "consensus": synthesis["consensus"], "confidence": synthesis["confidence"],
            "disagreement": synthesis["disagreement"], "conflicts": synthesis["conflicts"],
        }
        await self.command(
            "completeAnalysisJob", jobId=job_id, holderId=holder_id,
            analysisId=synthesis["analysis_id"], status="fresh", payloadJson=_json(payload),
            providersJson=_json(providers), sourceFreshnessMs=synthesis["freshness_ms"],
            validUntil=_epoch_ms(synthesis["valid_until"]),
        )

    async def fail(self, job_id: str, holder_id: str, error: str, retryable: bool = True) -> None:
        await self.command("failAnalysisJob", jobId=job_id, holderId=holder_id, error=error[:2000], retryable=retryable)


def _json(value: Any) -> str:
    import orjson
    return orjson.dumps(value, option=orjson.OPT_NON_STR_KEYS).decode()


def _epoch_ms(value: str) -> int:
    from datetime import datetime
    return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)
