import { canonicalHyperliquidCoin } from "@/lib/trade/hyperliquidMarkets";
import type { PerpMarket, VenueSnapshot } from "@/lib/trade/types";
import type { LiveTrade, TradeCandle } from "../trade/useHyperliquidFeed";
import { runLayout } from "./vizLayout";
export type VizTone = "yellow" | "sky" | "mint" | "orange" | "lilac" | "rose" | "paper";
export type ForceVector = {
  id: string;
  label: string;
  valueLabel: string;
  evidence: string;
  magnitude: number;
  polarity: number;
  angle: number;
  x: number;
  y: number;
  tone: VizTone;
};
export type StorySegment = {
  id: string;
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
export type AgentNode = {
  id: string;
  label: string;
  stance: string;
  evidence: string;
  conviction: number;
  tone: VizTone;
  x: number;
  y: number;
};
export type AgentLink = { source: string; target: string; value: number };
export type GalaxyNode = {
  id: string;
  label: string;
  changePct: number;
  weight: number;
  radius: number;
  tone: VizTone;
  selected: boolean;
  x: number;
  y: number;
};
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
  const phase = marketPhase(momentumPct, volatilityPct, liquidityImbalance, tradePressure);

  return {
    phase,
    momentumPct,
    volatilityPct,
    liquidityImbalance,
    tradePressure,
    forces: buildForces({ momentumPct, volatilityPct, liquidityImbalance, tradePressure, fundingBps, volume, openInterest }),
    story: buildStory(input.candles),
    scenarios: buildScenarios({ momentumPct, volatilityPct, liquidityImbalance, tradePressure, fundingBps }),
    agents: buildAgents({ momentumPct, volatilityPct, liquidityImbalance, tradePressure, fundingBps }),
    galaxy: buildGalaxy(input.markets, input.market.id),
  };
}

function buildForces(args: {
  momentumPct: number;
  volatilityPct: number;
  liquidityImbalance: number;
  tradePressure: number;
  fundingBps: number;
  volume: number;
  openInterest: number;
}): ForceVector[] {
  const volumeScore = clamp(Math.log10(Math.max(10, args.volume)) / 11, 0.12, 1);
  const oiScore = clamp(args.openInterest / Math.max(args.volume, 1), 0.1, 1);
  return [
    vector("momentum", "Momentum", pct(args.momentumPct), "Last loaded candles versus first candle.", args.momentumPct, 18, 24, "sky"),
    vector("liquidity", "Liquidity", pct(args.liquidityImbalance * 100), "Bid and ask depth imbalance.", args.liquidityImbalance * 100, 48, 35, "mint"),
    vector("flow", "Trade Flow", pct(args.tradePressure * 100), "Live buy/sell print pressure.", args.tradePressure * 100, 76, 24, "orange"),
    vector("funding", "Funding", `${signed(args.fundingBps)} bps/h`, "Hourly funding pressure.", args.fundingBps, 26, 72, "lilac"),
    vector("openInterest", "Open Interest", pct(oiScore * 100), "OI weight against 24h volume.", oiScore * 100, 56, 68, "rose"),
    vector("volume", "Volume", pct(volumeScore * 100), "24h notional activity scale.", volumeScore * 100, 84, 70, "paper"),
  ];
}

function vector(
  id: string,
  label: string,
  valueLabel: string,
  evidence: string,
  raw: number,
  x: number,
  y: number,
  tone: VizTone,
): ForceVector {
  const polarity = raw === 0 ? 0 : raw > 0 ? 1 : -1;
  const magnitude = clamp(Math.abs(raw) / 8, 0.08, 1);
  return { id, label, valueLabel, evidence, magnitude, polarity, angle: 35 + polarity * 35, x, y, tone };
}

function buildStory(candles: TradeCandle[]): StorySegment[] {
  const rows = candles.slice(-28);
  const maxVolume = Math.max(...rows.map((row) => row.volume), 1);
  if (rows.length === 0) return [{ id: "empty", changePct: 0, volumeScore: 0.15, tone: "paper" }];
  return rows.map((row) => {
    const changePct = row.open > 0 ? ((row.close - row.open) / row.open) * 100 : 0;
    return {
      id: String(row.time),
      changePct: finite(changePct),
      volumeScore: clamp(row.volume / maxVolume, 0.1, 1),
      tone: changePct >= 0 ? "mint" : "rose",
    };
  });
}

