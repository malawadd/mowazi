"use client";

import { useState } from "react";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import StrategyShell from "@/components/StrategyShell";
import { useParticleSession } from "@/components/ParticleConnectKitProvider";
import { DataRow, EmptyState, MetricCard, Panel, StatusBadge } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";

type VenueAccountRow = {
  id: string;
  role: string;
  accountRef: string;
  walletAddress: string;
  status: string;
  lastSyncedAt?: number | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  lastBalanceUsd?: number | null;
};

type LpPositionRow = {
  _id: string;
  token0: string;
  token1: string;
  poolAddress: string;
  status: string;
  liquidity: string;
};

type HedgePositionRow = {
  _id: string;
  symbol: string;
  entryPrice: number;
  side: string;
  size: string;
};

type WithdrawalRow = {
  _id: string;
  asset: string;
  amount: string;
  status: string;
};

type FundingAssetRow = {
  asset: string;
  label: string;
  purpose: string;
  balance: string;
  valueUsd: number;
};

type FundingAccountRow = {
  venueAccountId: string;
  role: string;
  totalWalletHoldingsUsd: number;
  strategyAssetValueUsd: number;
  gasReserveValueUsd: number;
  walletAssets: FundingAssetRow[];
  lowGasWarning?: {
    asset: string;
    currentBalance: string;
    message: string;
  } | null;
};

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function toneForStatus(status: string) {
  if (status === "active" || status === "ready") return "positive";
  if (status === "paused" || status === "approval_required") return "warning";
  if (status === "emergency_stopped" || status === "failed") return "danger";
  return "info";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function DashboardPage() {
  const { refreshSession, status } = useParticleSession();
  const convexAuth = useConvexAuth();
  const isSignedIn = status === "authenticated";
  const canUseConvex = isSignedIn && convexAuth.isAuthenticated;
  const dashboard = useQuery(api.queries.getStrategyDashboard, canUseConvex ? {} : "skip");
  const createStrategyAccount = useAction(api.publicActions.createStrategyAccount);
  const approveHyperliquidAgent = useAction(api.publicActions.approveHyperliquidAgent);
  const refreshFundingState = useAction(api.publicActions.refreshFundingState);
  const enableStrategy = useMutation(api.mutations.enableStrategy);
  const pauseStrategy = useMutation(api.mutations.pauseStrategy);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  if (status === "loading") {
    return (
      <main className="marketing-shell">
        <EmptyState title="Loading Particle session..." body="Checking your Moeazi account access." />
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="marketing-shell">
        <EmptyState
          title="Sign in to provision a managed strategy account."
          body="The strategy dashboard is only available after authentication."
          action={
            <Link className="primary-button" href="/sign-in">
              Sign in
            </Link>
          }
        />
      </main>
    );
  }

  if (!canUseConvex) {
    return (
      <StrategyShell title="Overview" subtitle="Managed strategy account health and execution state">
        <EmptyState
          title={convexAuth.isLoading ? "Connecting account data..." : "Reconnect your wallet session."}
          body={
            convexAuth.isLoading
              ? "Your Particle session is active. Moeazi is verifying the app data session."
              : "The app data session could not be verified. Sign out and sign back in to mint a fresh token."
          }
        />
      </StrategyShell>
    );
  }

  if (dashboard === undefined) {
    return (
      <StrategyShell title="Overview" subtitle="Managed strategy account health and execution state">
        <EmptyState title="Loading strategy dashboard..." body="Fetching your managed account state." />
      </StrategyShell>
    );
  }

  const provision = async () => {
    setBusyAction("provision");
    try {
      await refreshSession();
      try {
        await createStrategyAccount({ label: "LINK / USDC Delta Neutral" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!message.toLowerCase().includes("unauthorized")) {
          throw error;
        }
        await refreshSession();
        await wait(250);
        await createStrategyAccount({ label: "LINK / USDC Delta Neutral" });
      }
    } finally {
      setBusyAction(null);
    }
  };

  const approveAgent = async () => {
    setBusyAction("approve");
    try {
      await approveHyperliquidAgent({ agentName: "moeazi-agent" });
    } finally {
      setBusyAction(null);
    }
  };

  const startStrategy = async () => {
    setBusyAction("enable");
    try {
      await enableStrategy({});
    } finally {
      setBusyAction(null);
    }
  };

  const softPause = async () => {
    setBusyAction("pause");
    try {
      await pauseStrategy({ reason: "Paused from dashboard." });
    } finally {
      setBusyAction(null);
    }
  };

  const refreshBalances = async () => {
    setBusyAction("refresh");
    setRefreshMessage(null);
    try {
      const result = (await refreshFundingState({})) as {
        results?: Array<{ role: string; status: string }>;
      };
      const refreshed = result?.results?.filter((item) => item.status === "fresh").length ?? 0;
      setRefreshMessage(
        refreshed > 0
          ? `Manual sync complete. ${refreshed} funding wallet${refreshed === 1 ? "" : "s"} refreshed from live venue state.`
          : "Manual sync finished, but no funding wallet returned a fresh venue read.",
      );
    } catch (error) {
      setRefreshMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction(null);
    }
  };

  const strategyAccount = dashboard?.hasStrategyAccount ? dashboard.strategyAccount : null;
  const fundingAccounts = dashboard?.hasStrategyAccount ? dashboard.fundingAccounts ?? [] : [];
  const walletSummary = dashboard?.hasStrategyAccount ? dashboard.walletSummary : null;

  return (
    <StrategyShell title="Overview" subtitle="Managed strategy account health and execution state">
      {!dashboard?.hasStrategyAccount ? (
        <Panel title="Provisioning" description="Create the managed wallet set for Moeazi" tone="orange">
          <EmptyState
            title="No strategy account provisioned yet."
            body="Provisioning creates three managed wallets inside Convex: an Optimism execution wallet, a HyperLiquid master wallet, and a HyperLiquid agent wallet."
            action={
              <button
                className="primary-button"
                onClick={provision}
                disabled={busyAction === "provision" || convexAuth.isLoading || !convexAuth.isAuthenticated}
              >
                {busyAction === "provision"
                  ? "Provisioning..."
                  : convexAuth.isLoading
                    ? "Connecting auth..."
                    : "Create strategy account"}
              </button>
            }
          />
        </Panel>
      ) : (
        <>
          <section className="metric-grid">
            <MetricCard
              label="Strategy status"
              value={strategyAccount?.status?.replaceAll("_", " ") ?? "provisioning"}
              detail={dashboard.strategyType}
              tone="sky"
            />
            <MetricCard
              label="Total equity"
              value={formatUsd(dashboard.latestSnapshot?.totalEquityUsd)}
              detail="Strategy-only equity from the latest recorded snapshot"
              tone="paper"
            />
            <MetricCard
              label="Net exposure"
              value={formatUsd(dashboard.latestSnapshot?.netExposureUsd)}
              detail="Positive means long LINK delta"
              tone="orange"
            />
            <MetricCard
              label="Open alerts"
              value={String(dashboard.openAlerts.length)}
              detail="Critical alerts appear in the risk view"
              tone="paper"
            />
            <MetricCard
              label="Execution mode"
              value={dashboard.config?.executionMode ?? "live"}
              detail={strategyAccount?.healthStatus ?? "health unavailable"}
              tone="sky"
            />
            <MetricCard
              label="Wallet holdings"
              value={formatUsd(walletSummary?.totalWalletHoldingsUsd)}
              detail="Live holdings across funding wallets, including gas reserve"
              tone="paper"
            />
            <MetricCard
              label="Gas reserve"
              value={formatUsd(walletSummary?.gasReserveValueUsd)}
              detail={
                walletSummary?.lowGasWarnings?.length
                  ? `${walletSummary.lowGasWarnings.length} funding wallet needs more ETH`
                  : "Operational ETH reserve across tracked wallets"
              }
              tone="orange"
            />
          </section>

          <Panel
            title="Execution"
            description="Account state, venue readiness, and control actions"
            tone="sky"
            actions={
              <div className="inline-actions">
                <button className="secondary-button" onClick={refreshBalances} disabled={busyAction === "refresh"}>
                  {busyAction === "refresh" ? "Refreshing..." : "Refresh balances"}
                </button>
                <button className="secondary-button" onClick={softPause} disabled={busyAction === "pause"}>
                  Pause
                </button>
                <button className="primary-button" onClick={startStrategy} disabled={busyAction === "enable"}>
                  Enable
                </button>
              </div>
            }
          >
            <div className="two-column-grid">
              <div className="stack-list">
                {dashboard.venueAccounts.map((account: VenueAccountRow) => (
                  (() => {
                    const funding = fundingAccounts.find(
                      (item: FundingAccountRow) => item.venueAccountId === account.id,
                    );
                    return (
                      <article key={account.id} className="list-card">
                        <div className="list-card-head">
                          <div>
                            <h4>{account.role.replaceAll("_", " ")}</h4>
                            <p>{account.accountRef}</p>
                          </div>
                          <StatusBadge tone={toneForStatus(account.status)}>{account.status}</StatusBadge>
                        </div>
                        <p className="mono-label">{account.walletAddress}</p>
                        {funding ? (
                          <>
                            <p>
                              Wallet holdings: {formatUsd(funding.totalWalletHoldingsUsd)} · Strategy assets:{" "}
                              {formatUsd(funding.strategyAssetValueUsd)} · Gas reserve:{" "}
                              {formatUsd(funding.gasReserveValueUsd)}
                            </p>
                            <p>
                              {funding.walletAssets
                                .map((asset) => `${asset.asset} ${asset.balance}`)
                                .join(" · ")}
                            </p>
                            {funding.lowGasWarning ? <p>{funding.lowGasWarning.message}</p> : null}
                          </>
                        ) : null}
                      </article>
                    );
                  })()
                ))}
              </div>

              <div className="stack-list">
                <DataRow
                  label="HyperLiquid agent approval"
                  value={
                    <button
                      className="secondary-button"
                      onClick={approveAgent}
                      disabled={busyAction === "approve"}
                    >
                      {busyAction === "approve" ? "Approving..." : "Approve agent wallet"}
                    </button>
                  }
                />
                <DataRow
                  label="Last worker heartbeat"
                  value={strategyAccount?.lastHeartbeatAt ? new Date(strategyAccount.lastHeartbeatAt).toLocaleString() : "No worker heartbeat yet"}
                />
                <DataRow
                  label="Health reason"
                  value={strategyAccount?.healthReason ?? "Healthy enough for managed execution"}
                />
                <DataRow
                  label="Last reconciliation"
                  value={strategyAccount?.lastReconciledAt ? new Date(strategyAccount.lastReconciledAt).toLocaleString() : "No reconciliation yet"}
                />
                <DataRow
                  label="Last execution error"
                  value={strategyAccount?.lastError ?? "None"}
                />
                {refreshMessage ? <p>{refreshMessage}</p> : null}
              </div>
            </div>
          </Panel>

          <Panel title="Lifecycle" description="Recent venue sync and withdrawal state" tone="paper">
            <div className="two-column-grid">
              <div className="stack-list">
                {dashboard.venueAccounts.map((account: VenueAccountRow) => (
                  <article key={`${account.id}-sync`} className="list-card">
                    <div className="list-card-head">
                      <div>
                        <h4>{account.role.replaceAll("_", " ")}</h4>
                        <p>{account.lastSyncedAt ? new Date(account.lastSyncedAt).toLocaleString() : "Never synced"}</p>
                      </div>
                      <StatusBadge tone={account.lastSyncStatus === "fresh" ? "positive" : account.lastSyncStatus === "error" ? "danger" : "warning"}>
                        {account.lastSyncStatus ?? "never"}
                      </StatusBadge>
                    </div>
                    <p>{account.lastSyncError ?? "No sync error recorded."}</p>
                  </article>
                ))}
              </div>

              <div className="stack-list">
                {dashboard.recentWithdrawals.length === 0 ? (
                  <p className="muted-copy">No withdrawals in flight.</p>
                ) : (
                  dashboard.recentWithdrawals.slice(0, 4).map((withdrawal: WithdrawalRow) => (
                    <article key={withdrawal._id} className="list-card">
                      <div className="list-card-head">
                        <div>
                          <h4>{withdrawal.amount} {withdrawal.asset}</h4>
                          <p>Withdrawal pipeline</p>
                        </div>
                        <StatusBadge tone={toneForStatus(withdrawal.status)}>{withdrawal.status}</StatusBadge>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Live positions" description="Current LP and hedge state" tone="orange">
            <div className="two-column-grid">
              <div className="stack-list">
                <h4>LP positions</h4>
                {dashboard.openLpPositions.length === 0 ? (
                  <p className="muted-copy">No LP positions have been recorded yet.</p>
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
                    </article>
                  ))
                )}
              </div>

              <div className="stack-list">
                <h4>Hedge positions</h4>
                {dashboard.openHedgePositions.length === 0 ? (
                  <p className="muted-copy">No hedge positions have been recorded yet.</p>
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
                    </article>
                  ))
                )}
              </div>
            </div>
          </Panel>
        </>
      )}
    </StrategyShell>
  );
}
