"""External supervisor for multi-account managed execution."""

from __future__ import annotations

import json
import socket
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from convex_worker_client import ConvexWorkerClient
from hyperliquid_client import HyperLiquidClient
from managed_runtime import (
    BalanceSnapshot,
    RunnableAccount,
    SharedMarketSnapshot,
    build_health_update,
    compute_arb_trade,
    compute_hedge_trade,
    select_poll_interval,
    summarise_total_equity,
)
from uniswap_client import LINK_DECIMALS, USDC_DECIMALS, UniswapV3Client
import config


def _worker_id() -> str:
    return f"{socket.gethostname()}-supervisor"


class SharedMarketReader:
    def __init__(self):
        self.uni = UniswapV3Client()
        self.hl = HyperLiquidClient()

    def read(self) -> SharedMarketSnapshot:
        uni = self.uni.get_pool_price()
        hl = self.hl.get_mid_snapshot()
        return SharedMarketSnapshot(
            uniswap_price=float(uni["price"]),
            hyperliquid_price=float(hl["mid"]),
            pool_tick=int(uni["tick"]),
            pool_liquidity=float(uni["liquidity"]),
            captured_at_ms=int(hl["captured_at_ms"]),
            hl_source=str(hl["source"]),
        )

    def read_optimism_wallet(self, address: str, market: SharedMarketSnapshot) -> dict:
        state = self.uni.read_wallet_balances(address, market.uniswap_price)
        state["pool_tick"] = market.pool_tick
        state["pool_liquidity"] = market.pool_liquidity
        state["link_price_usd"] = market.uniswap_price
        return state

    def read_hyperliquid_account(self, address: str) -> dict:
        return self.hl.get_account_summary(address)


def _snapshot_payload(snapshot: BalanceSnapshot, strategy_account_id: str) -> dict:
    return {
        "strategyAccountId": strategy_account_id,
        "totalEquityUsd": snapshot.total_equity_usd,
        "lpValueUsd": snapshot.lp_value_usd,
        "hedgeValueUsd": snapshot.hedge_value_usd,
        "cashValueUsd": snapshot.cash_value_usd,
        "netExposureUsd": snapshot.net_exposure_usd,
        "accountBalances": snapshot.account_balances,
        "capturedBy": "convex_supervisor",
        "freshnessMs": snapshot.freshness_ms,
        "mode": snapshot.mode,
        "capturedAt": snapshot.captured_at,
    }


def _arb_payload(account: RunnableAccount, market: SharedMarketSnapshot, trade: dict) -> dict:
    if trade["direction"] == "buy_link_on_uniswap":
        amount_raw = str(int(trade["notional_usd"] * (10 ** USDC_DECIMALS)))
        return {
            "strategyAccountId": account.strategy_account_id,
            "tokenIn": config.USDC_ADDRESS,
            "tokenOut": config.LINK_ADDRESS,
            "amountInRaw": amount_raw,
            "notionalUsd": trade["notional_usd"],
        }

    link_amount = trade["notional_usd"] / max(market.uniswap_price, 0.000001)
    return {
        "strategyAccountId": account.strategy_account_id,
        "tokenIn": config.LINK_ADDRESS,
        "tokenOut": config.USDC_ADDRESS,
        "amountInRaw": str(int(link_amount * (10 ** LINK_DECIMALS))),
        "notionalUsd": trade["notional_usd"],
    }


def _combine_balances(
    optimism_state: dict,
    hyperliquid_state: Optional[dict],
) -> List[Dict[str, Any]]:
    balances = []
    for row in optimism_state.get("balances", []):
        balances.append({
            "venueRole": "optimism_execution_wallet",
            "asset": row["asset"],
            "amount": row["amount"],
            "valueUsd": row["valueUsd"],
            "purpose": row.get("purpose"),
            "includedInStrategyEquity": row.get("includedInStrategyEquity"),
        })

    if hyperliquid_state:
        balances.append({
            "venueRole": "hyperliquid_master_wallet",
            "asset": "USDC",
            "amount": f"{hyperliquid_state.get('account_value_usd', 0):.6f}",
            "valueUsd": round(float(hyperliquid_state.get("account_value_usd", 0)), 2),
            "purpose": "capital",
            "includedInStrategyEquity": True,
        })

    return balances


