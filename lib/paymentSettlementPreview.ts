import type { SettlementPreview } from "@/lib/particleSettlement";
import type { SettlementTarget } from "@/lib/particlePaymentTokens";
import type { PaymentAccountAssetOption } from "@/lib/paymentAccountAssets";

const SETTLEMENT_EPSILON = 0.000001;

export function canCoverSettlementAmount(
  source: PaymentAccountAssetOption | null,
  amount: number,
) {
  if (!source?.hasBalance || !Number.isFinite(amount) || amount <= 0) return false;
  return source.amountUsd <= 0 || amount <= source.amountUsd + SETTLEMENT_EPSILON;
}

export function buildPaymentSettlementPreview(
  source: PaymentAccountAssetOption,
  settlement: SettlementTarget,
  amount: string,
  amountNumber: number,
): SettlementPreview {
  return {
    settlement,
    isDirect:
      source.token.chainId === settlement.chainId &&
      source.token.symbol.toLowerCase() === settlement.symbol.toLowerCase(),
    estimatedSettlementAmount: amount,
    sourceAmountUsd: amountNumber,
    sourceTokenPrice: source.amount > 0 && source.amountUsd > 0 ? source.amountUsd / source.amount : null,
  };
}

export function formatMaxSettlementAmount(value: number) {
  return value.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 6,
  });
}

export function safeJsonDetails(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}
