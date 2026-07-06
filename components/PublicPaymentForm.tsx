"use client";

import { useState } from "react";
import ConnectedWalletDepositPanel from "@/components/ConnectedWalletDepositPanel";
import UniversalAccountTransferPanel from "@/components/UniversalAccountTransferPanel";
import { DataRow, Panel, StatusBadge } from "@/components/strategy-ui";

type PublicPaymentLink = {
  slug: string;
  strategyLabel: string;
  recipientName: string;
  evmUaAddress: string | null;
  solanaUaAddress: string | null;
  walletReady: boolean;
};

type PaymentMode = "eoa_direct" | "payer_ua";

export default function PublicPaymentForm({ paymentLink }: { paymentLink: PublicPaymentLink }) {
  const [mode, setMode] = useState<PaymentMode>("eoa_direct");

  return (
    <div className="stack-list">
      <Panel title="Deposit to account" description={`Recipient: ${paymentLink.recipientName}`} tone="paper">
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
          </div>
          <div className="inline-actions">
            <button
              className={mode === "eoa_direct" ? "primary-button" : "secondary-button"}
              type="button"
              onClick={() => setMode("eoa_direct")}
            >
              From connected wallet
            </button>
            <button
              className={mode === "payer_ua" ? "primary-button" : "secondary-button"}
              type="button"
              onClick={() => setMode("payer_ua")}
            >
              From Universal Account
            </button>
          </div>
        </div>
      </Panel>

      {mode === "eoa_direct" ? (
        <ConnectedWalletDepositPanel
          receiverAddress={paymentLink.evmUaAddress}
          recipientLabel={paymentLink.recipientName}
          paymentLinkSlug={paymentLink.slug}
        />
      ) : (
        <UniversalAccountTransferPanel paymentLink={paymentLink} />
      )}
    </div>
  );
}
