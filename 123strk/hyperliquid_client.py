"""HyperLiquid client for market data, account reads, and lightweight runtime summaries."""

from __future__ import annotations

import json
import threading
import time
from typing import Any, Dict, Optional

import requests

import config

try:
    import websocket  # type: ignore
except ImportError:  # pragma: no cover - optional runtime dependency
    websocket = None


class HyperLiquidMidFeed:
    def __init__(self, coin: str, ws_url: str):
        self.coin = coin
        self.ws_url = ws_url
        self.latest_mid: Optional[float] = None
        self.last_message_ms = 0
        self._thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

    def start(self) -> bool:
        if websocket is None:
            return False
        if self._thread and self._thread.is_alive():
            return True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        return True

    def _run(self) -> None:  # pragma: no cover - network loop
        while True:
            ws = None
            try:
                ws = websocket.create_connection(self.ws_url, timeout=10)
                ws.send(json.dumps({"method": "subscribe", "subscription": {"type": "allMids"}}))
                while True:
                    raw = ws.recv()
                    payload = json.loads(raw)
                    if payload.get("channel") != "allMids":
                        continue

                    data = payload.get("data") or {}
                    mids = data.get("mids") if isinstance(data, dict) else None
                    if not mids and isinstance(data, dict) and self.coin in data:
                        mids = data
                    if not mids or self.coin not in mids:
                        continue

                    with self._lock:
                        self.latest_mid = float(mids[self.coin])
                        self.last_message_ms = int(time.time() * 1000)
            except Exception:
                time.sleep(2)
            finally:
                if ws is not None:
                    try:
                        ws.close()
                    except Exception:
                        pass

    def snapshot(self) -> Optional[Dict[str, Any]]:
        with self._lock:
          if self.latest_mid is None:
              return None
          return {
              "mid": self.latest_mid,
              "captured_at_ms": self.last_message_ms,
              "source": "websocket",
          }


