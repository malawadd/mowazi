"use client";

import { useMemo, useState } from "react";
import type { PaymentAccountAssetOption } from "@/lib/paymentAccountAssets";

type Props = {
  address?: string | null;
  amount: string;
  busy: "connect" | "preview" | "send" | null;
  canPreview: boolean;
  hasPreview: boolean;
  selectedTokenId: string;
  tokenOptions: PaymentAccountAssetOption[];
  walletReady: boolean;
  maxAmountHint?: string | null;
  onAmountChange: (value: string) => void;
  onMaxAmount: () => void;
  onPreview: () => void;
  onRefresh: () => void;
  onSend: () => void;
  onStartFunding: () => void;
  onTokenChange: (value: string) => void;
};

export default function PaymentSettlementForm({
  address,
  amount,
  busy,
  canPreview,
  hasPreview,
  selectedTokenId,
  tokenOptions,
  walletReady,
  maxAmountHint,
  onAmountChange,
  onMaxAmount,
  onPreview,
  onRefresh,
  onSend,
  onStartFunding,
  onTokenChange,
}: Props) {
  const [showAllAssets, setShowAllAssets] = useState(false);
  const fundedOptions = useMemo(() => tokenOptions.filter((option) => option.hasBalance), [tokenOptions]);
  const visibleOptions = showAllAssets ? tokenOptions : fundedOptions;
  const selectedOption = tokenOptions.find((option) => option.id === selectedTokenId) ?? fundedOptions[0] ?? null;

  return (
    <>
      <div className="asset-picker">
        <div className="asset-picker-head">
          <div>
            <p className="field-label-text">Available payment account balances</p>
            <p className="muted-copy">Particle can source supported funds from this account and settle USDC on Arbitrum.</p>
          </div>
          <button
            className="secondary-button compact-button"
            type="button"
            onClick={() => setShowAllAssets((value) => !value)}
          >
            {showAllAssets ? "Hide empty" : "Show all"}
          </button>
        </div>

        {visibleOptions.length === 0 ? (
          <p className="muted-copy">No supported funds were found in this payment account yet.</p>
        ) : (
          <div className="asset-option-list">
            {visibleOptions.map((option) => (
              <button
                aria-pressed={selectedOption?.id === option.id}
                className="asset-option-button"
                disabled={!option.hasBalance}
                key={option.id}
                type="button"
                onClick={() => onTokenChange(option.id)}
              >
                <span>
                  <strong>{option.symbol}</strong>
                  <span>{option.chainName}</span>
                </span>
                <span>
                  <strong>{option.formattedAmount}</strong>
                  <span>{option.hasBalance ? option.formattedUsd : "No balance"}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="settings-grid">
        <label className="field-label">
          USDC amount to send
          <div className="amount-input-row">
            <input
              className="field-input"
              value={amount}
              onChange={(event) => onAmountChange(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
            />
            <button className="secondary-button compact-button" type="button" disabled={!selectedOption?.hasBalance} onClick={onMaxAmount}>
              Max
            </button>
          </div>
          <span className="field-hint">{maxAmountHint ?? "Recipient receives USDC on Arbitrum."}</span>
        </label>
      </div>

      <div className="inline-actions">
        <button className="secondary-button" type="button" disabled={busy !== null} onClick={onRefresh}>
          {busy === "connect" ? "Connecting..." : address ? "Refresh balance" : "Connect wallet"}
        </button>
        <button className="secondary-button" type="button" disabled={busy !== null} onClick={onStartFunding}>
          Add funds
        </button>
        <button className="primary-button" type="button" disabled={!walletReady || !canPreview || busy !== null} onClick={onPreview}>
          {busy === "preview" ? "Previewing..." : "Preview payment"}
        </button>
        <button className="primary-button" type="button" disabled={!hasPreview || busy !== null} onClick={onSend}>
          {busy === "send" ? "Sending..." : "Send payment"}
        </button>
      </div>
    </>
  );
}
