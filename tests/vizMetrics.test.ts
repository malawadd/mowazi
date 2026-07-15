import test from "node:test";
import assert from "node:assert/strict";
import { buildVisualizationMetrics } from "../components/viz/vizMetrics";
import { buildPaperVizModel } from "../components/viz/vizPaperModel";
import type { PerpMarket, VenueSnapshot } from "../lib/trade/types";

function market(overrides: Partial<PerpMarket> = {}): PerpMarket {
  return {
    id: "BTC",
    label: "BTC Perp",
    baseSymbol: "BTC",
    quoteSymbol: "USDC",
    category: "crypto",
    pricePrecision: 1,
    maxLeverage: 40,
    markPrice: 100,
    volume24hUsd: 1_000_000,
    openInterestUsd: 500_000,
    dayChangePct: 1.5,
    venues: ["hyperliquid"],
    ...overrides,
  };
}

function snapshot(): VenueSnapshot {
  return {
    venue: "hyperliquid",
    marketId: "BTC",
    midPrice: 100,
    bidPrice: 99.9,
    askPrice: 100.1,
    bids: [
      { price: 99.9, size: 5 },
      { price: 99.7, size: 8 },
    ],
    asks: [
      { price: 100.1, size: 3 },
      { price: 100.4, size: 4 },
    ],
    entryImpactBps: 0,
    exitImpactBps: 0,
    fundingRateHourly: 0.0000125,
    openInterestUsd: 650_000,
    volume24hUsd: 2_000_000,
    fetchedAt: 1,
    source: "public",
  };
}

test("visualization metrics tolerate empty live data", () => {
  const metrics = buildVisualizationMetrics({
    market: market(),
    markets: [],
    snapshot: null,
    candles: [],
    trades: [],
  });

  assert.equal(metrics.story.length, 1);
  assert.ok(metrics.forces.every((force) => Number.isFinite(force.magnitude)));
  assert.ok(metrics.agents.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
  assert.ok(metrics.scenarios.every((scenario) => Number.isFinite(scenario.score)));
  assert.ok(metrics.scenarios.every((scenario) => /uncertain|not a prediction/i.test(scenario.disclaimer)));
});

test("visualization metrics derive live scenarios and selected galaxy node", () => {
  const metrics = buildVisualizationMetrics({
    market: market(),
    markets: [market(), market({ id: "ETH", label: "ETH Perp", baseSymbol: "ETH", dayChangePct: -2, volume24hUsd: 800_000 })],
    snapshot: snapshot(),
    candles: [
      { time: 1, open: 100, high: 101, low: 99, close: 100, volume: 10 },
      { time: 2, open: 100, high: 104, low: 100, close: 103, volume: 20 },
      { time: 3, open: 103, high: 106, low: 102, close: 105, volume: 18 },
    ],
    trades: [
      { id: "1", price: 104, size: 2, side: "buy", time: 1 },
      { id: "2", price: 105, size: 1, side: "sell", time: 2 },
    ],
  });

  assert.ok(metrics.momentumPct > 0);
  assert.ok(metrics.scenarios.some((scenario) => scenario.id === "squeeze" && scenario.score > 0));
  assert.ok(metrics.galaxy.some((node) => node.id === "BTC" && node.selected));
});

test("paper visualization model keeps labels and scores finite with sparse data", () => {
  const metrics = buildVisualizationMetrics({
    market: market(),
    markets: [],
    snapshot: null,
    candles: [],
    trades: [],
  });
  const paper = buildPaperVizModel(metrics, market(), null);

  assert.equal(paper.forces.length, 6);
  assert.equal(paper.story.length, 5);
  assert.equal(paper.scenarios.length, 3);
  assert.ok(Number.isFinite(paper.synthesis.confidence));
  assert.ok(Number.isFinite(paper.synthesis.reversalRisk));
  assert.ok(Number.isFinite(paper.synthesis.disagreement));
  assert.ok(paper.scenarios.every((scenario) => scenario.probability >= 0 && scenario.probability <= 100));
  assert.match(paper.galaxy.sentiment, /Risk|Balanced/);
});

test("galaxy view model keeps a finite selected market bubble", () => {
  const metrics = buildVisualizationMetrics({
    market: market(),
    markets: [market(), market({ id: "SOL", label: "SOL Perp", baseSymbol: "SOL", dayChangePct: 4, volume24hUsd: 2_000_000 })],
    snapshot: snapshot(),
    candles: [],
    trades: [],
  });
  const selected = metrics.galaxy.find((node) => node.id === "BTC");
  const paper = buildPaperVizModel(metrics, market(), snapshot());

  assert.ok(selected?.selected);
  assert.ok(Number.isFinite(selected.x));
  assert.ok(Number.isFinite(selected.y));
  assert.ok(Number.isFinite(selected.radius));
  assert.notEqual(paper.galaxy.strength, "");
  assert.notEqual(paper.galaxy.volatility, "");
});
