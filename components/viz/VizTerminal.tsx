"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { agentRequest, type AgentTierContract } from "@/lib/agentBackend";
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
import { applyAgentVisualization } from "./agentVizAdapter";
import type { AgentVisualization } from "@/lib/agentBackend";
import VizTabs from "./VizTabs";

export default function VizTerminal({ initialCoin }: { initialCoin: string }) {
  const router = useRouter();
  const loadMarkets = useAction(api.trade.getHyperliquidMarkets);
  const touchPublicDemand = useMutation(api.agentMutations.touchPublicMarketDemand);
  const requestPublicAnalysis = useMutation(api.agentMutations.requestPublicAnalysis);
  const [markets, setMarkets] = useState<PerpMarket[]>([]);
  const [selectedCoin, setSelectedCoin] = useState(() => canonicalHyperliquidCoin(initialCoin));
  const [interval, setInterval] = useState("1h");
  const [busy, setBusy] = useState(true);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [demandSession, setDemandSession] = useState<string | null>(null);
  const [focusContract, setFocusContract] = useState<AgentTierContract | null>(null);
  const [analysisState, setAnalysisState] = useState<string | null>(null);
  const [analysisRequestedAt, setAnalysisRequestedAt] = useState<number | null>(null);

  const selectedMarket = useMemo(
    () => findHyperliquidMarket(markets, selectedCoin) ?? markets[0] ?? null,
    [markets, selectedCoin],
  );
  const agentMarketId = `${selectedCoin}-USD`;
  const publicAnalysis = useQuery(api.agentQueries.getPublicMarketAnalysis, { marketId: agentMarketId });
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
    () => selectedMarket && metrics ? applyAgentVisualization(
      buildPaperVizModel(metrics, selectedMarket, feed.snapshot),
      (publicAnalysis?.analysis?.visualization as AgentVisualization | undefined) ?? null,
    ) : null,
    [feed.snapshot, metrics, publicAnalysis?.analysis?.visualization, selectedMarket],
  );

  useEffect(() => {
    void agentRequest<AgentTierContract>("v1/tiers/focus")
      .then(setFocusContract)
      .catch(() => setFocusContract(null));
  }, []);

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
    const storageKey = "moeazi-public-demand-session";
    let sessionHash = window.localStorage.getItem(storageKey);
    if (!sessionHash) {
      sessionHash = crypto.randomUUID().replaceAll("-", "");
      window.localStorage.setItem(storageKey, sessionHash);
    }
    setDemandSession(sessionHash);
    const touch = () => void touchPublicDemand({ marketId: agentMarketId, sessionHash });
    touch();
    const timer = window.setInterval(touch, 30_000);
    return () => window.clearInterval(timer);
  }, [agentMarketId, touchPublicDemand]);

  useEffect(() => {
    if (analysisRequestedAt && (publicAnalysis?.analysis?.createdAt ?? 0) > analysisRequestedAt) {
      setAnalysisState("Manual analysis complete");
      setAnalysisRequestedAt(null);
    }
  }, [analysisRequestedAt, publicAnalysis?.analysis?.createdAt]);

  const runManualAnalysis = async () => {
    if (!demandSession || !focusContract) return;
    setAnalysisState("Confirming manual request…");
    try {
      const result = await requestPublicAnalysis({
        marketId: agentMarketId, sessionHash: demandSession, tier: "focus", confirmed: true,
        pricingVersion: focusContract.estimate.pricingVersion,
        estimatedCostMicrousd: focusContract.estimate.estimatedCostMicrousd,
      });
      if (result.reason === "fresh") {
        setAnalysisState("Current analysis is still fresh");
        return;
      }
      setAnalysisRequestedAt(Date.now());
      setAnalysisState(result.deduplicated ? "Manual analysis already queued" : "Manual Focus analysis queued");
    } catch (error) {
      setAnalysisState(error instanceof Error ? error.message : "Could not request analysis");
    }
  };

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
        statusMessage={
          marketError ?? feed.error ?? analysisState ?? (publicAnalysis?.analysis
            ? `Agent ${publicAnalysis.analysis.tier} · ${publicAnalysis.stale ? "refreshing" : publicAnalysis.analysis.status}`
            : "Live market view · agent analysis is manual")
        }
        analysisAction={{
          estimate: focusContract?.estimate ?? null,
          running: Boolean(analysisRequestedAt),
          disabled: publicAnalysis?.stale === false,
          onRun: () => void runManualAnalysis(),
        }}
        onIntervalChange={setInterval}
      />
    </div>
  );
}
