import type { PerpMarket, VenueSnapshot } from "@/lib/trade/types";
import type { LiveTrade, TradeCandle } from "../trade/useHyperliquidFeed";
import { buildGalaxy, type GalaxyNode } from "./vizGalaxyModel";
import { runLayout } from "./vizLayout";

export type { GalaxyNode } from "./vizGalaxyModel";
export type VizTone = "yellow" | "sky" | "mint" | "orange" | "lilac" | "rose" | "paper";
export type ForceVector = {
  id: string;
  label: string;
  valueLabel: string;
  evidence: string;
  magnitude: number;
  polarity: number;
  tone: VizTone;
};
export type StorySegment = {
  id: string;
  time: number;
  open: number;
  close: number;
  high: number;
  low: number;
  changePct: number;
  volumeScore: number;
  tone: VizTone;
};
export type ScenarioBranch = {
  id: string;
  label: string;
  score: number;
  tone: VizTone;
  trigger: string;
  invalidation: string;
  disclaimer: string;
};
export type AgentNode = { id: string; label: string; stance: string; evidence: string; conviction: number; tone: VizTone; x: number; y: number };
export type AgentLink = { source: string; target: string; value: number };
export type VizMetrics = {
  phase: string;
  momentumPct: number;
  volatilityPct: number;
  liquidityImbalance: number;
  tradePressure: number;
  forces: ForceVector[];
  story: StorySegment[];
  scenarios: ScenarioBranch[];
  agents: { nodes: AgentNode[]; links: AgentLink[] };
  galaxy: GalaxyNode[];
};
export type VizMetricInput = { market: PerpMarket; markets: PerpMarket[]; snapshot: VenueSnapshot | null; candles: TradeCandle[]; trades: LiveTrade[] };

export function buildVisualizationMetrics(input: VizMetricInput): VizMetrics {
  const momentumPct = priceMomentum(input.candles, input.market);
  const volatilityPct = volatility(input.candles, input.market);
  const liquidityImbalance = orderBookImbalance(input.snapshot);
  const tradePressure = liveTradePressure(input.trades);
  const fundingBps = 10000 * (input.snapshot?.fundingRateHourly ?? input.market.fundingRateHourly ?? 0);
  const volume = input.snapshot?.volume24hUsd ?? input.market.volume24hUsd ?? 0;
  const openInterest = input.snapshot?.openInterestUsd ?? input.market.openInterestUsd ?? 0;
  return {
    phase: marketPhase(momentumPct, volatilityPct, liquidityImbalance, tradePressure),
    momentumPct,
    volatilityPct,
    liquidityImbalance,
    tradePressure,
    forces: buildForces({ momentumPct, liquidityImbalance, tradePressure, fundingBps, volume, openInterest }),
    story: buildStory(input.candles, input.market),
    scenarios: buildScenarios({ momentumPct, volatilityPct, liquidityImbalance, tradePressure, fundingBps }),
    agents: buildAgents({ momentumPct, volatilityPct, liquidityImbalance, tradePressure, fundingBps }),
    galaxy: buildGalaxy(input.markets, input.market.id),
  };
}

function buildForces(args: { momentumPct: number; liquidityImbalance: number; tradePressure: number; fundingBps: number; volume: number; openInterest: number }): ForceVector[] {
  const volumeScore = clamp(Math.log10(Math.max(10, args.volume)) / 11, 0.12, 1);
  const oiShare = clamp(args.openInterest / Math.max(args.volume, 1), 0, 1);
  return [
    vector("momentum", "Momentum", pct(args.momentumPct), "Loaded candle direction.", args.momentumPct, 5, "sky"),
    vector("liquidity", "Liquidity", pct(args.liquidityImbalance * 100), "Bid versus ask depth.", args.liquidityImbalance * 100, 70, "mint"),
    vector("flow", "Trade Flow", pct(args.tradePressure * 100), "Live buy versus sell prints.", args.tradePressure * 100, 70, "orange"),
    vector("funding", "Funding", `${signed(args.fundingBps)} bps/h`, "Positive funding adds long-side cost.", -args.fundingBps, 4, "rose"),
    vector("openInterest", "Position Risk", pct(oiShare * 100), "Open interest relative to activity.", -(oiShare - 0.32) * 100, 68, "lilac"),
    intensityVector("volume", "Activity", pct(volumeScore * 100), "24h notional activity intensity.", volumeScore, "yellow"),
  ];
}

