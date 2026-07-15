import { redirect } from "next/navigation";
import { vizPathForCoin } from "@/lib/trade/hyperliquidMarkets";

export default function VizIndexPage() {
  redirect(vizPathForCoin("BTC"));
}
