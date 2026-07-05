"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import {
  DisclosureCard,
  EmptyState,
  MetricCard,
  Panel,
  StatusBadge,
} from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type VenueAccountId = Id<"venueAccounts">;
type WithdrawalId = Id<"withdrawals">;

type WalletAssetRow = {
  asset: string;
  purpose: string;
  label: string;
  balance: string;
  valueUsd: number;
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

type FundingAccount = {
  venueAccountId: VenueAccountId;
  role: string;
  venue: string;
  walletAddress: string;
  walletAssets: WalletAssetRow[];
  recentTransfers: TransferRow[];
  totalWalletHoldingsUsd: number;
  strategyAssetValueUsd: number;
  gasReserveValueUsd: number;
  lowGasWarning?: {
    asset: string;
    currentBalance: string;
    message: string;
  } | null;
};

type WithdrawalRow = {
  _id: WithdrawalId;
  venueAccountId?: VenueAccountId | null;
  venueRole?: string | null;
  asset: string;
  amount: string;
  destination: string;
  status: string;
  note?: string | null;
  feeEstimateUsd?: number | null;
  requestedAt: number;
};

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function toneForStatus(status: string) {
  if (status === "completed" || status === "queued") return "positive";
  if (
    status === "pending_checks" ||
    status === "confirming" ||
    status === "signing" ||
    status === "submitted"
  ) {
    return "warning";
  }
  if (status === "failed" || status === "cancelled" || status === "rejected") return "danger";
  return "info";
}

function AssetBucket({
  title,
  assets,
}: {
  title: string;
  assets: WalletAssetRow[];
}) {
  if (assets.length === 0) {
    return null;
  }

  return (
    <section className="inventory-section">
      <p className="subsection-label">{title}</p>
      <div className="stack-list">
        {assets.map((asset) => (
          <article key={`${title}-${asset.asset}`} className="inventory-row">
            <div className="list-card-head">
              <div>
                <h4>
                  {asset.asset} · {asset.label}
                </h4>
                <p>
                  Balance: {asset.balance} · Withdrawable: {asset.availableBalance}
                </p>
              </div>
              <StatusBadge tone={asset.purpose === "gas" ? "warning" : "info"}>
                {asset.purpose === "gas" ? "gas reserve" : "strategy asset"}
              </StatusBadge>
            </div>
            <p>Estimated value: {formatUsd(asset.valueUsd)}</p>
            {asset.withdrawNote ? <p>{asset.withdrawNote}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function TransferHistory({ account }: { account: FundingAccount }) {
  return (
    <DisclosureCard
      title="Transfer history"
      meta="Recent observed incoming and outgoing balance changes for this wallet."
      tone="paper"
      badge={
        <StatusBadge tone={account.recentTransfers.length === 0 ? "neutral" : "info"}>
          {account.recentTransfers.length === 0 ? "no transfers" : `${account.recentTransfers.length} items`}
        </StatusBadge>
      }
    >
      {account.recentTransfers.length === 0 ? (
        <p className="muted-copy">No observed incoming or outgoing transfers yet.</p>
      ) : (
        <div className="stack-list">
          {account.recentTransfers.map((transfer) => (
            <article key={transfer.id} className="inventory-row">
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
                  {transfer.direction === "in" ? "incoming" : "outgoing"}
                </StatusBadge>
              </div>
              <p>
                {formatUsd(transfer.valueUsd)} · {new Date(transfer.observedAt).toLocaleString()}
              </p>
              {transfer.detail ? <p>{transfer.detail}</p> : null}
            </article>
          ))}
        </div>
      )}
    </DisclosureCard>
  );
}

export default function WithdrawalsPage() {
  const withdrawalState = useQuery(api.queries.getWithdrawalStatus, {});
  const refreshFundingState = useAction(api.publicActions.refreshFundingState);
  const processWithdrawal = useAction(api.publicActions.processWithdrawal);
  const requestWithdrawal = useMutation(api.mutations.requestWithdrawal);
  const cancelWithdrawal = useMutation(api.mutations.cancelWithdrawal);
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<WithdrawalId | null>(null);
  const [cancellingId, setCancellingId] = useState<WithdrawalId | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    venueAccountId: "" as VenueAccountId | "",
    asset: "USDC",
    amount: "",
    destination: "",
    note: "",
  });

  const accountOptions = useMemo(
    () => withdrawalState?.fundingAccounts ?? [],
    [withdrawalState?.fundingAccounts],
  );

  useEffect(() => {
    if (!accountOptions.length || form.venueAccountId) return;
    const first = accountOptions[0];
    setForm((current) => ({
      ...current,
      venueAccountId: first.venueAccountId,
      asset: first.walletAssets[0]?.asset ?? "USDC",
    }));
  }, [accountOptions, form.venueAccountId]);

  const selectedAccount = accountOptions.find(
    (account: FundingAccount) => account.venueAccountId === form.venueAccountId,
  );
  const assetOptions = selectedAccount?.walletAssets ?? [];
  const selectedAsset = assetOptions.find((asset) => asset.asset === form.asset) ?? assetOptions[0];
  const requestedAmount = Number(form.amount || 0);
  const availableAmount = Number(selectedAsset?.availableBalance ?? 0);
  const amountTooHigh =
    form.amount.trim().length > 0 &&
    Number.isFinite(requestedAmount) &&
    Number.isFinite(availableAmount) &&
    requestedAmount > availableAmount;
  const totalWalletHoldingsUsd = accountOptions.reduce(
    (total: number, account: FundingAccount) => total + account.totalWalletHoldingsUsd,
    0,
  );
  const lowGasWalletCount = accountOptions.filter(
    (account: FundingAccount) => Boolean(account.lowGasWarning),
  ).length;

  if (withdrawalState === undefined) {
    return (
      <StrategyShell title="Withdrawals" subtitle="Wallet balances and settlement tracking">
        <EmptyState
          title="Loading withdrawals..."
          body="Fetching managed wallet balances and the recent withdrawal pipeline."
        />
      </StrategyShell>
    );
  }

  if (!withdrawalState.hasStrategyAccount) {
    return (
      <StrategyShell title="Withdrawals" subtitle="Wallet balances and settlement tracking">
        <EmptyState
          title="No managed strategy account yet."
          body="Provision the managed wallets before creating withdrawals."
        />
      </StrategyShell>
    );
  }

  return (
    <StrategyShell title="Withdrawals" subtitle="Wallet balances and settlement tracking">
      <section className="metric-grid">
        <MetricCard
          label="Funding wallets tracked"
          value={String(accountOptions.length)}
          detail="Live wallet inventories available to withdraw from"
          tone="mint"
        />
        <MetricCard
          label="Total wallet holdings"
          value={formatUsd(totalWalletHoldingsUsd)}
          detail="Combined live holdings across every funding wallet"
          tone="paper"
        />
        <MetricCard
          label="Low-gas wallets"
          value={String(lowGasWalletCount)}
          detail={
            lowGasWalletCount > 0
              ? "Operational ETH reserve needs attention before more onchain actions"
              : "Every tracked wallet currently has enough gas reserve"
          }
          tone="orange"
        />
        <MetricCard
          label="Recent withdrawals"
          value={String(withdrawalState.withdrawals.length)}
          detail="Most recent requests and settlement transitions across both rails"
          tone="paper"
        />
      </section>

      <Panel
        title="Manual refresh"
        description="Pull live venue balances into Moeazi when a funding wallet has changed before the supervisor catches up."
        tone="orange"
        actions={
          <button
            className="secondary-button"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              setRefreshMessage(null);
              try {
                const result = (await refreshFundingState({})) as {
                  results?: Array<{ role: string; status: string }>;
                };
                const refreshed =
                  result?.results?.filter((item) => item.status === "fresh").length ?? 0;
                setRefreshMessage(
                  refreshed > 0
                    ? `Manual sync complete. ${refreshed} funding wallet${refreshed === 1 ? "" : "s"} refreshed from live venue state.`
                    : "Manual sync finished, but no funding wallet returned a fresh venue read.",
                );
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
            This refresh path writes live venue balances into the withdrawal inventory without
            waiting for the external supervisor loop.
          </p>
          {refreshMessage ? (
            <div className="support-note">
              <p>{refreshMessage}</p>
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel
        title="Wallet inventory"
        description="Use these live tracked balances as the source of truth for what each funding wallet can currently send."
        tone="mint"
      >
        <div className="stack-list">
          {accountOptions.map((account: FundingAccount, index: number) => {
            const strategyAssets = account.walletAssets.filter((asset) => asset.purpose !== "gas");
            const gasAssets = account.walletAssets.filter((asset) => asset.purpose === "gas");

            return (
              <DisclosureCard
                key={account.venueAccountId}
                title={account.role.replaceAll("_", " ")}
                defaultOpen={index === 0}
                tone="mint"
                badge={
                  <StatusBadge tone={account.lowGasWarning ? "warning" : "positive"}>
                    {account.lowGasWarning ? "low gas" : "tracked"}
                  </StatusBadge>
                }
                meta={
                  <>
                    <p className="mono-label">{account.walletAddress}</p>
                    <p>
                      Wallet holdings: {formatUsd(account.totalWalletHoldingsUsd)} · Strategy
                      assets: {formatUsd(account.strategyAssetValueUsd)} · Gas reserve:{" "}
                      {formatUsd(account.gasReserveValueUsd)}
                    </p>
                    <p>{account.venue}</p>
                  </>
                }
              >
                {account.lowGasWarning ? (
                  <div className="support-note">
                    <p>{account.lowGasWarning.message}</p>
                  </div>
                ) : null}

                <div className="asset-bucket-grid">
                  <AssetBucket title="Strategy assets" assets={strategyAssets} />
                  <AssetBucket title="Gas reserve" assets={gasAssets} />
                </div>

                <TransferHistory account={account} />
              </DisclosureCard>
            );
          })}
        </div>
      </Panel>

      <div className="two-column-grid">
        <Panel
          title="Request withdrawal"
          description="Only assets supported by the selected funding wallet appear here, and the available amount comes from the live inventory above."
        tone="orange"
        >
          <form
            className="settings-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              setSubmitting(true);
              setSubmitMessage(null);
              try {
                const result = (await requestWithdrawal({
                  venueAccountId: (form.venueAccountId || undefined) as VenueAccountId | undefined,
                  asset: form.asset,
                  amount: form.amount,
                  destination: form.destination,
                  note: form.note || undefined,
                })) as { withdrawalId: WithdrawalId; status: string; duplicated?: boolean };
                if (result.status === "queued") {
                  await processWithdrawal({ withdrawalId: result.withdrawalId });
                  setSubmitMessage(
                    "Withdrawal sent to Moeazi execution immediately and wallet balances were refreshed.",
                  );
                } else {
                  setSubmitMessage(
                    `Withdrawal created with status ${result.status.replaceAll("_", " ")}.`,
                  );
                }
                setForm((current) => ({ ...current, amount: "", note: "" }));
              } catch (error) {
                setSubmitMessage(error instanceof Error ? error.message : String(error));
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <label className="field">
              <span>Funding venue</span>
              <select
                className="text-input"
                value={form.venueAccountId}
                onChange={(event) => {
                  const nextAccount = accountOptions.find(
                    (item: FundingAccount) => item.venueAccountId === event.target.value,
                  );
                  setForm((current) => ({
                    ...current,
                    venueAccountId: event.target.value as VenueAccountId,
                    asset: nextAccount?.walletAssets[0]?.asset ?? current.asset,
                  }));
                }}
              >
                {accountOptions.map((account: FundingAccount) => (
                  <option key={account.venueAccountId} value={account.venueAccountId}>
                    {account.role.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Asset</span>
              <select
                className="text-input"
                value={form.asset}
                onChange={(event) => setForm((current) => ({ ...current, asset: event.target.value }))}
              >
                {assetOptions.map((asset) => (
                  <option key={asset.asset} value={asset.asset}>
                    {asset.asset} - {asset.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Amount</span>
              <input
                className="text-input"
                value={form.amount}
                onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
                placeholder={selectedAsset?.availableBalance ?? "0"}
              />
            </label>

            <label className="field">
              <span>Destination</span>
              <input
                className="text-input"
                value={form.destination}
                onChange={(event) =>
                  setForm((current) => ({ ...current, destination: event.target.value }))
                }
                placeholder="0x..."
              />
            </label>

            <label className="field field-span-2">
              <span>Operator note</span>
              <textarea
                className="text-input textarea-input"
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                rows={4}
              />
            </label>

            <div className="support-note field-span-2">
              <p>
                Available now: {selectedAsset?.availableBalance ?? "0"} {selectedAsset?.asset ?? ""}
              </p>
              <p>
                Current wallet balance: {selectedAsset?.balance ?? "0"} {selectedAsset?.asset ?? ""}
              </p>
              {amountTooHigh ? <p>Requested amount is above the currently withdrawable balance.</p> : null}
              {selectedAsset?.withdrawNote ? <p>{selectedAsset.withdrawNote}</p> : null}
              {submitMessage ? <p>{submitMessage}</p> : null}
            </div>

            <div className="form-actions field-span-2">
              <button
                className="primary-button"
                type="submit"
                disabled={submitting || !form.venueAccountId || amountTooHigh}
              >
                {submitting ? "Submitting..." : "Send withdrawal"}
              </button>
            </div>
          </form>
        </Panel>

        <Panel
          title="Settlement notes"
          description="Read the withdrawal status ladder as short operational checkpoints instead of one giant black box."
        tone="paper"
        >
          <div className="stack-list">
            <div className="support-note">
              <p>`pending checks` means the request needs validation before it can be signed.</p>
            </div>
            <div className="support-note">
              <p>
                `queued` is now only a brief internal staging step before Moeazi immediately tries
                to process the withdrawal.
              </p>
            </div>
            <div className="support-note">
              <p>`signing`, `submitted`, and `confirming` mean the venue action is in flight.</p>
            </div>
            <div className="support-note">
              <p>
                Native ETH on Optimism is treated as an operational gas reserve, so the withdrawable
                amount can be slightly lower than the full balance.
              </p>
            </div>
            <div className="support-note">
              <p>
                Optimism withdrawals complete from transaction receipts. HyperLiquid withdrawals stay
                in confirming until the venue state settles.
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        title="Recent withdrawals"
        description="Review the latest settlement state transitions across both funding rails."
        tone="paper"
      >
        <div className="stack-list">
          {withdrawalState.withdrawals.length === 0 ? (
            <p className="muted-copy">No withdrawal requests yet.</p>
          ) : (
            withdrawalState.withdrawals.map((withdrawal: WithdrawalRow) => (
              <article key={withdrawal._id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h4>
                      {withdrawal.amount} {withdrawal.asset}
                    </h4>
                    <p>{withdrawal.venueRole?.replaceAll("_", " ") ?? "managed venue"}</p>
                  </div>
                  <StatusBadge tone={toneForStatus(withdrawal.status)}>{withdrawal.status}</StatusBadge>
                </div>
                <p className="mono-label">{withdrawal.destination}</p>
                <p>Fee estimate: {withdrawal.feeEstimateUsd ?? "N/A"} USD</p>
                <p>{withdrawal.note ?? "No operator note recorded."}</p>
                <p>{new Date(withdrawal.requestedAt).toLocaleString()}</p>
                {(withdrawal.status === "queued" ||
                  ["draft", "pending_checks", "queued", "failed"].includes(withdrawal.status)) && (
                  <div className="inventory-actions">
                    {withdrawal.status === "queued" ? (
                      <button
                        className="primary-button"
                        disabled={processingId === withdrawal._id}
                        onClick={async () => {
                          setProcessingId(withdrawal._id);
                          setSubmitMessage(null);
                          try {
                            await processWithdrawal({ withdrawalId: withdrawal._id });
                            setSubmitMessage(
                              "Queued withdrawal was processed immediately and wallet balances were refreshed.",
                            );
                          } catch (error) {
                            setSubmitMessage(error instanceof Error ? error.message : String(error));
                          } finally {
                            setProcessingId(null);
                          }
                        }}
                      >
                        {processingId === withdrawal._id ? "Processing..." : "Process now"}
                      </button>
                    ) : null}
                    {["draft", "pending_checks", "queued", "failed"].includes(withdrawal.status) ? (
                      <button
                        className="secondary-button"
                        disabled={cancellingId === withdrawal._id}
                        onClick={async () => {
                          setCancellingId(withdrawal._id);
                          try {
                            await cancelWithdrawal({ withdrawalId: withdrawal._id });
                          } finally {
                            setCancellingId(null);
                          }
                        }}
                      >
                        {cancellingId === withdrawal._id ? "Cancelling..." : "Cancel"}
                      </button>
                    ) : null}
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      </Panel>
    </StrategyShell>
  );
}
