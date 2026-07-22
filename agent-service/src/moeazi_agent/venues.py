from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any

import httpx

from .contracts import StrictModel


class Quote(StrictModel):
    venue: str
    reference: str
    market: str
    input_amount: str
    output_amount: str
    expires_at: datetime
    raw: dict[str, Any]


class VenueHealth(StrictModel):
    venue: str
    healthy: bool
    live_submission_enabled: bool
    reason: str | None = None


class VenueAdapter(ABC):
    name: str

    @abstractmethod
    async def quote(self, request: dict[str, Any]) -> Quote: ...
    @abstractmethod
    async def balance(self, account: str) -> dict[str, Any]: ...
    @abstractmethod
    async def positions(self, account: str) -> list[dict[str, Any]]: ...
    @abstractmethod
    async def place(self, request: dict[str, Any], credential: bytes) -> dict[str, Any]: ...
    @abstractmethod
    async def cancel(self, request: dict[str, Any], credential: bytes) -> dict[str, Any]: ...
    @abstractmethod
    async def close(self, request: dict[str, Any], credential: bytes) -> dict[str, Any]: ...
    @abstractmethod
    async def reconcile(self, account: str) -> dict[str, Any]: ...
    @abstractmethod
    async def health(self) -> VenueHealth: ...


class CertificationBlockedAdapter(VenueAdapter):
    def __init__(self, name: str, reason: str = "Sandbox and funded canaries not certified"):
        self.name, self.reason = name, reason

    async def _blocked(self):
        raise RuntimeError(f"{self.name} execution blocked: {self.reason}")

    async def quote(self, request): return await self._blocked()
    async def balance(self, account): return await self._blocked()
    async def positions(self, account): return await self._blocked()
    async def place(self, request, credential): return await self._blocked()
    async def cancel(self, request, credential): return await self._blocked()
    async def close(self, request, credential): return await self._blocked()
    async def reconcile(self, account): return await self._blocked()
    async def health(self): return VenueHealth(venue=self.name, healthy=False, live_submission_enabled=False, reason=self.reason)


class HyperliquidAdapter(VenueAdapter):
    name = "hyperliquid"

    def __init__(self, base_url: str, live_enabled: bool):
        self.client = httpx.AsyncClient(base_url=base_url, timeout=15)
        self.live_enabled = live_enabled

    async def quote(self, request: dict[str, Any]) -> Quote:
        market = str(request.get("market", "")).upper()
        coin = market.replace("-PERP", "").replace("-USD", "")
        response = await self.client.post("/info", json={"type": "allMids"})
        response.raise_for_status()
        mids = response.json()
        if coin not in mids:
            raise ValueError(f"Hyperliquid market not found: {market}")
        price = str(mids[coin])
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        return Quote(
            venue=self.name,
            reference=f"hl:{coin}:{int(now.timestamp() * 1000)}",
            market=market,
            input_amount=str(request.get("size_usd", "0")),
            output_amount=price,
            expires_at=now + timedelta(seconds=10),
            raw={"price": price, "coin": coin, "source": "hyperliquid-allMids"},
        )

    async def balance(self, account: str) -> dict[str, Any]:
        response = await self.client.post("/info", json={"type": "clearinghouseState", "user": account})
        response.raise_for_status()
        return response.json()

    async def positions(self, account: str) -> list[dict[str, Any]]:
        state = await self.balance(account)
        return state.get("assetPositions", [])

    async def place(self, request, credential):
        raise RuntimeError("Hyperliquid signing remains certification-gated")

    async def cancel(self, request, credential):
        raise RuntimeError("Hyperliquid cancellation remains certification-gated")

    async def close(self, request, credential):
        raise RuntimeError("Hyperliquid closing remains certification-gated")

    async def reconcile(self, account: str) -> dict[str, Any]:
        return {"venue": self.name, "account": account, "positions": await self.positions(account)}

    async def health(self) -> VenueHealth:
        try:
            response = await self.client.post("/info", json={"type": "meta"})
            response.raise_for_status()
            return VenueHealth(
                venue=self.name, healthy=True,
                live_submission_enabled=self.live_enabled,
                reason=None if self.live_enabled else "Public reads ready; signing certification gate is closed",
            )
        except Exception as exc:
            return VenueHealth(
                venue=self.name, healthy=False, live_submission_enabled=False,
                reason=str(exc)[:200],
            )


