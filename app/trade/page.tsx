import { redirect } from "next/navigation";
import { tradePathForCoin } from "@/lib/trade/hyperliquidMarkets";

export default function TradeIndexPage() {
  redirect(tradePathForCoin("BTC"));
}
