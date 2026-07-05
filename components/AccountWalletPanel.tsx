"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { useUniversalAccount } from "@/hooks/useUniversalAccount";
import { api } from "@/convex/_generated/api";
import { DataRow, EmptyState, Panel, StatusBadge } from "@/components/strategy-ui";

type SavedAccountWallet = {
  ownerAddress: string;
  evmUaAddress: string;
  solanaUaAddress: string;
  unifiedBalanceUsd: number;
  assetsJson: string;
  lastRefreshedAt: number;
} | null;

type PrimaryAssetRow = {
  tokenType: string;
  amount: string | number;
  amountInUSD: string | number;
};

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function shortAddress(value: string | null | undefined) {
  if (!value) return "Not ready";
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

async function copyToClipboard(value: string | null | undefined) {
  if (!value || typeof navigator === "undefined") return;
  await navigator.clipboard.writeText(value);
}

function safeParseAssets(savedWallet: SavedAccountWallet) {
  if (!savedWallet?.assetsJson) return [];
  try {
    const parsed = JSON.parse(savedWallet.assetsJson);
    return Array.isArray(parsed?.assets) ? parsed.assets : [];
  } catch {
    return [];
  }
}

export default function AccountWalletPanel({ savedWallet }: { savedWallet: SavedAccountWallet }) {
  const { ownerAddress, accountInfo, primaryAssets, loading, error, refresh } = useUniversalAccount();
  const syncWallet = useMutation(api.accountWallets.syncViewerAccountWallet);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const assetRows = useMemo(() => primaryAssets?.assets ?? safeParseAssets(savedWallet), [primaryAssets, savedWallet]);
  const evmUaAddress = accountInfo?.evmSmartAccount || savedWallet?.evmUaAddress || "";
  const solanaUaAddress = accountInfo?.solanaSmartAccount || savedWallet?.solanaUaAddress || "";
  const currentBalance = primaryAssets?.totalAmountInUSD ?? savedWallet?.unifiedBalanceUsd ?? null;

  const syncSnapshot = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const fresh = (await refresh()) ?? {
        accountInfo,
        primaryAssets,
      };
      if (!ownerAddress || !fresh.accountInfo?.evmSmartAccount || !fresh.accountInfo?.solanaSmartAccount) {
        throw new Error("Universal Account addresses are not ready yet.");
      }

      await syncWallet({
        ownerAddress,
        evmUaAddress: fresh.accountInfo.evmSmartAccount,
        solanaUaAddress: fresh.accountInfo.solanaSmartAccount,
        unifiedBalanceUsd: fresh.primaryAssets?.totalAmountInUSD ?? 0,
        assetsJson: JSON.stringify(fresh.primaryAssets ?? { assets: [], totalAmountInUSD: 0 }),
      });
      setMessage("Account wallet synced to Moeazi.");
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Panel
      title="Particle account wallet"
      description="Receive funds into your Universal Account, then move them into Moeazi strategy wallets when ready."
      tone="sky"
      actions={
        <button className="secondary-button" type="button" disabled={loading} onClick={refresh}>
          {loading ? "Refreshing..." : "Refresh UA"}
        </button>
      }
    >
      {!ownerAddress && !savedWallet ? (
        <EmptyState title="Particle wallet not ready." body="Reconnect with Particle to load your account wallet." />
      ) : (
        <div className="stack-list">
          <div className="two-column-grid">
            <div className="stack-list">
              <DataRow label="Owner EOA" value={<span className="mono-label">{ownerAddress ?? savedWallet?.ownerAddress}</span>} />
              <DataRow label="Unified balance" value={formatUsd(currentBalance)} />
              <DataRow
                label="Last synced"
                value={
                  savedWallet?.lastRefreshedAt
                    ? new Date(savedWallet.lastRefreshedAt).toLocaleString()
                    : "Not synced"
                }
              />
            </div>
            <div className="stack-list">
              <StatusBadge tone={evmUaAddress && solanaUaAddress ? "positive" : "warning"}>
                {evmUaAddress && solanaUaAddress ? "ready to receive" : "loading addresses"}
              </StatusBadge>
              {error ? <p className="muted-copy">{error}</p> : null}
              {message ? <p className="muted-copy">{message}</p> : null}
            </div>
          </div>

          <div className="two-column-grid">
            <article className="list-card">
              <div className="list-card-head">
                <div>
                  <h4>EVM deposits</h4>
                  <p>Send EVM primary assets to this Universal Account address.</p>
                </div>
                <button className="secondary-button" type="button" onClick={() => copyToClipboard(evmUaAddress)}>
                  Copy
                </button>
              </div>
              <p className="mono-label">{shortAddress(evmUaAddress)}</p>
            </article>
            <article className="list-card">
              <div className="list-card-head">
                <div>
                  <h4>Solana deposits</h4>
                  <p>Send Solana primary assets to this Universal Account address.</p>
                </div>
                <button className="secondary-button" type="button" onClick={() => copyToClipboard(solanaUaAddress)}>
                  Copy
                </button>
              </div>
              <p className="mono-label">{shortAddress(solanaUaAddress)}</p>
            </article>
          </div>

          <div className="stack-list">
            <h4>Primary assets</h4>
            {assetRows.length === 0 ? (
              <p className="muted-copy">No Particle primary asset balances were returned yet.</p>
            ) : (
              assetRows.map((asset: PrimaryAssetRow) => (
                <article key={asset.tokenType} className="list-card">
                  <div className="list-card-head">
                    <div>
                      <h4>{String(asset.tokenType).toUpperCase()}</h4>
                      <p>{asset.amount} across supported chains</p>
                    </div>
                    <StatusBadge tone="info">{formatUsd(Number(asset.amountInUSD ?? 0))}</StatusBadge>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className="inline-actions">
            <button className="primary-button" type="button" disabled={syncing} onClick={syncSnapshot}>
              {syncing ? "Syncing..." : "Sync account wallet"}
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