class UniswapTradingApiAdapter(VenueAdapter):
    name = "uniswap"

    def __init__(self, base_url: str, api_key: str, live_enabled: bool):
        self.client = httpx.AsyncClient(
            base_url=base_url, timeout=20,
            headers={"x-api-key": api_key, "Content-Type": "application/json", "x-universal-router-version": "2.0"},
        )
        self.live_enabled = live_enabled

    async def check_approval(self, request: dict[str, Any]) -> dict[str, Any]:
        response = await self.client.post("/check_approval", json=request)
        response.raise_for_status()
        return response.json()

    async def quote(self, request: dict[str, Any]) -> Quote:
        response = await self.client.post("/quote", json=request)
        response.raise_for_status()
        raw = response.json()
        quote = raw.get("quote", raw)
        from datetime import timedelta
        return Quote(
            venue=self.name, reference=str(raw.get("requestId") or raw.get("quoteId") or "uniswap"),
            market=f"{request.get('tokenIn')}/{request.get('tokenOut')}",
            input_amount=str(request.get("amount", "0")), output_amount=str(quote.get("output", {}).get("amount", "0")),
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=30), raw=raw,
        )

    @staticmethod
    def swap_body(quote_response: dict[str, Any], signature: str | None = None) -> dict[str, Any]:
        body = {key: value for key, value in quote_response.items()
                if key not in {"permitData", "permitTransaction", "moeazi"}}
        permit = quote_response.get("permitData")
        routing = str(quote_response.get("routing") or quote_response.get("quote", {}).get("routing") or "CLASSIC").upper()
        if routing in {"DUTCH_V2", "DUTCH_V3", "PRIORITY"}:
            if signature:
                body["signature"] = signature
        elif signature and isinstance(permit, dict):
            body["signature"], body["permitData"] = signature, permit
        return body

    async def build_swap(self, quote_response: dict[str, Any], signature: str | None = None) -> dict[str, Any]:
        response = await self.client.post("/swap", json=self.swap_body(quote_response, signature))
        response.raise_for_status()
        result = response.json()
        self.validate_transaction(result)
        return result

    @staticmethod
    def validate_transaction(result: dict[str, Any], expected_sender: str | None = None) -> None:
        tx = result.get("swap", result.get("transaction", result))
        if not isinstance(tx, dict): raise ValueError("Missing swap transaction")
        target, data = tx.get("to"), tx.get("data")
        if not isinstance(target, str) or not target.startswith("0x") or len(target) != 42:
            raise ValueError("Invalid transaction target")
        if not isinstance(data, str) or not data.startswith("0x") or len(data) <= 2:
            raise ValueError("Invalid transaction data")
        if int(tx.get("chainId", 42161)) != 42161:
            raise ValueError("Uniswap transaction must use Arbitrum mainnet")
        if expected_sender and str(tx.get("from", "")).lower() != expected_sender.lower():
            raise ValueError("Uniswap transaction sender does not match the strategy UA")
        value = tx.get("value", "0")
        if not isinstance(value, (str, int)):
            raise ValueError("Invalid transaction value")

    async def balance(self, account): raise NotImplementedError("Use chain RPC sidecar")
    async def positions(self, account): return []
    async def place(self, request, credential):
        if not self.live_enabled: raise RuntimeError("Uniswap broadcast circuit breaker is open")
        raise NotImplementedError("Signing and broadcast are delegated to the TypeScript sidecar")
    async def cancel(self, request, credential): raise NotImplementedError("AMM swaps cannot be cancelled after broadcast")
    async def close(self, request, credential): return await self.place(request, credential)
    async def reconcile(self, account): raise NotImplementedError("Use chain RPC sidecar")
    async def health(self): return VenueHealth(venue=self.name, healthy=True, live_submission_enabled=self.live_enabled)
