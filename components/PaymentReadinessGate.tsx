"use client";

import { StatusBadge } from "@/components/strategy-ui";
import type { PayReadiness } from "@/lib/payReadiness";

type Props = {
  address?: string | null;
  busy: boolean;
  directAllowed: boolean;
  readiness: PayReadiness;
  onChangeWallet: () => void;
  onRefresh: () => void;
  onStartFunding: () => void;
  onUseDirectDeposit: () => void;
};

export function readinessBadge(readiness: PayReadiness) {
  if (readiness.status === "ready_to_pay") return <StatusBadge tone="positive">Ready to pay</StatusBadge>;
  if (readiness.status === "direct_deposit_available") return <StatusBadge tone="warning">Direct option available</StatusBadge>;
  if (readiness.status === "needs_payment_account_funds") return <StatusBadge tone="warning">Needs funds</StatusBadge>;
  return <StatusBadge tone="info">Connect wallet</StatusBadge>;
}

export default function PaymentReadinessGate({
  address,
  busy,
  directAllowed,
  readiness,
  onChangeWallet,
  onRefresh,
  onStartFunding,
  onUseDirectDeposit,
}: Props) {
  return (
    <div className="empty-state">
      <h3>{readiness.title}</h3>
      <p>{readiness.body}</p>
      {!directAllowed ? (
        <p className="muted-copy">The recipient turned off direct wallet deposits for this link.</p>
      ) : (
        <p className="muted-copy">You can still pay the recipient directly from this wallet.</p>
      )}
      <div className="inline-actions">
        {directAllowed ? (
          <button className="primary-button" type="button" onClick={onUseDirectDeposit}>
            Use direct wallet deposit
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={onStartFunding}>
            Add funds to payment account
          </button>
        )}
        {directAllowed ? (
          <button className="secondary-button" type="button" onClick={onStartFunding}>
            Add funds to payment account
          </button>
        ) : null}
        <button className="secondary-button" type="button" disabled={busy} onClick={onRefresh}>
          {address ? "Refresh balance" : "Connect wallet"}
        </button>
        <button className="secondary-button" type="button" onClick={onChangeWallet}>
          Change wallet
        </button>
      </div>
    </div>
  );
}
