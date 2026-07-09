"use client";

import { DataRow, StatusBadge } from "@/components/strategy-ui";
import { readinessBadge } from "@/components/PaymentReadinessGate";
import type { PayReadiness } from "@/lib/payReadiness";
import type { PaymentAccountAssetBreakdown } from "@/lib/paymentAccountAssets";

type Props = {
  address?: string | null;
  balanceBreakdown: PaymentAccountAssetBreakdown[];
  accountMode?: "smart_account" | "eip7702";
  connectionStatus: string;
  directAllowed: boolean;
  paymentAccountAddress?: string | null;
  paymentFundsUsd?: number | null;
  readiness: PayReadiness;
  walletProvider?: string | null;
  walletReady: boolean;
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
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function AddressValue({ value, fallback }: { value?: string | null; fallback: string }) {
  const copy = async () => {
    if (!value) return;
    await navigator.clipboard.writeText(value).catch(() => undefined);
  };

  if (!value) return <span>{fallback}</span>;

  return (
    <span className="address-value">
      <span className="mono-label">{shortAddress(value)}</span>
      <button className="mini-copy-button" type="button" onClick={copy}>
        Copy
      </button>
    </span>
  );
}

function FundsBreakdown({
  breakdown,
  total,
}: {
  breakdown: PaymentAccountAssetBreakdown[];
  total?: number | null;
}) {
  if (breakdown.length === 0) {
    return (
      <span className="funds-breakdown">
        <span>{formatUsd(total)}</span>
        {total && total > 0 ? (
          <span className="muted-copy">Balance returned by Particle, asset details unavailable.</span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="funds-breakdown">
      <span>{formatUsd(total)}</span>
      {breakdown.slice(0, 4).map((asset) => (
        <span className="funds-breakdown-row" key={asset.id}>
          {asset.label} · {asset.formattedAmount} · {asset.formattedUsd}
        </span>
      ))}
      {breakdown.length > 4 ? <span className="muted-copy">+{breakdown.length - 4} more balances</span> : null}
    </span>
  );
}

export default function PaymentStatusGrid({
  address,
  accountMode,
  balanceBreakdown,
  connectionStatus,
  directAllowed,
  paymentAccountAddress,
  paymentFundsUsd,
  readiness,
  walletProvider,
  walletReady,
}: Props) {
  return (
    <div className="two-column-grid">
      <DataRow
        label="Connected wallet"
        value={<AddressValue value={address} fallback={connectionStatus} />}
      />
      <DataRow
        label="Payment account"
        value={<AddressValue value={paymentAccountAddress} fallback="Loading payment account" />}
      />
      <DataRow
        label="Account mode"
        value={
          <StatusBadge tone={accountMode === "eip7702" ? "positive" : "info"}>
            {accountMode === "eip7702" ? "Magic EOA / 7702" : "Smart Account"}
          </StatusBadge>
        }
      />
      <DataRow label="Provider" value={<StatusBadge tone="info">{walletProvider ?? "particle"}</StatusBadge>} />
      <DataRow
        label="Payment account funds"
        value={<FundsBreakdown breakdown={balanceBreakdown} total={paymentFundsUsd} />}
      />
      <DataRow
        label="Recipient wallet"
        value={<StatusBadge tone={walletReady ? "positive" : "danger"}>{walletReady ? "ready" : "not ready"}</StatusBadge>}
      />
      <DataRow label="Payment status" value={readinessBadge(readiness)} />
      <DataRow
        label="Direct wallet deposits"
        value={<StatusBadge tone={directAllowed ? "warning" : "info"}>{directAllowed ? "available" : "off"}</StatusBadge>}
      />
    </div>
  );
}