def _build_snapshot(
    account: RunnableAccount,
    market: SharedMarketSnapshot,
    optimism_state: dict,
    hyperliquid_state: Optional[dict],
    now_ms: int,
) -> BalanceSnapshot:
    lp_value_usd = account.latest_snapshot.lp_value_usd
    hedge_value_usd = float(hyperliquid_state.get("hedge_value_usd", 0)) if hyperliquid_state else 0.0
    cash_value_usd = float(optimism_state.get("strategy_value_usd", optimism_state.get("total_value_usd", 0)))
    if hyperliquid_state:
        cash_value_usd += float(hyperliquid_state.get("account_value_usd", 0))

    link_spot_value = 0.0
    for row in optimism_state.get("balances", []):
        if row["asset"] == "LINK":
            link_spot_value = float(row["valueUsd"])
            break

    hl_net_exposure = float(hyperliquid_state.get("net_exposure_usd", 0)) if hyperliquid_state else 0.0
    net_exposure_usd = round(link_spot_value + hl_net_exposure, 2)

    health = build_health_update(account, market, now_ms)
    mode = account.config.execution_mode if health["status"] == "ready" else "degraded"
    total_equity_usd = summarise_total_equity(lp_value_usd, 0, cash_value_usd)

    return BalanceSnapshot(
        total_equity_usd=total_equity_usd,
        lp_value_usd=lp_value_usd,
        hedge_value_usd=hedge_value_usd,
        cash_value_usd=round(cash_value_usd, 2),
        net_exposure_usd=net_exposure_usd,
        account_balances=_combine_balances(optimism_state, hyperliquid_state),
        captured_at=now_ms,
        freshness_ms=max(0, now_ms - market.captured_at_ms),
        mode=mode,
    )


def _sync_venue_state(
    worker: ConvexWorkerClient,
    account: RunnableAccount,
    venue_role: str,
    sync_kind: str,
    status: str,
    summary: str,
    data: dict,
    total_value_usd: float,
    balances: Optional[List[Dict[str, Any]]] = None,
):
    venue = account.venue_by_role(venue_role)
    if not venue:
        return
    worker.call(
        "syncVenueState",
        {
            "strategyAccountId": account.strategy_account_id,
            "venueAccountId": venue.id,
            "syncKind": sync_kind,
            "status": status,
            "summary": summary,
            "dataJson": json.dumps(data),
            "error": None if status != "error" else summary,
            "totalValueUsd": total_value_usd,
            "balances": balances or [],
        },
    )


def _update_strategy_health(
    worker: ConvexWorkerClient,
    account: RunnableAccount,
    health: Dict[str, str],
    now_ms: int,
):
    worker.call(
        "updateStrategyState",
        {
            "strategyAccountId": account.strategy_account_id,
            "lastHeartbeatAt": now_ms,
            "lastReconciledAt": now_ms,
            "healthStatus": health["status"],
            "healthReason": health["reason"],
            "healthUpdatedAt": now_ms,
        },
    )

    if account.health_status != health["status"]:
        severity = "warning" if health["status"] in {"degraded", "withdrawal_blocked"} else "info"
        worker.call(
            "recordIncident",
            {
                "strategyAccountId": account.strategy_account_id,
                "severity": severity,
                "code": f"HEALTH_{health['status'].upper()}",
                "summary": "Strategy health state changed.",
                "detail": health["reason"],
                "runbook": "Inspect venue sync freshness, withdrawals, and market data freshness before re-enabling live execution.",
                "status": "open",
            },
        )


def _process_pending_withdrawals(worker: ConvexWorkerClient, account: RunnableAccount):
    for request in account.pending_withdrawals:
        if request.status == "queued":
            worker.call(
                "startWithdrawal",
                {
                    "strategyAccountId": account.strategy_account_id,
                    "withdrawalId": request.id,
                },
            )
        elif request.status == "pending_checks":
            worker.call(
                "recordIncident",
                {
                    "strategyAccountId": account.strategy_account_id,
                    "severity": "warning",
                    "code": "WITHDRAWAL_PENDING_CHECKS",
                    "summary": "Withdrawal remains blocked by preflight checks.",
                    "detail": request.note or request.destination,
                    "runbook": "Review the withdrawal destination, cooldown window, and venue funding state.",
                    "status": "open",
                },
            )


