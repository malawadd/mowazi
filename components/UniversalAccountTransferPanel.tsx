"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useModal } from "@particle-network/connectkit";
import type { ITransaction } from "@particle-network/universal-account-sdk";
import { useMutation } from "convex/react";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useUniversalAccount } from "@/hooks/useUniversalAccount";
import { getReceiverForPaymentToken, getSettlementTarget } from "@/lib/particlePaymentTokens";
import type { SettlementPreview } from "@/lib/particleSettlement";
import { getPaymentAccountAssetOptions, getPaymentAccountBreakdown } from "@/lib/paymentAccountAssets";
import {
  buildPaymentSettlementPreview,
  canCoverSettlementAmount,
  formatMaxSettlementAmount,
  safeJsonDetails,
} from "@/lib/paymentSettlementPreview";
import { friendlyPaymentError, getPayReadiness } from "@/lib/payReadiness";
import SettlementPreviewPanel from "@/components/SettlementPreview";
import { Panel } from "@/components/strategy-ui";
import PaymentAccountFundingPanel from "@/components/PaymentAccountFundingPanel";
import PaymentReadinessGate from "@/components/PaymentReadinessGate";
import PaymentSettlementForm from "@/components/PaymentSettlementForm";
import PaymentStatusGrid from "@/components/PaymentStatusGrid";

type PublicPaymentLink = {
  slug: string;
  strategyLabel: string;
  recipientName: string;
  evmUaAddress: string | null;
  solanaUaAddress: string | null;
  walletReady: boolean;
};

type Props = {
  paymentLink: PublicPaymentLink;
  directAllowed: boolean;
  recipientLabel: string;
  onUseDirectDeposit: () => void;
};