function buildScenarios(args: {
  momentumPct: number;
  volatilityPct: number;
  liquidityImbalance: number;
  tradePressure: number;
  fundingBps: number;
}): ScenarioBranch[] {
  const longPressure = positive(args.momentumPct) + positive(args.tradePressure * 100) + positive(args.liquidityImbalance * 100);
  const shortPressure = positive(-args.momentumPct) + positive(-args.tradePressure * 100) + positive(-args.liquidityImbalance * 100);
  const risk = clamp((args.volatilityPct + Math.abs(args.fundingBps)) / 8, 0, 1);
  const scenarios: ScenarioBranch[] = [
    {
      id: "squeeze",
      label: "Squeeze Branch",
      score: clamp((longPressure / 3 + risk) / 2, 0, 1),
      tone: "mint",
      trigger: "Momentum and live prints keep leaning bid.",
      invalidation: "Bid depth flips negative or momentum stalls.",
      disclaimer: "Uncertain path, not a prediction.",
    },
    {
      id: "range",
      label: "Range Branch",
      score: clamp(1 - (Math.abs(args.momentumPct) / 8 + args.volatilityPct / 8 + Math.abs(args.tradePressure)) / 3, 0, 1),
      tone: "sky",
      trigger: "Volatility cools while liquidity stays balanced.",
      invalidation: "Funding or trade pressure breaks from neutral.",
      disclaimer: "Uncertain path, not a prediction.",
    },
    {
      id: "flush",
      label: "Flush Branch",
      score: clamp((shortPressure / 3 + risk) / 2, 0, 1),
      tone: "rose",
      trigger: "Sell prints and ask-side pressure accelerate.",
      invalidation: "Buy flow absorbs the move near current depth.",
      disclaimer: "Uncertain path, not a prediction.",
    },
  ];
  return scenarios.map((item) => ({ ...item, score: finite(item.score) }));
}

function buildAgents(args: {
  momentumPct: number;
  volatilityPct: number;
  liquidityImbalance: number;
  tradePressure: number;
  fundingBps: number;
}) {
  const nodes = layoutAgentNodes([
    agent("price", "Price", stance(args.momentumPct), pct(args.momentumPct), Math.abs(args.momentumPct) / 8, "sky"),
    agent("liquidity", "Liquidity", stance(args.liquidityImbalance), pct(args.liquidityImbalance * 100), Math.abs(args.liquidityImbalance), "mint"),
    agent("flow", "Flow", stance(args.tradePressure), pct(args.tradePressure * 100), Math.abs(args.tradePressure), "orange"),
    agent("derivatives", "Derivatives", stance(args.fundingBps), `${signed(args.fundingBps)} bps/h`, Math.abs(args.fundingBps) / 8, "lilac"),
    agent("risk", "Risk", args.volatilityPct > 2 ? "elevated" : "contained", pct(args.volatilityPct), args.volatilityPct / 8, "rose"),
  ]);
  const links = [
    { source: "price", target: "flow", value: 0.7 },
    { source: "price", target: "liquidity", value: 0.6 },
    { source: "flow", target: "derivatives", value: 0.55 },
    { source: "derivatives", target: "risk", value: 0.7 },
    { source: "liquidity", target: "risk", value: 0.5 },
  ];
  return { nodes, links };
}

function agent(id: string, label: string, stanceText: string, evidence: string, conviction: number, tone: VizTone): AgentNode {
  return { id, label, stance: stanceText, evidence, conviction: clamp(conviction, 0.12, 1), tone, x: 50, y: 50 };
}

function layoutAgentNodes(nodes: AgentNode[]): AgentNode[] {
  const links: AgentLink[] = [
    { source: "price", target: "flow", value: 0.7 },
    { source: "price", target: "liquidity", value: 0.6 },
    { source: "flow", target: "derivatives", value: 0.55 },
    { source: "derivatives", target: "risk", value: 0.7 },
    { source: "liquidity", target: "risk", value: 0.5 },
  ];
  return runLayout(nodes, links, 100, 100, 22).map((node) => ({ ...node, x: node.x, y: node.y }));
}

