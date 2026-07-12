"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import {
  useEoaDepositBalances,
  type EoaDepositBalance,
  type EoaDepositPreview,
} from "@/hooks/useEoaDepositBalances";
import { DataRow, EmptyState, Panel, StatusBadge } from "@/components/strategy-ui";

type Props = {
  receiverAddress: string | null | undefined;
  recipientLabel: string;
  paymentLinkSlug?: string;
  title?: string;
  description?: string;
  modeLabel?: string;
  submittedMessage?: string;
  onSubmitted?: () => Promise<void> | void;
};

function shortAddress(value: string | null | undefined) {
  if (!value) return "Not ready";
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function safeDetails(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function amountNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function ConnectedWalletDepositPanel({
  receiverAddress,
  recipientLabel,
  paymentLinkSlug,
  title = "From connected wallet",
  description = "Deposit supported Particle primary assets directly from an EOA wallet.",
  modeLabel = "EOA direct",
  submittedMessage,
  onSubmitted,
}: Props) {
  const {
    address,
    isConnected,
    balances,
    depositableBalances,
    scannedCount,
    loading,
    error,
    connect,
    refresh,
    getMaxDepositAmount,
    previewDeposit,
    sendDeposit,
  } = useEoaDepositBalances();
  const createIntent = useMutation(api.payments.createPaymentIntent);
  const markPreviewed = useMutation(api.payments.markPaymentIntentPreviewed);
  const markSubmitted = useMutation(api.payments.markPaymentIntentSubmitted);
  const markFailed = useMutation(api.payments.markPaymentIntentFailed);
  const [tokenId, setTokenId] = useState("");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<EoaDepositPreview | null>(null);
  const [intentId, setIntentId] = useState<Id<"paymentIntents"> | null>(null);
  const [busy, setBusy] = useState<"connect" | "refresh" | "max" | "preview" | "send" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selectableBalances = depositableBalances.length > 0 ? depositableBalances : balances;
  const selectedToken = useMemo(() => {
    return selectableBalances.find((item) => item.id === tokenId) ?? selectableBalances[0] ?? null;
  }, [selectableBalances, tokenId]);

  useEffect(() => {
    if (!tokenId && selectableBalances[0]) {
      setTokenId(selectableBalances[0].id);
    }
  }, [selectableBalances, tokenId]);

  const resetPreview = () => {
    setPreview(null);
    setIntentId(null);
    setMessage(null);
  };

  const refreshBalances = async () => {
    setBusy("refresh");
    setMessage(null);
    try {
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  const setMaxAmount = async () => {
    if (!selectedToken || !receiverAddress) return;
    setBusy("max");
    setMessage(null);
    try {
      const max = await getMaxDepositAmount(selectedToken, receiverAddress);
      setAmount(max.amount);
      resetPreview();
      setMessage(max.note);
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(null);
    }
  };

  const previewTransfer = async () => {
    if (!receiverAddress || !selectedToken || !address) return;
    setBusy("preview");
    setMessage(null);
    let workingIntentId = intentId;
    try {
      const nextPreview = await previewDeposit(selectedToken, amount, receiverAddress);
      if (paymentLinkSlug && !workingIntentId) {
        const intent = await createIntent({
          slug: paymentLinkSlug,
          paymentFlow: "eoa_direct",
          payerAddress: address,
          targetChainId: selectedToken.chainId,
          targetTokenAddress: selectedToken.address,
          targetTokenSymbol: selectedToken.symbol,
          sourceChainId: selectedToken.chainId,
          sourceTokenAddress: selectedToken.address,
          sourceTokenSymbol: selectedToken.symbol,
          sourceTokenDecimals: selectedToken.realDecimals,
          sourceAmount: amount,
          receiver: receiverAddress,
          receiverKind: "evm",
          amount,
        });
        if (!intent) throw new Error("Could not create a payment intent.");
        workingIntentId = intent._id;
      }
      if (workingIntentId) {
        await markPreviewed({
          paymentIntentId: workingIntentId,
          detailsJson: safeDetails({
            flow: "eoa_direct",
            receiver: receiverAddress,
            token: selectedToken,
            amount,
            gasEstimate: nextPreview.gasEstimate,
          }),
        });
      }
      setIntentId(workingIntentId);
      setPreview(nextPreview);
      setMessage("Transfer preview is ready.");
    } catch (nextError) {
      const errorMessage = nextError instanceof Error ? nextError.message : String(nextError);
      if (workingIntentId) {
        await markFailed({ paymentIntentId: workingIntentId, errorMessage }).catch(() => undefined);
      }
      setMessage(errorMessage);
    } finally {
      setBusy(null);
    }
  };

  const sendTransfer = async () => {
    if (!preview) return;
    setBusy("send");
    setMessage(null);
    try {
      const txHash = await sendDeposit(preview);
      if (intentId) {
        await markSubmitted({
          paymentIntentId: intentId,
          txHash,
          detailsJson: safeDetails({ flow: "eoa_direct", txHash, preview }),
        });
      }
      await onSubmitted?.();
      setMessage(submittedMessage ?? `Transfer submitted: ${shortAddress(txHash)}`);
    } catch (nextError) {
      const errorMessage = nextError instanceof Error ? nextError.message : String(nextError);
      if (intentId) {
        await markFailed({ paymentIntentId: intentId, errorMessage }).catch(() => undefined);
      }
      setMessage(errorMessage);
    } finally {
      setBusy(null);
    }
  };

  const canPreview = Boolean(
    isConnected &&
      receiverAddress &&
      selectedToken &&
      selectedToken.hasBalance &&
      amountNumber(amount) > 0 &&
      busy === null,
  );

  return (
    <Panel title={title} description={description} tone="mint">
      <div className="stack-list">
        <div className="two-column-grid">
          <DataRow label="Connected wallet" value={address ? shortAddress(address) : "Not connected"} />
          <DataRow label="Recipient" value={recipientLabel} />
          <DataRow label="Receiver" value={shortAddress(receiverAddress)} />
          <DataRow
            label="Supported balances"
            value={`${depositableBalances.length} detected / ${scannedCount || balances.length} scanned`}
          />
          <DataRow label="Mode" value={<StatusBadge tone="info">{modeLabel}</StatusBadge>} />
        </div>

        {!isConnected ? (
          <EmptyState
            title="Connect a wallet to scan balances."
            body="Moeazi scans Particle primary EVM assets only."
            action={
              <button className="primary-button" type="button" disabled={busy !== null} onClick={connect}>
                Connect wallet
              </button>
            }
          />
        ) : (
          <>
            <div className="settings-grid">
              <label className="field-label">
                Asset
                <select
                  className="field-input"
                  value={selectedToken?.id ?? ""}
                  onChange={(event) => {
                    setTokenId(event.target.value);
                    resetPreview();
                  }}
                >
                  {selectableBalances.map((balance: EoaDepositBalance) => (
                    <option key={balance.id} value={balance.id}>
                      {balance.symbol} on {balance.chainName} - {balance.formattedBalance}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Amount
                <input
                  className="field-input"
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    resetPreview();
                  }}
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </label>
            </div>

            <div className="inline-actions">
              <button className="secondary-button" type="button" disabled={busy !== null} onClick={refreshBalances}>
                {busy === "refresh" || loading ? "Scanning..." : "Refresh balances"}
              </button>
              <button
                className="secondary-button"
                type="button"
                disabled={!selectedToken || busy !== null}
                onClick={setMaxAmount}
              >
                {busy === "max" ? "Checking..." : "Max"}
              </button>
              <button className="primary-button" type="button" disabled={!canPreview} onClick={previewTransfer}>
                {busy === "preview" ? "Previewing..." : "Preview transfer"}
              </button>
              <button
                className="primary-button"
                type="button"
                disabled={!preview || busy !== null}
                onClick={sendTransfer}
              >
                {busy === "send" ? "Sending..." : "Send"}
              </button>
            </div>
          </>
        )}

        {preview ? <p className="muted-copy">Estimated gas: {preview.gasEstimate} units.</p> : null}
        {depositableBalances.length === 0 && isConnected && !loading ? (
          <p className="muted-copy">No supported Particle primary EVM balances were detected in this wallet.</p>
        ) : null}
        {error ? <p className="muted-copy">{error}</p> : null}
        {message ? <p className="muted-copy">{message}</p> : null}
      </div>
    </Panel>
  );
}
