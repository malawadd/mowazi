"use client";

import { useAction } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { formatNumber } from "@/lib/trade/format";
import {
  canonicalHyperliquidCoin,
  findHyperliquidMarket,
  getLiveHyperliquidMarkets,
  tradePathForCoin,
  vizPathForCoin,
} from "@/lib/trade/hyperliquidMarkets";
import type { PerpMarket } from "@/lib/trade/types";
import MarketHeader from "../trade/MarketHeader";
import tradeStyles from "../trade/trade-ui.module.css";
import { useHyperliquidFeed } from "../trade/useHyperliquidFeed";
import { buildVisualizationMetrics } from "./vizMetrics";
import { buildPaperVizModel } from "./vizPaperModel";
import VizTabs from "./VizTabs";

export default function VizTerminal({ initialCoin }: { initialCoin: string }) {
  const router = useRouter();
  const loadMarkets = useAction(api.trade.getHyperliquidMarkets);
  const [markets, setMarkets] = useState<PerpMarket[]>([]);
  const [selectedCoin, setSelectedCoin] = useState(() => canonicalHyperliquidCoin(initialCoin));
  const [interval, setInterval] = useState("1h");
  const [busy, setBusy] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);

  const selectedMarket = useMemo(
    () => findHyperliquidMarket(markets, selectedCoin) ?? markets[0] ?? null,
    [markets, selectedCoin],
  );
  const feed = useHyperliquidFeed(selectedMarket, interval);
  const metrics = useMemo(
    () =>
      selectedMarket
        ? buildVisualizationMetrics({
            market: selectedMarket,
            markets,
            snapshot: feed.snapshot,
            candles: feed.candles,
            trades: feed.trades,
          })
        : null,
    [feed.candles, feed.snapshot, feed.trades, markets, selectedMarket],
  );
  const paper = useMemo(
    () => (selectedMarket && metrics ? buildPaperVizModel(metrics, selectedMarket, feed.snapshot) : null),
    [feed.snapshot, metrics, selectedMarket],
  );

  useEffect(() => {
    setSelectedCoin(canonicalHyperliquidCoin(initialCoin));
  }, [initialCoin]);

  useEffect(() => {
    if (!selectedMarket) return;
    const mark = feed.snapshot?.markPrice ?? selectedMarket.markPrice ?? null;
    document.title = mark
      ? `${selectedMarket.id} Viz | $${formatNumber(mark, selectedMarket.pricePrecision)} | Moeazi`
      : `${selectedMarket.id} Viz | Moeazi`;
  }, [feed.snapshot?.markPrice, selectedMarket]);

  useEffect(() => {
    let cancelled = false;
    async function refreshMarkets() {
      setBusy(true);
      try {
        const liveMarkets = await getLiveHyperliquidMarkets();
        if (!cancelled) setMarkets(liveMarkets);
      } catch {
        try {
          const result = await loadMarkets({});
          if (!cancelled) setMarkets(result.markets);
        } catch (error) {
          if (!cancelled) setMarketError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void refreshMarkets();
    return () => {
      cancelled = true;
    };
  }, [loadMarkets]);

  useEffect(() => {
    if (markets.length === 0) return;
    if (findHyperliquidMarket(markets, selectedCoin)) {
      setMarketError(null);
      return;
    }
    setMarketError(`Hyperliquid does not list ${selectedCoin}.`);
    router.replace(vizPathForCoin("BTC"));
  }, [markets, router, selectedCoin]);

  const selectMarket = (coin: string) => {
    const next = canonicalHyperliquidCoin(coin);
    setMarketError(null);
    setSelectedCoin(next);
    window.history.replaceState(null, "", vizPathForCoin(next));
  };

  if (!selectedMarket || !metrics || !paper) {
    return (
      <div className={tradeStyles.terminal}>
        <p className={tradeStyles.emptyText}>{marketError ?? (busy ? "Loading Hyperliquid market atlas..." : "No market data available.")}</p>
      </div>
    );
  }

  return (
    <div className={tradeStyles.terminal}>
      <MarketHeader
        market={selectedMarket}
        markets={markets}
        snapshot={feed.snapshot}
        status={feed.status}
        action={{ href: tradePathForCoin(selectedCoin), label: "Back To Trade", kind: "trade" }}
        onSelectMarket={selectMarket}
      />
      <VizTabs
        interval={interval}
        metrics={metrics}
        paper={paper}
        selectedMarket={selectedMarket}
        statusMessage={marketError ?? feed.error}
        onIntervalChange={setInterval}
      />
    </div>
  );
}
