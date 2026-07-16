import { formatNumber, formatUsd } from "@/lib/trade/format";
import type { PerpMarket, VenueSnapshot } from "@/lib/trade/types";
import type { VizMetrics, VizTone } from "./vizMetrics";
import { normalizePercentages } from "./vizMath";

export type VizGlyphName = "coin" | "whale" | "faucet" | "link" | "gauge" | "globe" | "lock" | "bull" | "scales" | "bear" | "rocket" | "shield";
export type VizStance = "bullish" | "bearish" | "neutral";

export type PaperForceCard = {
  id: string;
  title: string;
  stance: VizStance;
  value: string;
  detail: string;
  meta: string;
  score: number;
  tone: VizTone;
  glyph: VizGlyphName;
  column: "market" | "leverage";
};

export type PaperScenario = {
  id: string;
  label: string;
  stance: VizStance;
  probability: number;
  trigger: string;
  invalidation: string;
  target: string;
  tone: VizTone;
  glyph: VizGlyphName;
  path: number[];
  disclaimer: string;
};

export type PaperAgent = {
  id: string;
  title: string;
  stance: VizStance;
  confidence: number;
  evidence: string;
  tone: VizTone;
  glyph: VizGlyphName;
};

export type PaperStoryPhase = {
  id: string;
  title: string;
  detail: string;
  insight: string;
  catalyst: string;
  catalystTime: string;
  timeRange: string;
  startPrice: number;
  endPrice: number;
  highPrice: number;
  lowPrice: number;
  volumeIntensity: number;
  changePct: number;
  tone: VizTone;
  glyph: VizGlyphName;
};

export type PaperVizModel = {
  marketState: {
    coin: string;
    price: string;
    change: string;
    volume: string;
    openInterest: string;
    capturedAt: string;
  };
  forces: PaperForceCard[];
  story: PaperStoryPhase[];
  scenarios: PaperScenario[];
  agents: PaperAgent[];
  synthesis: {
    stance: VizStance;
    label: string;
    confidence: number;
    reversalRisk: number;
    disagreement: number;
    conflictDrivers: string[];
    netImpact: number;
  };
  galaxy: {
    strength: string;
    sentiment: string;
    volatility: string;
  };
};

