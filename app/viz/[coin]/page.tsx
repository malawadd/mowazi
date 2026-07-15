import { redirect } from "next/navigation";
import VizTerminal from "@/components/viz/VizTerminal";
import {
  canonicalHyperliquidCoin,
  isCanonicalTradePathCoin,
  vizPathForCoin,
} from "@/lib/trade/hyperliquidMarkets";

export default async function VizCoinPage({
  params,
}: {
  params: Promise<{ coin: string }>;
}) {
  const { coin } = await params;
  if (!isCanonicalTradePathCoin(coin)) redirect(vizPathForCoin(coin));
  return <VizTerminal initialCoin={canonicalHyperliquidCoin(coin)} />;
}
