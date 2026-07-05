"use client";

import { useMemo, useState } from "react";
import { useUniversalAccount } from "@/hooks/useUniversalAccount";
import {
  buildStrategyFundingTargets,
  type DepositInstructionForFunding,
} from "@/lib/strategyFundingTargets";
import { DataRow, EmptyState, Panel, StatusBadge } from "@/components/strategy-ui";

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function StrategyFundingTransferPanel({
  instructions,
  onTransferComplete,
  title = "Move UA funds to strategy",
  description = "Use your unified Particle balance to fund Moeazi managed wallets.",
}: {
  instructions: DepositInstructionForFunding[];
  onTransferComplete: () => Promise<void>;
  title?: string;
  description?: string;
}) {
  const { ownerAddress, accountInfo, primaryAssets, loading, error, refresh, createTransfer, signAndSend } =
    useUniversalAccount();
  const [targetId, setTargetId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const targets = useMemo(() => buildStrategyFundingTargets(instructions), [instructions]);
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
      title={title}
      description={description}
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
                {targets.length > 0 ? `${targets.length} strategy rails` : "no supported rails"}
              </StatusBadge>
              {error ? <p className="muted-copy">{error}</p> : null}
            </div>
          </div>

          {targets.length === 0 ? (
            <p className="muted-copy">Provision a strategy account before moving funds into strategy wallets.</p>
          ) : (
            <>
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
                  {busy ? "Sending..." : "Send to strategy"}
                </button>
              </div>
            </>
          )}
          {message ? <p className="muted-copy">{message}</p> : null}
        </div>
      )}
    </Panel>
  );
}
