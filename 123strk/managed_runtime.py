"""Managed multi-account runtime for the Convex-controlled Moeazi worker."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import config


@dataclass
class StrategyConfig:
    arb_threshold_bps: float
    hedge_threshold_usd: float
    min_arb_trade_usd: float
    max_arb_trade_usd: float
    poll_interval_seconds: int
    max_daily_drawdown_pct: float
    max_slippage_bps: float
    execution_mode: str
    max_single_action_usd: float
    max_daily_volume_usd: float
    rebalance_cooldown_seconds: int
    hedge_twap_threshold_usd: float
    min_liquidity_usd: float
    max_market_data_age_ms: int
    max_position_drift_usd: float
    withdraw_cooldown_seconds: int


@dataclass
class BalanceSnapshot:
    total_equity_usd: float
    lp_value_usd: float
    hedge_value_usd: float
    cash_value_usd: float
    net_exposure_usd: float
    account_balances: List[Dict[str, Any]]
    captured_at: int = 0
    freshness_ms: int = 0
    mode: str = "live"


@dataclass
class VenueAccountState:
    id: str
    role: str
    venue: str
    wallet_address: str
    status: str
    last_synced_at: Optional[int]
    last_sync_status: Optional[str]
    last_balance_usd: float


@dataclass
class WithdrawalRequest:
    id: str
    venue_account_id: Optional[str]
    asset: str
    amount: str
    destination: str
    status: str
    note: Optional[str]


@dataclass
class RunnableAccount:
    strategy_account_id: str
    status: str
    health_status: str
    health_reason: Optional[str]
    config: StrategyConfig
    latest_snapshot: BalanceSnapshot
    venue_accounts: List[VenueAccountState]
    pending_withdrawals: List[WithdrawalRequest]
    recent_executions: List[Dict[str, Any]]

    @classmethod
    def from_convex(cls, payload: Dict[str, Any]) -> "RunnableAccount":
        config_payload = payload.get("config") or {}
        snapshot_payload = payload.get("latestSnapshot") or {}

        return cls(
            strategy_account_id=payload["strategyAccountId"],
            status=payload["status"],
            health_status=payload.get("healthStatus") or "bootstrapping",
            health_reason=payload.get("healthReason"),
            config=StrategyConfig(
                arb_threshold_bps=float(config_payload.get("arbThresholdBps", 5)),
                hedge_threshold_usd=float(config_payload.get("hedgeThresholdUsd", 10)),
                min_arb_trade_usd=float(config_payload.get("minArbTradeUsd", 1)),
                max_arb_trade_usd=float(config_payload.get("maxArbTradeUsd", 5)),
                poll_interval_seconds=int(config_payload.get("pollIntervalSeconds", 2)),
                max_daily_drawdown_pct=float(config_payload.get("maxDailyDrawdownPct", 8)),
                max_slippage_bps=float(config_payload.get("maxSlippageBps", 250)),
                execution_mode=str(config_payload.get("executionMode", "live")),
                max_single_action_usd=float(config_payload.get("maxSingleActionUsd", 25)),
                max_daily_volume_usd=float(config_payload.get("maxDailyVolumeUsd", 250)),
                rebalance_cooldown_seconds=int(config_payload.get("rebalanceCooldownSeconds", 45)),
                hedge_twap_threshold_usd=float(config_payload.get("hedgeTwapThresholdUsd", 100)),
                min_liquidity_usd=float(config_payload.get("minLiquidityUsd", 5000)),
                max_market_data_age_ms=int(config_payload.get("maxMarketDataAgeMs", config.MARKET_DATA_STALE_MS)),
                max_position_drift_usd=float(config_payload.get("maxPositionDriftUsd", 25)),
                withdraw_cooldown_seconds=int(config_payload.get("withdrawCooldownSeconds", 120)),
            ),
            latest_snapshot=BalanceSnapshot(
                total_equity_usd=float(snapshot_payload.get("totalEquityUsd", 0)),
                lp_value_usd=float(snapshot_payload.get("lpValueUsd", 0)),
                hedge_value_usd=float(snapshot_payload.get("hedgeValueUsd", 0)),
                cash_value_usd=float(snapshot_payload.get("cashValueUsd", 0)),
                net_exposure_usd=float(snapshot_payload.get("netExposureUsd", 0)),
                account_balances=list(snapshot_payload.get("accountBalances", [])),
                captured_at=int(snapshot_payload.get("capturedAt", 0) or 0),
                freshness_ms=int(snapshot_payload.get("freshnessMs", 0) or 0),
                mode=str(snapshot_payload.get("mode", "live")),
            ),
            venue_accounts=[
                VenueAccountState(
                    id=item["_id"],
                    role=item["role"],
                    venue=item["venue"],
                    wallet_address=item["walletAddress"],
                    status=item["status"],
                    last_synced_at=item.get("lastSyncedAt"),
                    last_sync_status=item.get("lastSyncStatus"),
                    last_balance_usd=float(item.get("lastBalanceUsd") or 0),
                )
                for item in payload.get("venueAccounts", [])
            ],
            pending_withdrawals=[
                WithdrawalRequest(
                    id=item["_id"],
                    venue_account_id=item.get("venueAccountId"),
                    asset=item["asset"],
                    amount=item["amount"],
                    destination=item["destination"],
                    status=item["status"],
                    note=item.get("note"),
                )
                for item in payload.get("pendingWithdrawals", [])
            ],
            recent_executions=list(payload.get("recentExecutions", [])),
        )

    def venue_by_role(self, role: str) -> Optional[VenueAccountState]:
        for account in self.venue_accounts:
            if account.role == role:
                return account
        return None


@dataclass
class SharedMarketSnapshot:
    uniswap_price: float
    hyperliquid_price: float
    pool_tick: int
    pool_liquidity: float
    captured_at_ms: int
    hl_source: str

    @property
    def spread_bps(self) -> float:
        if self.uniswap_price <= 0:
            return 0
        return ((self.hyperliquid_price - self.uniswap_price) / self.uniswap_price) * 10_000


def select_poll_interval(accounts: List[RunnableAccount], fallback: int = 2) -> int:
    if not accounts:
        return fallback
    return max(1, min(account.config.poll_interval_seconds for account in accounts))


def classify_regime(account: RunnableAccount, market: SharedMarketSnapshot) -> str:
    if market.captured_at_ms <= 0:
        return "stressed"
    if market.pool_liquidity < account.config.min_liquidity_usd:
        return "stressed"
    if abs(market.spread_bps) >= account.config.arb_threshold_bps * 4:
        return "stressed"
    if abs(market.spread_bps) <= max(account.config.arb_threshold_bps * 0.75, 2):
        return "quiet"
    return "normal"


def build_health_update(account: RunnableAccount, market: SharedMarketSnapshot, now_ms: int) -> Dict[str, str]:
    if account.status in {"paused", "emergency_stopped"}:
        return {"status": "paused", "reason": account.health_reason or "Strategy is paused."}
    if any(withdrawal.status == "pending_checks" for withdrawal in account.pending_withdrawals):
        return {"status": "withdrawal_blocked", "reason": "A withdrawal is waiting on preflight checks."}
    if market.captured_at_ms <= 0 or now_ms - market.captured_at_ms > account.config.max_market_data_age_ms:
        return {"status": "degraded", "reason": "Market data is stale."}
    if market.pool_liquidity < account.config.min_liquidity_usd:
        return {"status": "degraded", "reason": "Uniswap liquidity is below the configured floor."}
    if account.latest_snapshot.total_equity_usd <= 0:
        return {"status": "bootstrapping", "reason": "Waiting for first funded balance snapshot."}
    return {"status": "ready", "reason": f"{classify_regime(account, market).title()} regime with fresh venue state."}


def compute_arb_trade(account: RunnableAccount, market: SharedMarketSnapshot, now_ms: int) -> Optional[Dict[str, Any]]:
    if account.status != "active":
        return None
    if now_ms - market.captured_at_ms > account.config.max_market_data_age_ms:
        return None
    if market.pool_liquidity < account.config.min_liquidity_usd:
        return None

    spread_bps = market.spread_bps
    regime = classify_regime(account, market)
    threshold_multiplier = 1.0 if regime == "normal" else 1.5 if regime == "quiet" else 2.25
    effective_threshold = account.config.arb_threshold_bps * threshold_multiplier

    if abs(spread_bps) < effective_threshold:
        return None

    notional_cap = min(account.config.max_arb_trade_usd, account.config.max_single_action_usd)
    size_scale = min(abs(spread_bps) / max(effective_threshold, 1), 3)
    notional_usd = min(
        notional_cap,
        max(account.config.min_arb_trade_usd, account.config.min_arb_trade_usd * size_scale),
    )
    if regime == "stressed":
        notional_usd = min(notional_usd, account.config.min_arb_trade_usd * 1.5)

    direction = "buy_link_on_uniswap" if spread_bps > 0 else "sell_link_on_uniswap"
    return {
        "direction": direction,
        "notional_usd": round(notional_usd, 2),
        "spread_bps": spread_bps,
        "regime": regime,
    }


def compute_hedge_trade(account: RunnableAccount, market: SharedMarketSnapshot, observed_net_exposure_usd: float) -> Optional[Dict[str, Any]]:
    if account.status != "active":
        return None

    regime = classify_regime(account, market)
    threshold_multiplier = 1.0 if regime == "normal" else 1.35 if regime == "quiet" else 1.75
    effective_threshold = account.config.hedge_threshold_usd * threshold_multiplier
    if abs(observed_net_exposure_usd) < effective_threshold:
        return None

    size_usd = min(abs(observed_net_exposure_usd), account.config.max_single_action_usd)
    if regime == "stressed":
        size_usd = min(size_usd, account.config.hedge_twap_threshold_usd)
    size_usd = max(size_usd, 10)

    return {
        "is_buy": observed_net_exposure_usd < 0,
        "size_usd": round(size_usd, 2),
        "net_exposure_usd": observed_net_exposure_usd,
        "regime": regime,
        "shadow": account.config.execution_mode == "shadow",
    }


def summarise_total_equity(lp_value_usd: float, hedge_value_usd: float, cash_value_usd: float) -> float:
    return round(lp_value_usd + hedge_value_usd + cash_value_usd, 2)
