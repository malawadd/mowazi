import { canonicalHyperliquidCoin } from "@/lib/trade/hyperliquidMarkets";
import type { PerpMarket } from "@/lib/trade/types";
import { runOrbitalLayout } from "./vizLayout";
import type { VizTone } from "./vizMetrics";

export type GalaxyNode = {
  id: string;
  label: string;
  changePct: number;
  weight: number;
  radius: number;
  tone: VizTone;
  selected: boolean;
  major: boolean;
  tier: 0 | 1 | 2 | 3;
  x: number;
  y: number;
  markPrice: number;
  pricePrecision: number;
  volume24hUsd: number;
  openInterestUsd: number;
  fundingRateHourly: number;
  maxLeverage: number;
};

export type GalaxyRenderNode = GalaxyNode & { renderRadius: number };

const WIDTH = 1000;
const HEIGHT = 520;
const RINGS = {
  1: { rx: 220, ry: 128 },
  2: { rx: 345, ry: 200 },
  3: { rx: 455, ry: 236 },
} as const;

export function buildGalaxy(markets: PerpMarket[], selectedCoin: string): GalaxyNode[] {
  const selected = canonicalHyperliquidCoin(selectedCoin);
  const active = markets.filter((market) => !market.isDelisted);
  const ranked = [...active].sort((a, b) => marketWeight(b) - marketWeight(a));
  const selectedMarket = active.find((market) => canonicalHyperliquidCoin(market.id) === selected);
  const visible = ranked.filter((market) => canonicalHyperliquidCoin(market.id) !== selected).slice(0, 17);
  if (selectedMarket) visible.unshift(selectedMarket);
  const maxWeight = Math.max(...visible.map(marketWeight), 1);
  const tierCounts = { 1: 0, 2: 0, 3: 0 };
  const seeded = visible.map((market, index) => {
    const isSelected = canonicalHyperliquidCoin(market.id) === selected;
    const tier = isSelected ? 0 : index <= 4 ? 1 : index <= 10 ? 2 : 3;
    if (tier > 0) tierCounts[tier as 1 | 2 | 3] += 1;
    return { market, index, isSelected, tier: tier as 0 | 1 | 2 | 3 };
  });
  const tierIndex = { 1: 0, 2: 0, 3: 0 };
  const layoutInput = seeded.map(({ market, index, isSelected, tier }) => {
    const weight = marketWeight(market);
    const radius = isSelected ? 72 : clamp(18 + 31 * Math.sqrt(weight / maxWeight), 18, 49);
    let targetX = WIDTH / 2;
    let targetY = HEIGHT / 2;
    if (tier > 0) {
      const ringTier = tier as 1 | 2 | 3;
      const position = tierIndex[ringTier]++;
      const angle = -Math.PI / 2 + (position / Math.max(1, tierCounts[ringTier])) * Math.PI * 2 + ringTier * 0.27;
      targetX += Math.cos(angle) * RINGS[ringTier].rx;
      targetY += Math.sin(angle) * RINGS[ringTier].ry;
    }
    return { id: market.id, radius, targetX, targetY, fixed: isSelected, market, index, isSelected, tier };
  });
  return runOrbitalLayout(layoutInput, WIDTH, HEIGHT).map((node) => toGalaxyNode(node.market, node.index, node.isSelected, node.tier, node.radius, node.x, node.y));
}

export function projectGalaxyForMobile(nodes: GalaxyNode[]): GalaxyRenderNode[] {
  const tierCounts = { 1: 0, 2: 0, 3: 0 };
  nodes.forEach((node) => { if (node.tier > 0) tierCounts[node.tier as 1 | 2 | 3] += 1; });
  const tierIndex = { 1: 0, 2: 0, 3: 0 };
  const rings = { 1: { rx: 102, ry: 106 }, 2: { rx: 150, ry: 196 }, 3: { rx: 174, ry: 286 } } as const;
  const projected = nodes.map((node) => {
    const renderRadius = node.selected ? 48 : node.major ? clamp(node.radius * .7, 27, 34) : clamp(node.radius * .55, 15, 18);
    if (node.tier === 0) return { ...node, radius: renderRadius, renderRadius, targetX: 180, targetY: 290, fixed: true };
    const tier = node.tier as 1 | 2 | 3;
    const index = tierIndex[tier]++;
    const angle = -Math.PI / 2 + (index / Math.max(1, tierCounts[tier])) * Math.PI * 2 + tier * .31;
    return { ...node, radius: renderRadius, renderRadius, targetX: 180 + Math.cos(angle) * rings[tier].rx, targetY: 322 + Math.sin(angle) * rings[tier].ry, fixed: false };
  });
  return runOrbitalLayout(projected, 360, 650).map((node) => ({ ...node, renderRadius: node.radius }));
}

function toGalaxyNode(market: PerpMarket, index: number, selected: boolean, tier: 0 | 1 | 2 | 3, radius: number, x: number, y: number): GalaxyNode {
  const changePct = finite(market.dayChangePct);
  return {
    id: market.id,
    label: market.id,
    changePct,
    weight: marketWeight(market),
    radius,
    tone: selected ? "yellow" : Math.abs(changePct) < 0.35 ? "sky" : changePct > 0 ? "mint" : "rose",
    selected,
    major: selected || index <= 11,
    tier,
    x,
    y,
    markPrice: finite(market.markPrice),
    pricePrecision: market.pricePrecision,
    volume24hUsd: finite(market.volume24hUsd),
    openInterestUsd: finite(market.openInterestUsd),
    fundingRateHourly: finite(market.fundingRateHourly),
    maxLeverage: market.maxLeverage,
  };
}

function marketWeight(market: PerpMarket) {
  return Math.max(0, finite(market.volume24hUsd) + finite(market.openInterestUsd) * 0.8);
}

function finite(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
