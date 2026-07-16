import test from "node:test";
import assert from "node:assert/strict";
import { buildVisualizationMetrics } from "../components/viz/vizMetrics";
import { buildPaperVizModel } from "../components/viz/vizPaperModel";
import { projectGalaxyForMobile } from "../components/viz/vizGalaxyModel";
import { buildConnectorPath, settleForceOffset } from "../components/viz/vizLayout";
import { normalizePercentages } from "../components/viz/vizMath";
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
    fundingRateHourly: 0.0000125,
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

test("scenario weights normalize to an exact finite 100 percent", () => {
  const normalized = normalizePercentages([Number.NaN, 3.4, 8.1]);
  assert.equal(normalized.reduce((sum, value) => sum + value, 0), 100);
  assert.ok(normalized.every((value) => Number.isFinite(value) && value >= 0));

  const metrics = buildVisualizationMetrics({ market: market(), markets: [], snapshot: null, candles: [], trades: [] });
  const paper = buildPaperVizModel(metrics, market(), null);
  assert.equal(paper.scenarios.reduce((sum, scenario) => sum + scenario.probability, 0), 100);
  assert.ok(paper.scenarios.every((scenario) => /not a prediction/i.test(scenario.disclaimer)));
});

test("galaxy layout is deterministic, bounded, and collision free", () => {
  const ids = ["BTC", "ETH", "SOL", "HYPE", "XRP", "DOGE", "AAVE", "NEAR", "CASHCAT", "LINK", "SUI", "LIT", "XMR", "ZEC", "PUMP", "WLD", "XPL", "FARTCOIN", "ADA", "AVAX"];
  const markets = ids.map((id, index) => market({ id, label: `${id} Perp`, baseSymbol: id, volume24hUsd: 5_000_000 - index * 120_000, openInterestUsd: 2_000_000 - index * 40_000, dayChangePct: index % 2 ? -index / 3 : index / 4 }));
  const first = buildVisualizationMetrics({ market: markets[0], markets, snapshot: null, candles: [], trades: [] }).galaxy;
  const second = buildVisualizationMetrics({ market: markets[0], markets, snapshot: null, candles: [], trades: [] }).galaxy;
  const mobile = projectGalaxyForMobile(first);

  assert.equal(first.length, 18);
  assert.deepEqual(first.map(({ id, x, y }) => ({ id, x, y })), second.map(({ id, x, y }) => ({ id, x, y })));
  assert.ok(first.some((node) => node.id === "BTC" && node.selected));
  assert.ok(first.some((node) => node.label === "CASHCAT"));
  assertBounded(first, 1000, 520);
  assertBounded(mobile, 360, 650);
  assertNoCircleCollisions(first);
  assertNoCircleCollisions(mobile);
});

test("force connector and release layouts stay finite and bounded", () => {
  const slots = {
    a: { x: 20, y: 20, width: 120, height: 80 },
    b: { x: 160, y: 20, width: 120, height: 80 },
  };
  const offset = settleForceOffset("a", { x: 500, y: -500 }, slots, {}, { width: 320, height: 220 });
  const desktop = buildConnectorPath(slots.a, { x: 130, y: 110, width: 60, height: 60 }, 0.7, 320);
  const mobile = buildConnectorPath(slots.b, { x: 130, y: 110, width: 60, height: 60 }, -0.7, 320);

  assert.deepEqual(offset, { x: 180, y: -20 });
  assert.ok(!/NaN|Infinity/.test(`${desktop.path}${desktop.badge.x}${desktop.badge.y}`));
  assert.ok(!/NaN|Infinity/.test(`${mobile.path}${mobile.badge.x}${mobile.badge.y}`));
});

function assertBounded(nodes: Array<{ x: number; y: number; radius: number }>, width: number, height: number) {
  nodes.forEach((node) => {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.radius));
    assert.ok(node.x - node.radius >= 0 && node.x + node.radius <= width);
    assert.ok(node.y - node.radius >= 0 && node.y + node.radius <= height);
  });
}

function assertNoCircleCollisions(nodes: Array<{ x: number; y: number; radius: number }>) {
  for (let index = 0; index < nodes.length; index += 1) {
    for (let other = index + 1; other < nodes.length; other += 1) {
      const a = nodes[index];
      const b = nodes[other];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) + 1 >= a.radius + b.radius, `bubble ${index} overlaps ${other}`);
    }
  }
}