function vector(id: string, label: string, valueLabel: string, evidence: string, raw: number, scale: number, tone: VizTone): ForceVector {
  const normalized = finite(raw) / Math.max(scale, 0.001);
  const polarity = Math.abs(normalized) < 0.025 ? 0 : normalized > 0 ? 1 : -1;
  return { id, label, valueLabel, evidence, magnitude: clamp(Math.abs(normalized), 0.04, 1), polarity, tone };
}

function intensityVector(id: string, label: string, valueLabel: string, evidence: string, intensity: number, tone: VizTone): ForceVector {
  return { id, label, valueLabel, evidence, magnitude: clamp(intensity, 0.04, 1), polarity: 0, tone };
}

function buildStory(candles: TradeCandle[], market: PerpMarket): StorySegment[] {
  const rows = candles.filter((row) => row.close > 0).slice(-40);
  const fallback = finite(market.markPrice ?? 0);
  if (rows.length === 0) return [{ id: "empty", time: market.fetchedAt ?? 0, open: fallback, close: fallback, high: fallback, low: fallback, changePct: 0, volumeScore: 0.15, tone: "paper" }];
  const maxVolume = Math.max(...rows.map((row) => row.volume), 1);
  return rows.map((row) => {
    const changePct = row.open > 0 ? ((row.close - row.open) / row.open) * 100 : 0;
    return {
      id: String(row.time), time: row.time, open: finite(row.open), close: finite(row.close), high: finite(row.high), low: finite(row.low),
      changePct: finite(changePct), volumeScore: clamp(row.volume / maxVolume, 0.08, 1), tone: changePct >= 0 ? "mint" : "rose",
    };
  });
}

function buildScenarios(args: { momentumPct: number; volatilityPct: number; liquidityImbalance: number; tradePressure: number; fundingBps: number }): ScenarioBranch[] {
  const longPressure = positive(args.momentumPct) + positive(args.tradePressure * 100) + positive(args.liquidityImbalance * 100);
  const shortPressure = positive(-args.momentumPct) + positive(-args.tradePressure * 100) + positive(-args.liquidityImbalance * 100);
  const risk = clamp((args.volatilityPct + Math.abs(args.fundingBps)) / 8, 0, 1);
  return [
    { id: "squeeze", label: "Squeeze Branch", score: clamp((longPressure / 3 + risk) / 2, 0, 1), tone: "mint", trigger: "Momentum and live prints keep leaning bid.", invalidation: "Bid depth flips negative or momentum stalls.", disclaimer: "Uncertain path, not a prediction." },
    { id: "range", label: "Range Branch", score: clamp(1 - (Math.abs(args.momentumPct) / 8 + args.volatilityPct / 8 + Math.abs(args.tradePressure)) / 3, 0, 1), tone: "sky", trigger: "Volatility cools while liquidity stays balanced.", invalidation: "Funding or trade pressure breaks from neutral.", disclaimer: "Uncertain path, not a prediction." },
    { id: "flush", label: "Flush Branch", score: clamp((shortPressure / 3 + risk) / 2, 0, 1), tone: "rose", trigger: "Sell prints and ask-side pressure accelerate.", invalidation: "Buy flow absorbs the move near current depth.", disclaimer: "Uncertain path, not a prediction." },
  ];
}