def run():
    worker = ConvexWorkerClient()
    markets = SharedMarketReader()
    holder_id = _worker_id()

    print("=" * 72)
    print(" Managed Moeazi Supervisor")
    print(f" Started: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f" Worker:  {holder_id}")
    print("=" * 72)

    while True:
        try:
            raw_accounts = worker.call("listRunnableAccounts", {"includeReady": False})
            accounts = [RunnableAccount.from_convex(item) for item in raw_accounts]
            poll_interval = select_poll_interval(accounts, fallback=2)

            if not accounts:
                time.sleep(poll_interval)
                continue

            market = markets.read()

            for account in accounts:
                lease = worker.call(
                    "acquireExecutionLease",
                    {
                        "strategyAccountId": account.strategy_account_id,
                        "holderId": holder_id,
                    },
                )
                if not lease.get("acquired"):
                    continue

                try:
                    now_ms = int(time.time() * 1000)
                    optimism_account = account.venue_by_role("optimism_execution_wallet")
                    hl_master_account = account.venue_by_role("hyperliquid_master_wallet")

                    optimism_state = (
                        markets.read_optimism_wallet(optimism_account.wallet_address, market)
                        if optimism_account
                        else {"balances": [], "total_value_usd": 0}
                    )
                    hyperliquid_state = (
                        markets.read_hyperliquid_account(hl_master_account.wallet_address)
                        if hl_master_account
                        else None
                    )

                    _sync_venue_state(
                        worker,
                        account,
                        "optimism_execution_wallet",
                        "balance",
                        "fresh",
                        "Optimism execution wallet balances synchronized.",
                        optimism_state,
                        float(optimism_state.get("total_value_usd", 0)),
                        optimism_state.get("balances"),
                    )
                    if hyperliquid_state is not None:
                        _sync_venue_state(
                            worker,
                            account,
                            "hyperliquid_master_wallet",
                            "hedge_state",
                            "fresh",
                            "HyperLiquid account state synchronized.",
                            hyperliquid_state,
                            float(hyperliquid_state.get("account_value_usd", 0)),
                            [
                                {
                                    "asset": "USDC",
                                    "amount": f"{hyperliquid_state.get('account_value_usd', 0):.6f}",
                                    "valueUsd": round(float(hyperliquid_state.get("account_value_usd", 0)), 2),
                                }
                            ],
                        )

                    snapshot = _build_snapshot(account, market, optimism_state, hyperliquid_state, now_ms)
                    health = build_health_update(account, market, now_ms)

                    worker.call("recordSnapshot", _snapshot_payload(snapshot, account.strategy_account_id))
                    worker.call(
                        "heartbeatExecutionLease",
                        {
                            "strategyAccountId": account.strategy_account_id,
                            "holderId": holder_id,
                        },
                    )
                    _update_strategy_health(worker, account, health, now_ms)
                    _process_pending_withdrawals(worker, account)

                    if health["status"] != "ready":
                        continue

                    arb_trade = compute_arb_trade(account, market, now_ms)
                    if arb_trade:
                        worker.call("executeUniPoolSwap", _arb_payload(account, market, arb_trade))

                    hedge_trade = compute_hedge_trade(account, market, snapshot.net_exposure_usd)
                    if hedge_trade:
                        worker.call(
                            "executeHLOrder",
                            {
                                "strategyAccountId": account.strategy_account_id,
                                "isBuy": hedge_trade["is_buy"],
                                "sizeUsd": hedge_trade["size_usd"],
                                "coin": "LINK",
                            },
                        )
                except Exception as exc:
                    worker.call(
                        "recordAlert",
                        {
                            "strategyAccountId": account.strategy_account_id,
                            "severity": "warning",
                            "code": "SUPERVISOR_ERROR",
                            "message": "Managed supervisor iteration failed.",
                            "detail": str(exc),
                        },
                    )
                finally:
                    worker.call(
                        "releaseExecutionLease",
                        {
                            "strategyAccountId": account.strategy_account_id,
                            "holderId": holder_id,
                        },
                    )

            time.sleep(poll_interval)

        except KeyboardInterrupt:
            print("\nSupervisor stopped.")
            break
        except Exception as exc:
            payload = {"error": str(exc), "time": datetime.now(timezone.utc).isoformat()}
            print(f"[Supervisor Error] {json.dumps(payload)}")
            time.sleep(5)


if __name__ == "__main__":
    run()
