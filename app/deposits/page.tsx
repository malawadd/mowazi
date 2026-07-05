"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import { useParticleSession } from "@/components/ParticleAuthProvider";
import ParticleFundingPanel from "@/components/ParticleFundingPanel";
import { EmptyState, Panel, StatusBadge } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";

type WalletAssetRow = {
  asset: string;
  purpose: string;
  label: string;
  balance: string;
  valueUsd: number;
  includedInStrategyEquity: boolean;
  lastObservedAt?: number | null;
  availableBalance: string;
  withdrawNote?: string | null;
};

type TransferRow = {
  id: string;
  asset: string;
  purpose: string;
  direction: string;
  amount: string;
  balanceAfter: string;
  valueUsd: number;
  observedAt: number;
  detail?: string | null;
};

type DepositRecordRow = {
  id: string;
  asset: string;
  status: string;
  amount?: string | null;
  detectedAmount?: string | null;
  observedBalance?: string | null;
  lastObservedAt?: number | null;
  confirmedAt?: number | null;
  notes?: string | null;
};

type DepositInstruction = {
  venueAccountId: string;
  role: string;
  venue: string;
  chainRef: string;
  walletAddress: string;
  status: string;
  lastSyncedAt?: number | null;
  lastSyncStatus?: string | null;
  lastSyncError?: string | null;
  walletAssets: WalletAssetRow[];
  strategyAssets: WalletAssetRow[];
  operationalAssets: WalletAssetRow[];
  recentTransfers: TransferRow[];
  depositRecords: DepositRecordRow[];
  totalWalletHoldingsUsd: number;
  strategyAssetValueUsd: number;
  gasReserveValueUsd: number;
  lowGasWarning?: {
    asset: string;
    currentBalance: string;
    message: string;
  } | null;
  note: string;
};

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function toneForDeposit(status: string) {
  if (status === "confirmed" || status === "credited") return "positive";
  if (status === "detected") return "warning";
  return "info";
}

function AssetSection({
  title,
  assets,
  workflowRecords,
}: {
  title: string;
  assets: WalletAssetRow[];
  workflowRecords: DepositRecordRow[];
}) {
  if (assets.length === 0) {
    return null;
  }

  return (
    <div className="stack-list">
      <h4>{title}</h4>
      {assets.map((asset) => {
        const workflow = workflowRecords.find((record) => record.asset === asset.asset);
        return (
          <article key={`${title}-${asset.asset}`} className="list-card">
            <div className="list-card-head">
              <div>
                <h4>
                  {asset.asset} · {asset.label}
                </h4>
                <p>
                  Balance: {asset.balance} · Value: {formatUsd(asset.valueUsd)}
                </p>
              </div>
              <StatusBadge tone={workflow ? toneForDeposit(workflow.status) : "info"}>
                {workflow?.status ?? "inventory"}
              </StatusBadge>
            </div>
            <p>
              Withdrawable now: {asset.availableBalance}
              {asset.withdrawNote ? ` · ${asset.withdrawNote}` : ""}
            </p>
            <p>
              {asset.lastObservedAt
                ? `Last observed ${new Date(asset.lastObservedAt).toLocaleString()}`
                : "No live wallet observation recorded yet."}
            </p>
          </article>
        );
      })}
    </div>
  );
}

