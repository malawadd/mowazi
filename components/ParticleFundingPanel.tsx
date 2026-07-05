"use client";

import { useMemo, useState } from "react";
import { CHAIN_ID, ZeroAddress } from "@particle-network/universal-account-sdk";
import { useUniversalAccount } from "@/hooks/useUniversalAccount";
import { DataRow, EmptyState, Panel, StatusBadge } from "@/components/strategy-ui";

type WalletAssetRow = {
  asset: string;
  label: string;
  purpose: string;
};

type DepositInstruction = {
  venueAccountId: string;
  role: string;
  venue: string;
  walletAddress: string;
  strategyAssets: WalletAssetRow[];
  operationalAssets: WalletAssetRow[];
};

type FundingTarget = {
  id: string;
  label: string;
  role: string;
  venue: string;
  receiver: string;
  token: {
    chainId: number;
    address: string;
  };
};

const OPTIMISM_USDC = "0x0b2c639c533813f4aa9d7837caf62653d097ff85";
const ARBITRUM_USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";

function tokenForTarget(role: string, asset: string) {
  if (role === "optimism_execution_wallet" && asset === "USDC") {
    return { chainId: CHAIN_ID.OPTIMISM_MAINNET, address: OPTIMISM_USDC };
  }
  if (role === "optimism_execution_wallet" && asset === "ETH") {
    return { chainId: CHAIN_ID.OPTIMISM_MAINNET, address: ZeroAddress };
  }
  if (role === "hyperliquid_master_wallet" && asset === "USDC") {
    return { chainId: CHAIN_ID.ARBITRUM_MAINNET_ONE, address: ARBITRUM_USDC };
  }
  return null;
}

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

export default function ParticleFundingPanel({
  instructions,
  onTransferComplete,
}: {
  instructions: DepositInstruction[];
  onTransferComplete: () => Promise<void>;
}) {
  const {
    ownerAddress,
    accountInfo,
    primaryAssets,
    loading,
    error,
    refresh,
    createTransfer,
    signAndSend,
  } = useUniversalAccount();
  const [targetId, setTargetId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const targets = useMemo(() => {
    const rows: FundingTarget[] = [];
    for (const instruction of instructions) {
      for (const asset of [...instruction.strategyAssets, ...instruction.operationalAssets]) {
        const token = tokenForTarget(instruction.role, asset.asset);
        if (!token) continue;
        rows.push({
          id: `${instruction.venueAccountId}:${asset.asset}`,
          label: `${instruction.role.replaceAll("_", " ")} - ${asset.asset}`,
          role: instruction.role,
          venue: instruction.venue,
          receiver: instruction.walletAddress,
          token,
        });
      }
    }
    return rows;
  }, [instructions]);

  const selectedTarget = targets.find((target) => target.id === targetId) ?? targets[0] ?? null;

  const sendTransfer = async () => {
    if (!selectedTarget || !amount) return;
    setBusy(true);
    setMessage(null);
    try {
      const transaction = await createTransfer({
        token: selectedTarget.token,
        amount,
        receiver: selectedTarget.receiver,
      });
      const result = await signAndSend(transaction);
      await refresh();
      await onTransferComplete();
      setMessage(`Transfer submitted. UniversalX activity ID: ${result.transactionId}`);
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Particle Universal Account"
      description="Use your unified balance to fund Moeazi managed wallets."
      tone="sky"
      actions={
        <button className="secondary-button" type="button" disabled={loading} onClick={refresh}>
          {loading ? "Refreshing..." : "Refresh UA"}
        </button>
      }
    >
      {!ownerAddress ? (
        <EmptyState title="Particle wallet not ready." body="Reconnect with Particle to load your Universal Account." />
      ) : (
        <div className="stack-list">
          <div className="two-column-grid">
            <div className="stack-list">
              <DataRow label="Owner EOA" value={<span className="mono-label">{ownerAddress}</span>} />
              <DataRow
                label="EVM UA"
                value={<span className="mono-label">{accountInfo?.evmSmartAccount || "Loading..."}</span>}
              />
              <DataRow
                label="Solana UA"
                value={<span className="mono-label">{accountInfo?.solanaSmartAccount || "Loading..."}</span>}
              />
            </div>
            <div className="stack-list">
              <DataRow label="Unified balance" value={formatUsd(primaryAssets?.totalAmountInUSD)} />
              <StatusBadge tone={targets.length > 0 ? "positive" : "warning"}>
                {targets.length > 0 ? `${targets.length} funding rails` : "no supported rails"}
              </StatusBadge>
              {error ? <p className="muted-copy">{error}</p> : null}
            </div>
          </div>

          <div className="settings-grid">
            <label className="field-label">
              Funding target
              <select
                className="field-input"
                value={selectedTarget?.id ?? ""}
                onChange={(event) => setTargetId(event.target.value)}
              >
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Amount
              <input
                className="field-input"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                inputMode="decimal"
              />
            </label>
          </div>

          <div className="inline-actions">
            <button
              className="primary-button"
              type="button"
              disabled={busy || !selectedTarget || !amount}
              onClick={sendTransfer}
            >
              {busy ? "Sending..." : "Send from UA"}
            </button>
          </div>
          {message ? <p className="muted-copy">{message}</p> : null}
        </div>
      )}
    </Panel>
  );
}