export default function UniversalAccountTransferPanel({
  directAllowed,
  onUseDirectDeposit,
  paymentLink,
  recipientLabel,
}: Props) {
  const { address, isConnected, status: connectionStatus } = useAccount();
  const { setOpen } = useModal();
  const { accountInfo, primaryAssets, eip7702Status, refresh, createSettledTransfer, signAndSend } =
    useUniversalAccount("eip7702-if-supported");
  const createIntent = useMutation(api.payments.createPaymentIntent);
  const markPreviewed = useMutation(api.payments.markPaymentIntentPreviewed);
  const markSubmitted = useMutation(api.payments.markPaymentIntentSubmitted);
  const markFailed = useMutation(api.payments.markPaymentIntentFailed);
  const [tokenId, setTokenId] = useState("");
  const [amount, setAmount] = useState("");
  const [intentId, setIntentId] = useState<Id<"paymentIntents"> | null>(null);
  const [preview, setPreview] = useState<ITransaction | null>(null);
  const [settlementPreview, setSettlementPreview] = useState<SettlementPreview | null>(null);
  const [busy, setBusy] = useState<"connect" | "preview" | "send" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fundingTarget, setFundingTarget] = useState<string | null>(null);
  const [fundingOwner, setFundingOwner] = useState<string | null>(null);
  const connectTriggered = useRef(false);

  const tokenOptions = useMemo(() => getPaymentAccountAssetOptions(primaryAssets), [primaryAssets]);
  const fundedTokenOptions = useMemo(() => tokenOptions.filter((option) => option.hasBalance), [tokenOptions]);
  const balanceBreakdown = useMemo(() => getPaymentAccountBreakdown(primaryAssets), [primaryAssets]);
  const selectedToken = tokenOptions.find((option) => option.id === tokenId) ?? fundedTokenOptions[0] ?? null;
  const paymentAccountAddress = accountInfo?.evmSmartAccount || null;
  const readiness = getPayReadiness({
    isConnected,
    walletReady: paymentLink.walletReady,
    paymentAccountBalanceUsd: primaryAssets?.totalAmountInUSD,
    canPayInPlace: eip7702Status.enabled,
    directAllowed,
  });

  const resetPreview = () => {
    setIntentId(null);
    setPreview(null);
    setSettlementPreview(null);
    setMessage(null);
  };

  useEffect(() => {
    if (selectedToken?.id === tokenId) return;
    setTokenId(fundedTokenOptions[0]?.id ?? "");
  }, [fundedTokenOptions, selectedToken?.id, tokenId]);

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

  const startFunding = () => {
    if (!paymentAccountAddress) {
      setOpen(true);
      return;
    }
    setFundingTarget(paymentAccountAddress);
    setFundingOwner(address ?? null);
    setMessage(null);
  };

  const previewPayment = async () => {
    if (!selectedToken || !address) return;
    let workingIntentId = intentId;
    setBusy("preview");
    setMessage(null);
    setSettlementPreview(null);
    try {
      const settlement = getSettlementTarget();
      const receiverInfo = getReceiverForPaymentToken(settlement, paymentLink);
      const amountNumber = Number(amount);
      if (!selectedToken.hasBalance) {
        throw new Error("No supported funds were found in this payment account yet.");
      }
      if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
        throw new Error("Enter a USDC amount greater than zero.");
      }
      if (!canCoverSettlementAmount(selectedToken, amountNumber)) {
        throw new Error("The selected payment account balance is too small for this USDC amount.");
      }
      const est = buildPaymentSettlementPreview(selectedToken, settlement, amount, amountNumber);
      setSettlementPreview(est);

      if (!workingIntentId) {
        const intent = await createIntent({
          slug: paymentLink.slug,
          paymentFlow: "payer_ua",
          payerAddress: address,
          targetChainId: settlement.chainId,
          targetTokenAddress: settlement.address,
          targetTokenSymbol: settlement.symbol,
          sourceChainId: selectedToken.token.chainId,
          sourceTokenAddress: selectedToken.token.address,
          sourceTokenSymbol: selectedToken.token.symbol,
          receiver: receiverInfo.receiver,
          receiverKind: receiverInfo.receiverKind,
          settlementChainId: settlement.chainId,
          settlementTokenAddress: settlement.address,
          settlementTokenSymbol: settlement.symbol,
          settlementAmount: amount,
          amount: amount,
        });
        if (!intent) throw new Error("Could not create a payment intent.");
        workingIntentId = intent._id;
      }
      setIntentId(workingIntentId);

      const transaction: ITransaction = await createSettledTransfer({
        amount,
        receiver: receiverInfo.receiver,
      });

      setPreview(transaction);
      const transactionDetails = transaction as ITransaction & { tokenChanges?: unknown; transactionFees?: unknown };
      await markPreviewed({
        paymentIntentId: workingIntentId,
        particleTransactionId: transactionDetails.transactionId,
        detailsJson: safeJsonDetails({
          flow: "payer_ua",
          settled: true,
          sourceBalance: selectedToken,
          targetToken: settlement,
          receiver: receiverInfo.receiver,
          settlementPreview: est,
          tokenChanges: transactionDetails.tokenChanges,
          transactionFees: transactionDetails.transactionFees,
        }),
      });
      setMessage("Payment preview is ready.");
    } catch (nextError) {
      const errorMessage = friendlyPaymentError(nextError);
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
        detailsJson: safeJsonDetails(result),
      });
      await refresh();
      setMessage(`Payment submitted. UniversalX activity ID: ${result?.transactionId ?? preview.transactionId}`);
    } catch (nextError) {
      const errorMessage = friendlyPaymentError(nextError);
      await markFailed({ paymentIntentId: intentId, errorMessage }).catch(() => undefined);
      setMessage(errorMessage);
    } finally {
      setBusy(null);
    }
  };

  const amountNumber = Number(amount);
  const canPreview = Boolean(
    readiness.canUseUaSettlement &&
      address &&
      selectedToken?.hasBalance &&
      Number.isFinite(amountNumber) &&
      canCoverSettlementAmount(selectedToken, amountNumber),
  );

  const setMaxAmount = () => {
    if (!selectedToken?.hasBalance) return;
    setAmount(formatMaxSettlementAmount(selectedToken.amountUsd));
    resetPreview();
  };

  return (
    <Panel title="Settle to Arbitrum USDC" description={`Recipient: ${recipientLabel}`} tone="sky">
      <div className="stack-list">
        <PaymentStatusGrid
          address={address}
          balanceBreakdown={balanceBreakdown}
          connectionStatus={connectionStatus}
          directAllowed={directAllowed}
          paymentAccountAddress={paymentAccountAddress}
          paymentFundsUsd={primaryAssets?.totalAmountInUSD}
          readiness={readiness}
          walletReady={paymentLink.walletReady}
        />

        {readiness.canUseUaSettlement ? (
          <PaymentSettlementForm
            address={address}
            amount={amount}
            busy={busy}
            canPreview={canPreview}
            hasPreview={Boolean(preview && intentId)}
            selectedTokenId={selectedToken?.id ?? ""}
            tokenOptions={tokenOptions}
            walletReady={paymentLink.walletReady}
            onAmountChange={(value) => {
              setAmount(value);
              resetPreview();
            }}
            onMaxAmount={setMaxAmount}
            onPreview={previewPayment}
            onRefresh={connectPayer}
            onSend={sendPayment}
            onTokenChange={(value) => {
              setTokenId(value);
              resetPreview();
            }}
          />
        ) : (
          <PaymentReadinessGate
            address={address}
            busy={busy !== null}
            directAllowed={directAllowed}
            readiness={readiness}
            onChangeWallet={() => setOpen(true)}
            onRefresh={connectPayer}
            onStartFunding={startFunding}
            onUseDirectDeposit={onUseDirectDeposit}
          />
        )}

        {fundingTarget ? (
          <PaymentAccountFundingPanel
            currentAddress={address}
            originalAddress={fundingOwner}
            receiverAddress={fundingTarget}
            onSubmitted={() => void refresh()}
          />
        ) : null}

        {settlementPreview && selectedToken ? (
          <SettlementPreviewPanel
            preview={settlementPreview}
            sourceLabel="Selected payment balance"
            sourceValue={`${selectedToken.label} · ${selectedToken.formattedAmount} · ${selectedToken.formattedUsd}`}
          />
        ) : null}

        {preview ? <p className="muted-copy">Preview ID: {preview.transactionId}</p> : null}
        {message ? <p className="muted-copy">{message}</p> : null}
      </div>
    </Panel>
  );
}
