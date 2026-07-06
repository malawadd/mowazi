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
  sourceSymbol: string;
  sourceAmount: string;
};

export default function SettlementPreviewPanel({ preview, sourceSymbol, sourceAmount }: Props) {
  const settlementLabel = `${preview.settlement.symbol} on Arbitrum`;
  const usdFormatted = formatUsd(preview.sourceAmountUsd);

  return (
    <div className="settlement-preview stack-list" style={{ marginTop: 8 }}>
      <DataRow
        label="Source"
        value={`${sourceAmount} ${sourceSymbol}${usdFormatted ? ` (${usdFormatted})` : ""}`}
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
      <DataRow
        label="Powered by"
        value={<StatusBadge tone="info">Universal Account</StatusBadge>}
      />
    </div>
  );
}