export default function DepositsPage() {
  const { status } = useParticleSession();
  const isSignedIn = status === "authenticated";
  const instructions = useQuery(api.queries.getDepositInstructions, {});
  const refreshFundingState = useAction(api.publicActions.refreshFundingState);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const refreshManagedFundingState = async () => {
    const result = (await refreshFundingState({})) as {
      results?: Array<{ role: string; status: string }>;
    };
    const refreshed = result?.results?.filter((item) => item.status === "fresh").length ?? 0;
    setRefreshMessage(
      refreshed > 0
        ? `Manual sync complete. ${refreshed} funding wallet${refreshed === 1 ? "" : "s"} refreshed from live venue state.`
        : "Manual sync finished, but no funding wallet returned a fresh venue read.",
    );
  };

  return (
    <StrategyShell title="Deposits" subtitle="Live wallet inventory, funding rails, and gas reserve visibility">
      {!isSignedIn ? (
        <EmptyState
          title={status === "loading" ? "Loading Particle session..." : "Sign in to view managed deposit addresses."}
          body="Deposit instructions are tied to your managed strategy account."
        />
      ) : !instructions || instructions.length === 0 ? (
        <EmptyState
          title="No funding rails available yet."
          body="Provision a strategy account first and the deposit addresses will appear here."
        />
      ) : (
        <div className="stack-list">
          <Panel
            title="Manual refresh"
            description="If the external supervisor has not synced yet, use this button to read your managed funding wallets directly and write the balances into Moeazi."
            tone="orange"
            actions={
              <button
                className="secondary-button"
                disabled={refreshing}
                onClick={async () => {
                  setRefreshing(true);
                  setRefreshMessage(null);
                  try {
                    await refreshManagedFundingState();
                  } catch (error) {
                    setRefreshMessage(error instanceof Error ? error.message : String(error));
                  } finally {
                    setRefreshing(false);
                  }
                }}
              >
                {refreshing ? "Refreshing..." : "Refresh wallet balances"}
              </button>
            }
          >
            <div className="stack-list">
              <p className="muted-copy">
                This is the fallback path for accounts that have not been picked up by the live supervisor yet.
              </p>
              {refreshMessage ? <p>{refreshMessage}</p> : null}
            </div>
          </Panel>
          <ParticleFundingPanel
            instructions={instructions}
            onTransferComplete={async () => {
              try {
                await refreshManagedFundingState();
              } catch (error) {
                setRefreshMessage(error instanceof Error ? error.message : String(error));
              }
            }}
          />
          {instructions.map((instruction: DepositInstruction) => (
            <Panel
              key={instruction.venueAccountId}
              title={instruction.role.replaceAll("_", " ")}
              description={instruction.note}
              tone="mint"
            >
              <div className="stack-list">
                <div className="list-card-head">
                  <div>
                    <h4>{instruction.venue}</h4>
                    <p>{instruction.chainRef}</p>
                  </div>
                  <StatusBadge tone={instruction.status === "ready" ? "positive" : "warning"}>
                    {instruction.status}
                  </StatusBadge>
                </div>
                <p className="mono-label">{instruction.walletAddress}</p>
                <p>
                  Wallet holdings: {formatUsd(instruction.totalWalletHoldingsUsd)} · Strategy assets:{" "}
                  {formatUsd(instruction.strategyAssetValueUsd)} · Operational gas reserve:{" "}
                  {formatUsd(instruction.gasReserveValueUsd)}
                </p>
                <p>
                  Sync status: {instruction.lastSyncStatus ?? "never"} ·{" "}
                  {instruction.lastSyncedAt ? new Date(instruction.lastSyncedAt).toLocaleString() : "No sync yet"}
                </p>
                {instruction.lowGasWarning ? <p>{instruction.lowGasWarning.message}</p> : null}
                {instruction.lastSyncError ? <p>{instruction.lastSyncError}</p> : null}

                <AssetSection
                  title="Strategy assets"
                  assets={instruction.strategyAssets}
                  workflowRecords={instruction.depositRecords}
                />
                <AssetSection
                  title="Operational gas reserve"
                  assets={instruction.operationalAssets}
                  workflowRecords={instruction.depositRecords}
                />

                <div className="stack-list">
                  <h4>Recent landed transfers</h4>
                  {instruction.recentTransfers.length === 0 ? (
                    <p className="muted-copy">No observed balance changes yet for this wallet.</p>
                  ) : (
                    instruction.recentTransfers.map((transfer) => (
                      <article key={transfer.id} className="list-card">
                        <div className="list-card-head">
                          <div>
                            <h4>
                              {transfer.direction === "in" ? "+" : "-"}
                              {transfer.amount} {transfer.asset}
                            </h4>
                            <p>
                              {transfer.purpose === "gas" ? "Gas reserve" : "Strategy asset"} · Balance after:{" "}
                              {transfer.balanceAfter}
                            </p>
                          </div>
                          <StatusBadge tone={transfer.direction === "in" ? "positive" : "warning"}>
                            {transfer.direction === "in" ? "landed" : "outgoing"}
                          </StatusBadge>
                        </div>
                        <p>
                          {formatUsd(transfer.valueUsd)} · {new Date(transfer.observedAt).toLocaleString()}
                        </p>
                        {transfer.detail ? <p>{transfer.detail}</p> : null}
                      </article>
                    ))
                  )}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </StrategyShell>
  );
}
