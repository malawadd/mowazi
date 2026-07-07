import { redirect } from "next/navigation";
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
  return <TradeTerminal initialCoin={canonicalHyperliquidCoin(coin)} />;
}
