"use client";

import { useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import { EmptyState, Panel, StatusBadge } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";

type LpPositionRow = {
  _id: string;
  token0: string;
  token1: string;
  poolAddress: string;
  status: string;
  liquidity: string;
  lowerTick: number;
  upperTick: number;
  currentTick?: number | null;
  rangeStatus?: string | null;
};

type HedgePositionRow = {
  _id: string;
  symbol: string;
  entryPrice: number;
  side: string;
  size: string;
  unrealizedPnlUsd?: number | null;
};

export default function PositionsPage() {
  const dashboard = useQuery(api.queries.getStrategyDashboard, {});

  if (!dashboard?.hasStrategyAccount) {
    return (
      <StrategyShell title="Positions" subtitle="LP and hedge inventory across managed venues">
        <EmptyState
          title="No positions to display yet."
          body="Provision the strategy account and fund the wallets to start recording LP and hedge state."
        />
      </StrategyShell>
    );
  }

  return (
    <StrategyShell title="Positions" subtitle="LP and hedge inventory across managed venues">
      <div className="two-column-grid">
        <Panel title="LP book" description="Open Uniswap position records" tone="lilac">
          <div className="stack-list">
            {dashboard.openLpPositions.length === 0 ? (
              <p className="muted-copy">No LP positions have been recorded.</p>
            ) : (
              dashboard.openLpPositions.map((position: LpPositionRow) => (
                <article key={position._id} className="list-card">
                  <div className="list-card-head">
                    <div>
                      <h4>{position.token0} / {position.token1}</h4>
                      <p>{position.poolAddress}</p>
                    </div>
                    <StatusBadge tone="info">{position.status}</StatusBadge>
                  </div>
                  <p>Liquidity: {position.liquidity}</p>
                  <p>Ticks: {position.lowerTick} to {position.upperTick}</p>
                  <p>
                    Current tick: {position.currentTick ?? "N/A"} · Range: {position.rangeStatus ?? "unknown"}
                  </p>
                </article>
              ))
            )}
          </div>
        </Panel>

        <Panel title="Hedge book" description="Open HyperLiquid hedge records" tone="paper">
          <div className="stack-list">
            {dashboard.openHedgePositions.length === 0 ? (
              <p className="muted-copy">No hedge positions have been recorded.</p>
            ) : (
              dashboard.openHedgePositions.map((position: HedgePositionRow) => (
                <article key={position._id} className="list-card">
                  <div className="list-card-head">
                    <div>
                      <h4>{position.symbol}</h4>
                      <p>Entry {position.entryPrice}</p>
                    </div>
                    <StatusBadge tone={position.side === "short" ? "warning" : "positive"}>
                      {position.side}
                    </StatusBadge>
                  </div>
                  <p>Size: {position.size}</p>
                  <p>Unrealized PnL: {position.unrealizedPnlUsd ?? 0}</p>
                </article>
              ))
            )}
          </div>
        </Panel>
      </div>
    </StrategyShell>
  );
}