export function buildPaperVizModel(metrics: VizMetrics, market: PerpMarket, snapshot: VenueSnapshot | null): PaperVizModel {
  const forces = buildForceCards(metrics);
  const netImpact = average(forces.map((force) => force.score));
  const confidence = clamp(48 + Math.abs(netImpact) * 34 + agreement(forces) * 18, 8, 96);
  const reversalRisk = clamp(metrics.volatilityPct * 11 + (1 - agreement(forces)) * 34 + Math.abs(metrics.tradePressure) * 12, 4, 96);
  const disagreement = clamp((1 - agreement(forces)) * 75 + metrics.volatilityPct * 7, 0, 100);

  return {
    marketState: {
      coin: market.id,
      price: formatUsd(snapshot?.markPrice ?? market.markPrice, market.pricePrecision),
      change: signed(metrics.momentumPct, "%"),
      volume: formatUsd(snapshot?.volume24hUsd ?? market.volume24hUsd, 0),
      openInterest: formatUsd(snapshot?.openInterestUsd ?? market.openInterestUsd, 0),
      capturedAt: new Date(snapshot?.fetchedAt ?? Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    },
    forces,
    story: buildStoryPhases(metrics),
    scenarios: buildPaperScenarios(metrics, market),
    agents: buildPaperAgents(metrics),
    synthesis: {
      stance: stance(netImpact),
      label: synthesisLabel(netImpact, reversalRisk),
      confidence: Math.round(confidence),
      reversalRisk: Math.round(reversalRisk),
      disagreement: Math.round(disagreement),
      conflictDrivers: buildConflictDrivers(forces),
      netImpact: Number(netImpact.toFixed(2)),
    },
    galaxy: {
      strength: Math.abs(metrics.momentumPct) > 1 ? "Strong" : Math.abs(metrics.momentumPct) > 0.35 ? "Firm" : "Mixed",
      sentiment: metrics.tradePressure > 0.05 ? "Risk-on" : metrics.tradePressure < -0.05 ? "Risk-off" : "Balanced",
      volatility: metrics.volatilityPct > 2.4 ? "High" : metrics.volatilityPct > 0.8 ? "Medium" : "Low",
    },
  };
}

function buildForceCards(metrics: VizMetrics): PaperForceCard[] {
  const byId = new Map(metrics.forces.map((force) => [force.id, force]));
  const pick = (id: string) => byId.get(id);
  return [
    forceCard("momentum", "Price Momentum", "Loaded candle direction.", "Momentum", pick("momentum"), "link", "sky", "market"),
    forceCard("liquidity", "Liquidity Depth", "Bid versus ask depth.", "Order book", pick("liquidity"), "faucet", "mint", "market"),
    forceCard("flow", "Trade Flow", "Live buy versus sell prints.", "Live tape", pick("flow"), "whale", "yellow", "market"),
    forceCard("funding", "Funding Rate", "Hourly derivatives carry pressure.", "Funding", pick("funding"), "gauge", "rose", "leverage"),
    forceCard("openInterest", "Position Risk", "Open interest relative to activity.", "OI / volume", pick("openInterest"), "lock", "orange", "leverage"),
    forceCard("volume", "Activity Scale", "24h notional activity intensity.", "Volume", pick("volume"), "globe", "lilac", "leverage"),
  ];
}

function forceCard(
  id: string,
  title: string,
  detail: string,
  meta: string,
  force: VizMetrics["forces"][number] | undefined,
  glyph: VizGlyphName,
  tone: VizTone,
  column: "market" | "leverage",
): PaperForceCard {
  const raw = (force?.polarity ?? 0) * (force?.magnitude ?? 0);
  const score = clamp(raw, -1, 1);
  return {
    id,
    title,
    stance: stance(score),
    value: force?.valueLabel ?? "0.00%",
    detail,
    meta,
    score,
    tone,
    glyph,
    column,
  };
}

function buildStoryPhases(metrics: VizMetrics): PaperStoryPhase[] {
  const rows = metrics.story.length > 0 ? metrics.story : [{ id: "empty", time: 0, open: 0, close: 0, high: 0, low: 0, changePct: 0, volumeScore: 0, tone: "paper" as VizTone }];
  let previousChange = 0;
  return Array.from({ length: 5 }, (_, index) => {
    const start = Math.floor((index * rows.length) / 5);
    const end = Math.max(start + 1, Math.floor(((index + 1) * rows.length) / 5));
    const chunk = rows.slice(start, end);
    const first = chunk[0] ?? rows[0];
    const last = chunk.at(-1) ?? first;
    const changePct = first.open > 0 ? ((last.close - first.open) / first.open) * 100 : average(chunk.map((row) => row.changePct));
    const volumeIntensity = average(chunk.map((row) => row.volumeScore));
    const phase = detectPhase(changePct, volumeIntensity, previousChange);
    previousChange = changePct;
    const event = [...chunk].sort((a, b) => b.volumeScore - a.volumeScore)[0] ?? first;
    return {
      id: `${index}-${phase.title}`,
      title: phase.title,
      detail: phase.detail,
      insight: phase.insight,
      catalyst: volumeIntensity > 0.64 ? "Volume spike" : changePct > 0.2 ? "Local high" : changePct < -0.2 ? "Local low" : "Range hold",
      catalystTime: formatTime(event.time),
      timeRange: `${formatTime(first.time)} - ${formatTime(last.time)}`,
      startPrice: finite(first.open), endPrice: finite(last.close),
      highPrice: Math.max(...chunk.map((row) => finite(row.high)), finite(last.close)),
      lowPrice: Math.min(...chunk.map((row) => finite(row.low)), finite(last.close)),
      volumeIntensity,
      glyph: phase.glyph,
      tone: phase.tone,
      changePct: finite(changePct),
    };
  });
}

function buildPaperScenarios(metrics: VizMetrics, market: PerpMarket): PaperScenario[] {
  const icons: Record<string, VizGlyphName> = { squeeze: "bull", range: "scales", flush: "bear" };
  const targets = {
    squeeze: `Upper range: ${formatUsd((market.markPrice ?? 0) * 1.08, market.pricePrecision)}`,
    range: `Mean zone: ${formatUsd(market.markPrice ?? 0, market.pricePrecision)}`,
    flush: `Lower range: ${formatUsd((market.markPrice ?? 0) * 0.93, market.pricePrecision)}`,
  };
  const price = finite(market.markPrice ?? 0);
  const paths = {
    squeeze: [price, price * 1.01, price * 1.018, price * 1.032, price * 1.05, price * 1.08],
    range: [price, price * 0.995, price * 1.004, price * 0.997, price * 1.002, price],
    flush: [price, price * 0.99, price * 0.982, price * 0.965, price * 0.948, price * 0.93],
  };
  const probabilities = normalizePercentages(metrics.scenarios.map((scenario) => scenario.score));
  return metrics.scenarios.map((scenario, index) => ({
    id: scenario.id,
    label: scenario.label.replace(" Branch", " Case"),
    stance: scenario.id === "squeeze" ? "bullish" : scenario.id === "flush" ? "bearish" : "neutral",
    probability: probabilities[index],
    trigger: scenario.trigger,
    invalidation: scenario.invalidation,
    target: targets[scenario.id as keyof typeof targets] ?? "Live-derived range",
    tone: scenario.tone,
    glyph: icons[scenario.id] ?? "scales",
    path: paths[scenario.id as keyof typeof paths] ?? paths.range,
    disclaimer: scenario.disclaimer,
  }));
}

function detectPhase(change: number, volume: number, previous: number): Pick<PaperStoryPhase, "title" | "detail" | "insight" | "tone" | "glyph"> {
  if (change < -0.75) return { title: "Shock", detail: "Price moved sharply lower in this window.", insight: "Risk expanded with the adverse move.", tone: "rose", glyph: "globe" };
  if (previous < -0.35 && change > 0.2) return { title: "Recovery", detail: "Price reclaimed part of the prior decline.", insight: "Follow-through matters more than the first bounce.", tone: "lilac", glyph: "shield" };
  if (change > 0.85 && volume > 0.58) return { title: "Euphoria", detail: "Momentum and activity accelerated together.", insight: "Fast gains can increase fragility.", tone: "yellow", glyph: "rocket" };
  if (change > 0.18) return { title: "Expansion", detail: "Price advanced through the window.", insight: "Flow is validating the directional move.", tone: "sky", glyph: "link" };
  return { title: "Accumulation", detail: "Price stayed comparatively compressed.", insight: "A quieter range is forming the next decision point.", tone: "mint", glyph: "whale" };
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "Now";
  const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
  return new Date(milliseconds).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function buildPaperAgents(metrics: VizMetrics): PaperAgent[] {
  const icons: Record<string, VizGlyphName> = { price: "link", liquidity: "faucet", flow: "whale", derivatives: "gauge", risk: "shield" };
  return metrics.agents.nodes.map((node) => ({
    id: node.id,
    title: `${node.label} Agent`,
    stance: node.stance.includes("up") || node.stance === "contained" ? "bullish" : node.stance.includes("down") || node.stance === "elevated" ? "bearish" : "neutral",
    confidence: Math.round(clamp(node.conviction * 100, 0, 100)),
    evidence: node.evidence,
    tone: node.tone,
    glyph: icons[node.id] ?? "coin",
  }));
}

function buildConflictDrivers(forces: PaperForceCard[]) {
  const drivers = forces.filter((force) => Math.abs(force.score) > 0.28).sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 3);
  return drivers.length > 0 ? drivers.map((force) => `${force.title}: ${force.value}`) : ["Signals are mixed and low intensity.", "Confidence depends on fresh prints.", "Uncertain path, not a prediction."];
}

function agreement(forces: PaperForceCard[]) {
  const signed = forces.filter((force) => Math.abs(force.score) > 0.08);
  if (signed.length === 0) return 0.5;
  const positive = signed.filter((force) => force.score > 0).length;
  return Math.max(positive, signed.length - positive) / signed.length;
}

function synthesisLabel(score: number, risk: number) {
  if (Math.abs(score) < 0.08) return "Mixed / Watchful";
  const word = score > 0 ? "Bullish" : "Bearish";
  return risk > 55 ? `Cautiously ${word}` : word;
}

function stance(score: number): VizStance {
  if (score > 0.08) return "bullish";
  if (score < -0.08) return "bearish";
  return "neutral";
}

function average(values: number[]) {
  return values.length > 0 ? values.reduce((sum, value) => sum + finite(value), 0) / values.length : 0;
}

function signed(value: number, suffix = "") {
  const next = finite(value);
  return `${next > 0 ? "+" : ""}${formatNumber(next, Math.abs(next) >= 10 ? 1 : 2)}${suffix}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, finite(value)));
}

function finite(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}
