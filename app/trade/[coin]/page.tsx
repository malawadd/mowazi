import { redirect } from "next/navigation";
import TradeShell from "@/components/trade/TradeShell";
import TradeTerminal from "@/components/trade/TradeTerminal";
import {
  canonicalHyperliquidCoin,
  isCanonicalTradePathCoin,
  tradePathForCoin,
} from "@/lib/trade/hyperliquidMarkets";

export default async function TradeCoinPage({
  params,
}: {
  params: Promise<{ coin: string }>;
}) {
  const { coin } = await params;
  if (!isCanonicalTradePathCoin(coin)) redirect(tradePathForCoin(coin));
  return (
    <TradeShell>
      <TradeTerminal initialCoin={canonicalHyperliquidCoin(coin)} />
    </TradeShell>
  );
}
