"use client";

import { useEffect, useState } from "react";
import ConnectedWalletDepositPanel from "@/components/ConnectedWalletDepositPanel";
import UniversalAccountTransferPanel from "@/components/UniversalAccountTransferPanel";
import { DataRow, Panel, StatusBadge } from "@/components/strategy-ui";
import { getPublicRecipientName } from "@/lib/payReadiness";

type PublicPaymentLink = {
  slug: string;
  strategyLabel: string;
  recipientName: string;
  evmUaAddress: string | null;
  solanaUaAddress?: string | null;
  walletReady: boolean;
  depositPolicy?: "ua_settlement_only" | "ua_settlement_plus_eoa_direct";
  eoaDirectAllowed?: boolean;
};

type PaymentMode = "eoa_direct" | "payer_ua";

export default function PublicPaymentForm({ paymentLink }: { paymentLink: PublicPaymentLink }) {
  const directAllowed =
    paymentLink.eoaDirectAllowed ??
    paymentLink.depositPolicy !== "ua_settlement_only";
  const [mode, setMode] = useState<PaymentMode>("payer_ua");
  const recipientLabel = getPublicRecipientName(paymentLink.recipientName, paymentLink.strategyLabel);

  useEffect(() => {
    if (!directAllowed && mode === "eoa_direct") setMode("payer_ua");
  }, [directAllowed, mode]);

  return (
    <div className="stack-list">
      <Panel title="Deposit to account" description={`Recipient: ${recipientLabel}`} tone="paper">
        <div className="stack-list">
          <div className="two-column-grid">
            <DataRow label="Account" value={paymentLink.strategyLabel} />
            <DataRow
              label="Recipient wallet"
              value={
                <StatusBadge tone={paymentLink.walletReady ? "positive" : "danger"}>
                  {paymentLink.walletReady ? "ready" : "not ready"}
                </StatusBadge>
              }
            />
            <DataRow
              label="Default settlement"
              value={<StatusBadge tone="positive">Arbitrum USDC</StatusBadge>}
            />
            <DataRow
              label="Direct wallet deposits"
              value={
                <StatusBadge tone={directAllowed ? "warning" : "info"}>
                  {directAllowed ? "allowed" : "off"}
                </StatusBadge>
              }
            />
          </div>
          <div className="inline-actions">
            <button
              className={mode === "payer_ua" ? "primary-button" : "secondary-button"}
              type="button"
              onClick={() => setMode("payer_ua")}
            >
              Settle to Arbitrum USDC
            </button>
            {directAllowed ? (
              <button
                className={mode === "eoa_direct" ? "primary-button" : "secondary-button"}
                type="button"
                onClick={() => setMode("eoa_direct")}
              >
                Direct EOA deposit
              </button>
            ) : null}
          </div>
        </div>
      </Panel>

      {mode === "eoa_direct" ? (
        <ConnectedWalletDepositPanel
          receiverAddress={paymentLink.evmUaAddress}
          recipientLabel={recipientLabel}
          paymentLinkSlug={paymentLink.slug}
          title="Direct EOA deposit"
          description="Plain transfer into the receiver Universal Account; no automatic USDC settlement."
        />
      ) : (
        <UniversalAccountTransferPanel
          directAllowed={directAllowed}
          onUseDirectDeposit={() => setMode("eoa_direct")}
          paymentLink={paymentLink}
          recipientLabel={recipientLabel}
        />
      )}
    </div>
  );
}
