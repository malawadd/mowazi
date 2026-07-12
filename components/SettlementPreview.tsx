import { DataRow, StatusBadge } from "@/components/strategy-ui";
import type { SettlementPreview } from "@/lib/particleSettlement";
import { formatSettlementAmount } from "@/lib/particleSettlement";

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

type Props = {
  preview: SettlementPreview;
  sourceAmount?: string;
  sourceLabel?: string;
  sourceSymbol?: string;
  sourceValue?: string;
};

export default function SettlementPreviewPanel({
  preview,
  sourceAmount,
  sourceLabel = "Source",
  sourceSymbol,
  sourceValue,
}: Props) {
  const settlementLabel = `${preview.settlement.symbol} on Arbitrum`;
  const usdFormatted = formatUsd(preview.sourceAmountUsd);
  const fallbackSource =
    sourceAmount && sourceSymbol
      ? `${sourceAmount} ${sourceSymbol}${usdFormatted ? ` (${usdFormatted})` : ""}`
      : "Payment account funds";

  return (
    <div className="settlement-preview stack-list" style={{ marginTop: 8 }}>
      <DataRow
        label={sourceLabel}
        value={sourceValue ?? fallbackSource}
      />
      <DataRow
        label="Settlement"
        value={
          <span>
            {formatSettlementAmount(preview.estimatedSettlementAmount, preview.settlement.symbol)}{" "}
            <StatusBadge tone={preview.isDirect ? "info" : "positive"}>
              {preview.isDirect ? "direct" : "converted"}
            </StatusBadge>
          </span>
        }
      />
      <DataRow label="Destination" value={settlementLabel} />
      {preview.fees ? (
        <DataRow
          label="Estimated fees"
          value={
            <span>
              {formatUsd(preview.fees.totalUsd) ?? "Unavailable"}
              {preview.fees.gasUsd !== null ? ` gas ${formatUsd(preview.fees.gasUsd)}` : ""}
            </span>
          }
        />
      ) : null}
      {preview.requiredBalanceUsd !== null && preview.requiredBalanceUsd !== undefined ? (
        <DataRow
          label="Needed in payment account"
          value={`${formatUsd(preview.requiredBalanceUsd) ?? "Unavailable"}${
            preview.availableBalanceUsd !== null && preview.availableBalanceUsd !== undefined
              ? ` available ${formatUsd(preview.availableBalanceUsd) ?? "Unavailable"}`
              : ""
          }`}
        />
      ) : null}
      <DataRow
        label="Powered by"
        value={<StatusBadge tone="info">Universal Account</StatusBadge>}
      />
    </div>
  );
}