function buildGalaxy(markets: PerpMarket[], selectedCoin: string): GalaxyNode[] {
  const selected = canonicalHyperliquidCoin(selectedCoin);
  const ranked = [...markets]
    .filter((market) => !market.isDelisted)
    .sort((a, b) => marketWeight(b) - marketWeight(a))
    .slice(0, 36);
  const selectedMarket = markets.find((market) => canonicalHyperliquidCoin(market.id) === selected);
  if (selectedMarket && !ranked.some((market) => canonicalHyperliquidCoin(market.id) === selected)) ranked[ranked.length - 1] = selectedMarket;
  const maxWeight = Math.max(...ranked.map(marketWeight), 1);
  const nodes = ranked.map((market, index) => {
    const changePct = finite(market.dayChangePct ?? 0);
    const selectedNode = canonicalHyperliquidCoin(market.id) === selected;
    return {
      id: market.id,
      label: market.id,
      changePct,
      weight: marketWeight(market),
      radius: 7 + 15 * Math.sqrt(marketWeight(market) / maxWeight),
      tone: selectedNode ? "yellow" : changePct >= 0 ? "mint" : "rose",
      selected: selectedNode,
      targetX: 50 + clamp(changePct / 10, -1, 1) * 30,
      targetY: 16 + (index % 6) * 13,
      x: 50,
      y: 50,
    } as GalaxyNode & { targetX: number; targetY: number };
  });
  return runLayout(nodes, [], 100, 100, 18).map((node) => ({
    id: node.id, label: node.label, changePct: node.changePct, weight: node.weight, radius: node.radius,
    tone: node.tone, selected: node.selected, x: node.x, y: node.y,
  }));
}

function priceMomentum(candles: TradeCandle[], market: PerpMarket) {
  const rows = candles.filter((row) => row.open > 0 && row.close > 0);
  if (rows.length >= 2) return finite(((rows[rows.length - 1].close - rows[0].open) / rows[0].open) * 100);
  return finite(market.dayChangePct ?? 0);
}

function volatility(candles: TradeCandle[], market: PerpMarket) {
  if (candles.length < 2) return Math.abs(finite(market.dayChangePct ?? 0)) / 2;
  const changes = candles.slice(1).map((row, index) => Math.abs(((row.close - candles[index].close) / Math.max(candles[index].close, 1)) * 100));
  return finite(changes.reduce((sum, value) => sum + value, 0) / Math.max(changes.length, 1));
}

function orderBookImbalance(snapshot: VenueSnapshot | null) {
  const bid = depthUsd(snapshot?.bids);
  const ask = depthUsd(snapshot?.asks);
  return bid + ask > 0 ? finite((bid - ask) / (bid + ask)) : 0;
}

function liveTradePressure(trades: LiveTrade[]) {
  const buy = trades.filter((trade) => trade.side === "buy").reduce((sum, trade) => sum + trade.size, 0);
  const sell = trades.filter((trade) => trade.side === "sell").reduce((sum, trade) => sum + trade.size, 0);
  return buy + sell > 0 ? finite((buy - sell) / (buy + sell)) : 0;
}

function depthUsd(rows: VenueSnapshot["bids"] = []) {
  return rows.reduce((sum, row) => sum + row.price * row.size, 0);
}

function marketPhase(momentumPct: number, volatilityPct: number, imbalance: number, pressure: number) {
  if (volatilityPct > 2.8) return "Storm";
  if (Math.abs(momentumPct) > 1.2 && Math.sign(momentumPct) === Math.sign(pressure)) return "Trend";
  if (Math.abs(imbalance) > 0.22) return "Pressure";
  return "Range";
}

function marketWeight(market: PerpMarket) {
  return Math.max(0, finite(market.volume24hUsd ?? 0) + finite(market.openInterestUsd ?? 0) * 0.8);
}

function stance(value: number) {
  if (value > 0.05) return "supports up";
  if (value < -0.05) return "supports down";
  return "mixed";
}

function positive(value: number) {
  return clamp(value / 100, 0, 1);
}

function pct(value: number) {
  return `${signed(value)}%`;
}

function signed(value: number) {
  const next = finite(value);
  return `${next > 0 ? "+" : ""}${next.toFixed(Math.abs(next) >= 10 ? 1 : 2)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, finite(value)));
}

function finite(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}
