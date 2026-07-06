"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useModal } from "@particle-network/connectkit";
import type { ITransaction } from "@particle-network/universal-account-sdk";
import { useMutation } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useUniversalAccount } from "@/hooks/useUniversalAccount";
import {
  getPaymentTokenOptions,
  getReceiverForPaymentToken,
  type PaymentTokenOption,
} from "@/lib/particlePaymentTokens";
import { DataRow, Panel, StatusBadge } from "@/components/strategy-ui";

type PublicPaymentLink = {
  slug: string;
  strategyLabel: string;
  recipientName: string;
  evmUaAddress: string | null;
  solanaUaAddress: string | null;
  walletReady: boolean;
};

type RuntimeTransactionDetails = {
  transactionId?: string;
  tokenChanges?: unknown;
  transactionFees?: unknown;
};

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function safeDetails(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

export default function UniversalAccountTransferPanel({ paymentLink }: { paymentLink: PublicPaymentLink }) {
  const tokenOptions = useMemo(() => getPaymentTokenOptions(), []);
  const { address, isConnected, status: connectionStatus } = useAccount();
  const { setOpen } = useModal();
  const { primaryAssets, refresh, createTransfer, signAndSend } =
    useUniversalAccount("eip7702-if-supported");
  const createIntent = useMutation(api.payments.createPaymentIntent);
  const markPreviewed = useMutation(api.payments.markPaymentIntentPreviewed);
  const markSubmitted = useMutation(api.payments.markPaymentIntentSubmitted);
  const markFailed = useMutation(api.payments.markPaymentIntentFailed);
  const [tokenId, setTokenId] = useState("");
  const [amount, setAmount] = useState("");
  const [intentId, setIntentId] = useState<Id<"paymentIntents"> | null>(null);
  const [preview, setPreview] = useState<ITransaction | null>(null);
  const [busy, setBusy] = useState<"connect" | "preview" | "send" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const connectTriggered = useRef(false);

  const selectedToken = tokenOptions.find((option) => option.id === tokenId) ?? tokenOptions[0] ?? null;

  const resetPreview = () => {
    setIntentId(null);
    setPreview(null);
    setMessage(null);
  };

  useEffect(() => {
    if (isConnected && address && connectTriggered.current) {
      connectTriggered.current = false;
      setBusy(null);
      void refresh();
    }
  }, [isConnected, address, refresh]);

  const connectPayer = () => {
    setBusy("connect");
    setMessage(null);
    if (!isConnected) {
      connectTriggered.current = true;
      setOpen(true);
      return;
    }
    setBusy(null);
    void refresh();
  };

  const previewPayment = async () => {
    if (!selectedToken || !address) return;
    let workingIntentId = intentId;
    setBusy("preview");
    setMessage(null);
    try {
      const receiverInfo = getReceiverForPaymentToken(selectedToken.token, paymentLink);
      if (!workingIntentId) {
        const intent = await createIntent({
          slug: paymentLink.slug,
          paymentFlow: "payer_ua",
          payerAddress: address,
          targetChainId: selectedToken.token.chainId,
          targetTokenAddress: selectedToken.token.address,
          targetTokenSymbol: selectedToken.token.symbol,
          receiver: receiverInfo.receiver,
          receiverKind: receiverInfo.receiverKind,
          amount,
        });
        if (!intent) throw new Error("Could not create a payment intent.");
        workingIntentId = intent._id;
      }
      setIntentId(workingIntentId);

      const transaction = await createTransfer({
        token: {
          chainId: selectedToken.token.chainId,
          address: selectedToken.token.address,
        },
        amount,
        receiver: receiverInfo.receiver,
      });
      setPreview(transaction);
      const transactionDetails = transaction as unknown as RuntimeTransactionDetails;
      await markPreviewed({
        paymentIntentId: workingIntentId,
        particleTransactionId: transactionDetails.transactionId,
        detailsJson: safeDetails({
          flow: "payer_ua",
          token: selectedToken.token,
          receiver: receiverInfo.receiver,
          tokenChanges: transactionDetails.tokenChanges,
          transactionFees: transactionDetails.transactionFees,
        }),
      });
      setMessage("Payment preview is ready.");
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

  const sendPayment = async () => {
    if (!preview || !intentId) return;
    setBusy("send");
    setMessage(null);
    try {
      const result = await signAndSend(preview);
      await markSubmitted({
        paymentIntentId: intentId,
        particleTransactionId: result?.transactionId ?? preview.transactionId,
        detailsJson: safeDetails(result),
      });
      await refresh();
      setMessage(`Payment submitted. UniversalX activity ID: ${result?.transactionId ?? preview.transactionId}`);
    } catch (nextError) {
      const errorMessage = nextError instanceof Error ? nextError.message : String(nextError);
      await markFailed({ paymentIntentId: intentId, errorMessage }).catch(() => undefined);
      setMessage(errorMessage);
    } finally {
      setBusy(null);
    }
  };

  const amountNumber = Number(amount);
  const canPreview = Boolean(address && selectedToken && Number.isFinite(amountNumber) && amountNumber > 0);

  return (
    <Panel title="From Universal Account" description={`Recipient: ${paymentLink.recipientName}`} tone="sky">
      <div className="stack-list">
        <div className="two-column-grid">
          <DataRow label="Payer status" value={address ? address : connectionStatus} />
          <DataRow label="Payer unified balance" value={formatUsd(primaryAssets?.totalAmountInUSD)} />
          <DataRow
            label="Recipient wallet"
            value={
              <StatusBadge tone={paymentLink.walletReady ? "positive" : "danger"}>
                {paymentLink.walletReady ? "ready" : "not ready"}
              </StatusBadge>
            }
          />
          <DataRow label="Mode" value={<StatusBadge tone="info">payer UA</StatusBadge>} />
        </div>

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
              {tokenOptions.map((option: PaymentTokenOption) => (
                <option key={option.id} value={option.id}>
                  {option.label}
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
          <button className="secondary-button" type="button" disabled={busy !== null} onClick={connectPayer}>
            {busy === "connect" ? "Connecting..." : address ? "Refresh payer UA" : "Connect wallet"}
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={!paymentLink.walletReady || !canPreview || busy !== null}
            onClick={previewPayment}
          >
            {busy === "preview" ? "Previewing..." : "Preview payment"}
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={!preview || !intentId || busy !== null}
            onClick={sendPayment}
          >
            {busy === "send" ? "Sending..." : "Send payment"}
          </button>
        </div>

        {preview ? <p className="muted-copy">Preview ID: {preview.transactionId}</p> : null}
        {message ? <p className="muted-copy">{message}</p> : null}
      </div>
    </Panel>
  );
}
