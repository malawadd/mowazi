import asyncio
import logging

import orjson
from redis.asyncio import Redis

from .config import get_settings
from .data_adapters import configured_content_adapters, default_market_adapters
from .storage import AnalysisRepository


log = logging.getLogger("moeazi.ingestor")
MARKETS = ("BTC-USD", "ETH-USD", "SOL-USD")


async def ingest_forever() -> None:
    settings = get_settings()
    repository = AnalysisRepository(settings.postgres_dsn)
    redis = Redis.from_url(settings.redis_url)
    adapters = {**default_market_adapters(), **configured_content_adapters(settings)}
    while True:
        for market in MARKETS:
            results = await asyncio.gather(
                *(adapter.fetch(market) for adapter in adapters.values()), return_exceptions=True,
            )
            for name, result in zip(adapters, results):
                if isinstance(result, Exception):
                    log.warning("adapter_failed", extra={"adapter": name, "market": market, "error": str(result)})
                    continue
                for item in result:
                    item.metadata["market"] = market
                    await repository.save_evidence(item)
                    await redis.setex(
                        f"evidence:hot:{market}:{item.ref.id}", 300,
                        orjson.dumps({"ref": item.ref.model_dump(mode="json"), "content": item.content}),
                    )
        await asyncio.sleep(15)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(ingest_forever())
