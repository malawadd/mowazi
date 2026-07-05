export const riskDemo = {
  strategyAccount: {
    status: "active",
    healthStatus: "degraded",
    emergencyStop: false,
    healthReason: "Gas reserve is below the preferred threshold, but the strategy remains runnable.",
  },
  latestSnapshot: {
    totalEquityUsd: 18243.11,
    lpValueUsd: 9110.22,
    hedgeValueUsd: 8989.27,
    netExposureUsd: 143.62,
  },
  alerts: [
    {
      _id: "alert-001",
      code: "gas_reserve_low",
      message: "Optimism gas reserve is below the preferred runway.",
      severity: "warning",
      detail: "Top up ETH before the worker needs multiple Uniswap-side transactions in a short window.",
    },
    {
      _id: "alert-002",
      code: "hedge_balance_gap",
      message: "HyperLiquid margin is healthy, but funding drift widened after the last rebalance.",
      severity: "info",
      detail: "The spread is still inside guardrails, yet it is worth watching before new LP inventory moves arrive.",
    },
  ],
  venueStates: [
    {
      _id: "venue-001",
      venueRole: "optimism_execution_wallet",
      status: "fresh",
      summary: "Live wallet balances and LP-side inventory were refreshed from Optimism.",
      syncedAt: 1777881783000,
    },
    {
      _id: "venue-002",
      venueRole: "hyperliquid_master_wallet",
      status: "fresh",
      summary: "Margin inventory and delegated account readiness were refreshed from HyperLiquid.",
      syncedAt: 1777881761000,
    },
    {
      _id: "venue-003",
      venueRole: "hyperliquid_agent_wallet",
      status: "warning",
      summary: "Agent account is approved, but no fresh hedge order has been recorded in the last polling interval.",
      syncedAt: 1777881744000,
    },
  ],
  incidents: [
    {
      _id: "incident-001",
      code: "sync_drift_watch",
      summary: "Balance drift widened temporarily after the last LP-side inventory update.",
      detail: "The system recovered without pausing, but the operator should confirm funding assumptions before larger rebalances.",
      severity: "warning",
      runbook: "Check deposits, confirm margin runway, then review the activity ledger for the latest worker actions.",
    },
  ],
} as const;