class HyperLiquidClient:
    def __init__(self):
        self.info_url = f"{config.HL_API_URL}/info"
        self.coin = "LINK"
        self._meta = None
        self.mid_feed = HyperLiquidMidFeed(self.coin, config.HL_WS_URL) if config.HL_USE_WEBSOCKET else None
        if self.mid_feed:
            self.mid_feed.start()

    def _post_info(self, payload: dict) -> dict:
        resp = requests.post(self.info_url, json=payload, timeout=5)
        resp.raise_for_status()
        return resp.json()

    def get_meta(self) -> dict:
        """Fetch exchange metadata (asset list, size decimals, etc.)."""
        if self._meta:
            return self._meta
        self._meta = self._post_info({"type": "meta"})
        return self._meta

    def get_asset_index(self) -> int:
        """Get LINK's asset index in the HL universe."""
        meta = self.get_meta()
        for i, asset in enumerate(meta["universe"]):
            if asset["name"] == self.coin:
                return i
        raise ValueError(f"{self.coin} not found in HyperLiquid universe")

    def get_size_decimals(self) -> int:
        """Get the size precision for LINK (e.g. 0 = whole numbers, 1 = 0.1 increments)."""
        meta = self.get_meta()
        for asset in meta["universe"]:
            if asset["name"] == self.coin:
                return asset["szDecimals"]
        return 0

    def get_mid_snapshot(self) -> dict:
        """Get LINK mid price from the websocket feed when fresh, otherwise fallback to HTTP."""
        now_ms = int(time.time() * 1000)
        if self.mid_feed:
            feed_snapshot = self.mid_feed.snapshot()
            if feed_snapshot and now_ms - feed_snapshot["captured_at_ms"] <= config.MARKET_DATA_STALE_MS:
                return feed_snapshot

        data = self._post_info({"type": "allMids"})
        if self.coin not in data:
            raise ValueError(f"No mid price found for {self.coin}")
        return {
            "mid": float(data[self.coin]),
            "captured_at_ms": now_ms,
            "source": "http",
        }

    def get_mid_price(self) -> float:
        return self.get_mid_snapshot()["mid"]

    def get_best_bid_ask(self) -> dict:
        """Get best bid/ask from L2 book (top of book only)."""
        data = self._post_info({"type": "l2Book", "coin": self.coin})
        levels = data["levels"]

        best_bid = float(levels[0][0]["px"]) if levels[0] else 0
        best_ask = float(levels[1][0]["px"]) if levels[1] else 0
        mid = (best_bid + best_ask) / 2 if best_bid and best_ask else 0
        spread = best_ask - best_bid
        spread_pct = (spread / mid * 100) if mid else 0

        return {
            "best_bid": best_bid,
            "best_ask": best_ask,
            "mid": mid,
            "spread": spread,
            "spread_pct": spread_pct,
        }

    def get_fees(self) -> dict:
        """Get trading fees for the configured wallet, or return defaults."""
        if config.HL_WALLET_ADDRESS:
            try:
                data = self._post_info({
                    "type": "userFees",
                    "user": config.HL_WALLET_ADDRESS,
                })
                return {
                    "taker": float(data.get("takerRate", "0.00045")),
                    "maker": float(data.get("makerRate", "0.00015")),
                }
            except Exception:
                pass

        return {"taker": 0.00045, "maker": 0.00015}

    def get_fill_price(self, size_usd: float, is_buy: bool) -> dict:
        """Get the price you'd fill at for a given trade size."""
        bba = self.get_best_bid_ask()
        fill_price = bba["best_ask"] if is_buy else bba["best_bid"]

        sz_decimals = self.get_size_decimals()
        size_link = round(size_usd / fill_price, sz_decimals) if fill_price > 0 else 0

        feasible = size_usd >= 10 and size_link > 0

        return {
            "fill_price": fill_price,
            "size_link": size_link,
            "feasible": feasible,
        }

    def get_user_state(self, address: str) -> dict:
        return self._post_info({"type": "clearinghouseState", "user": address})

    def get_open_orders(self, address: str) -> dict:
        return self._post_info({"type": "openOrders", "user": address})

    def get_rate_limits(self, address: str) -> dict:
        return self._post_info({"type": "userRateLimit", "user": address})

    def get_portfolio(self, address: str) -> dict:
        return self._post_info({"type": "portfolio", "user": address})

    def get_account_summary(self, address: str) -> dict:
        state = self.get_user_state(address)
        orders = self.get_open_orders(address)
        limits = self.get_rate_limits(address)

        margin_summary = state.get("marginSummary") or state.get("crossMarginSummary") or {}
        withdrawable = state.get("withdrawable") or margin_summary.get("withdrawable") or "0"
        asset_positions = state.get("assetPositions") or []
        positions = []
        hedge_value_usd = 0.0
        net_exposure_usd = 0.0
        link_mid = self.get_mid_price()

        for raw_position in asset_positions:
            position = raw_position.get("position") if isinstance(raw_position, dict) else None
            position = position or raw_position
            coin = position.get("coin") or position.get("name") or ""
            size = float(position.get("szi") or 0)
            entry_price = float(position.get("entryPx") or 0)
            mark_price = float(position.get("markPx") or link_mid)
            position_value = float(position.get("positionValue") or size * mark_price)
            unrealized = float(position.get("unrealizedPnl") or 0)
            hedge_value_usd += abs(position_value)
            if coin.upper() == self.coin:
                net_exposure_usd += size * mark_price

            positions.append({
                "coin": coin,
                "size": size,
                "entry_price": entry_price,
                "mark_price": mark_price,
                "position_value_usd": position_value,
                "unrealized_pnl_usd": unrealized,
            })

        return {
            "account_value_usd": float(margin_summary.get("accountValue") or 0),
            "withdrawable_usd": float(withdrawable),
            "maintenance_margin_usd": float(margin_summary.get("totalMarginUsed") or 0),
            "hedge_value_usd": hedge_value_usd,
            "net_exposure_usd": net_exposure_usd,
            "positions": positions,
            "open_orders": orders if isinstance(orders, list) else orders.get("orders", []),
            "rate_limits": limits,
            "raw_state": state,
        }