function buildAgents(args: { momentumPct: number; volatilityPct: number; liquidityImbalance: number; tradePressure: number; fundingBps: number }) {
  const nodes = [
    agent("price", "Price", stance(args.momentumPct), pct(args.momentumPct), Math.abs(args.momentumPct) / 8, "sky"),
    agent("liquidity", "Liquidity", stance(args.liquidityImbalance), pct(args.liquidityImbalance * 100), Math.abs(args.liquidityImbalance), "mint"),
    agent("flow", "Flow", stance(args.tradePressure), pct(args.tradePressure * 100), Math.abs(args.tradePressure), "orange"),
    agent("derivatives", "Derivatives", stance(-args.fundingBps), `${signed(args.fundingBps)} bps/h`, Math.abs(args.fundingBps) / 8, "lilac"),
    agent("risk", "Risk", args.volatilityPct > 2 ? "elevated" : "contained", pct(args.volatilityPct), args.volatilityPct / 8, "rose"),
  ];
  const links: AgentLink[] = [{ source: "price", target: "flow", value: 0.7 }, { source: "price", target: "liquidity", value: 0.6 }, { source: "flow", target: "derivatives", value: 0.55 }, { source: "derivatives", target: "risk", value: 0.7 }, { source: "liquidity", target: "risk", value: 0.5 }];
  return { nodes: runLayout(nodes, links, 100, 100, 22), links };
}

function agent(id: string, label: string, stanceText: string, evidence: string, conviction: number, tone: VizTone): AgentNode {
  return { id, label, stance: stanceText, evidence, conviction: clamp(conviction, 0.12, 1), tone, x: 50, y: 50 };
}

function priceMomentum(candles: TradeCandle[], market: PerpMarket) {
  const rows = candles.filter((row) => row.open > 0 && row.close > 0);
  return rows.length >= 2 ? finite(((rows.at(-1)!.close - rows[0].open) / rows[0].open) * 100) : finite(market.dayChangePct ?? 0);
}

function volatility(candles: TradeCandle[], market: PerpMarket) {
  if (candles.length < 2) return Math.abs(finite(market.dayChangePct ?? 0)) / 2;
  const changes = candles.slice(1).map((row, index) => Math.abs(((row.close - candles[index].close) / Math.max(candles[index].close, 1)) * 100));
  return finite(changes.reduce((sum, value) => sum + value, 0) / Math.max(changes.length, 1));
}

function orderBookImbalance(snapshot: VenueSnapshot | null) { const bid = depthUsd(snapshot?.bids); const ask = depthUsd(snapshot?.asks); return bid + ask > 0 ? finite((bid - ask) / (bid + ask)) : 0; }
function liveTradePressure(trades: LiveTrade[]) { const buy = trades.filter((trade) => trade.side === "buy").reduce((sum, trade) => sum + trade.size, 0); const sell = trades.filter((trade) => trade.side === "sell").reduce((sum, trade) => sum + trade.size, 0); return buy + sell > 0 ? finite((buy - sell) / (buy + sell)) : 0; }
function depthUsd(rows: VenueSnapshot["bids"] = []) { return rows.reduce((sum, row) => sum + row.price * row.size, 0); }
function marketPhase(momentum: number, volatilityValue: number, imbalance: number, pressure: number) { if (volatilityValue > 2.8) return "Storm"; if (Math.abs(momentum) > 1.2 && Math.sign(momentum) === Math.sign(pressure)) return "Trend"; if (Math.abs(imbalance) > 0.22) return "Pressure"; return "Range"; }
function stance(value: number) { if (value > 0.05) return "supports up"; if (value < -0.05) return "supports down"; return "mixed"; }
function positive(value: number) { return clamp(value / 100, 0, 1); }
function pct(value: number) { return `${signed(value)}%`; }
function signed(value: number) { const next = finite(value); return `${next > 0 ? "+" : ""}${next.toFixed(Math.abs(next) >= 10 ? 1 : 2)}`; }
function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, finite(value))); }
function finite(value: number | undefined) { return Number.isFinite(value) ? Number(value) : 0; }
