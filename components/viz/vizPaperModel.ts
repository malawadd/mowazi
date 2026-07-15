import { formatNumber, formatUsd } from "@/lib/trade/format";
import type { PerpMarket, VenueSnapshot } from "@/lib/trade/types";
import type { VizMetrics, VizTone } from "./vizMetrics";

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
  side: "support" | "risk";
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
    forceCard("momentum", "Price Momentum", "Last candles versus first loaded candle.", "Momentum", pick("momentum"), "link", "sky", "support"),
    forceCard("liquidity", "Liquidity Depth", "Bid and ask depth imbalance.", "Depth", pick("liquidity"), "faucet", "mint", "support"),
    forceCard("flow", "Trade Flow", "Live buy/sell print pressure.", "Tape", pick("flow"), "whale", "yellow", "support"),
    forceCard("funding", "Funding Rate", "Hourly funding proxy for derivatives pressure.", "Funding", pick("funding"), "gauge", "rose", "risk", true),
    forceCard("openInterest", "Position Risk", "Open interest weight against activity.", "OI / Volume", pick("openInterest"), "lock", "orange", "risk", true),
    forceCard("volume", "Activity Scale", "24h notional activity scale.", "Volume", pick("volume"), "globe", "lilac", "risk"),
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
  side: "support" | "risk",
  invert = false,
): PaperForceCard {
  const raw = (force?.polarity ?? 0) * (force?.magnitude ?? 0);
  const score = clamp(invert ? -Math.abs(raw) : raw, -1, 1);
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
    side,
  };
}

function buildStoryPhases(metrics: VizMetrics): PaperStoryPhase[] {
  const names = [
    ["Accumulation", "Quiet positioning while pressure builds.", "Foundation forms in slower prints.", "Base test", "whale", "mint"],
    ["Expansion", "Demand tries to clear local resistance.", "Trend validation comes from flow.", "Break attempt", "link", "sky"],
    ["Euphoria", "Momentum stretches and fragility rises.", "Large candles can invite leverage.", "Momentum burst", "rocket", "yellow"],
    ["Shock", "Fast adverse move or volatility pocket.", "Risk comes from crowded pressure.", "Volatility check", "globe", "rose"],
    ["Recovery", "Stabilization after the pressure flush.", "Confidence improves when flow confirms.", "Reclaim test", "shield", "lilac"],
  ] as const;
  const rows = metrics.story.length > 0 ? metrics.story : [{ id: "empty", changePct: 0, volumeScore: 0, tone: "paper" as VizTone }];
  return names.map(([title, detail, insight, catalyst, glyph, tone], index) => {
    const chunk = rows.slice(Math.floor((index * rows.length) / 5), Math.max(1, Math.floor(((index + 1) * rows.length) / 5)));
    return { id: title, title, detail, insight, catalyst, glyph, tone, changePct: average(chunk.map((row) => row.changePct)) };
  });
}

function buildPaperScenarios(metrics: VizMetrics, market: PerpMarket): PaperScenario[] {
  const icons: Record<string, VizGlyphName> = { squeeze: "bull", range: "scales", flush: "bear" };
  const targets = {
    squeeze: `Upper range: ${formatUsd((market.markPrice ?? 0) * 1.08, market.pricePrecision)}`,
    range: `Mean zone: ${formatUsd(market.markPrice ?? 0, market.pricePrecision)}`,
    flush: `Lower range: ${formatUsd((market.markPrice ?? 0) * 0.93, market.pricePrecision)}`,
  };
  const paths = {
    squeeze: [34, 30, 25, 21, 16, 12],
    range: [34, 31, 33, 30, 32, 31],
    flush: [34, 38, 43, 48, 53, 57],
  };
  return metrics.scenarios.map((scenario) => ({
    id: scenario.id,
    label: scenario.label.replace(" Branch", " Case"),
    stance: scenario.id === "squeeze" ? "bullish" : scenario.id === "flush" ? "bearish" : "neutral",
    probability: Math.round(clamp(scenario.score * 100, 0, 100)),
    trigger: scenario.trigger,
    invalidation: scenario.invalidation,
    target: targets[scenario.id as keyof typeof targets] ?? "Live-derived range",
    tone: scenario.tone,
    glyph: icons[scenario.id] ?? "scales",
    path: paths[scenario.id as keyof typeof paths] ?? paths.range,
  }));
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
