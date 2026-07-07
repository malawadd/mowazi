import { PERP_MARKETS, TRADE_VENUE_PRIORITY } from "./markets";
import type { TradeVenueId, VenueSnapshot } from "./types";

type SnapshotSeed = Omit<VenueSnapshot, "venue" | "marketId" | "fetchedAt" | "source">;

const BASE_PRICES: Record<string, number> = {
  "BTC-PERP": 109420,
  "ETH-PERP": 3650,
  "SOL-PERP": 162.4,
  "LINK-PERP": 14.82,
  "XAU/USD": 2358.4,
  "USOIL/USD": 81.25,
  "EUR/USD": 1.0842,
  US100: 20480,
};

const VENUE_SKEW: Record<TradeVenueId, number> = {
  hyperliquid: 0,
  lighter: -0.00018,
  orderly: 0.00026,
  gmx: 0.0004,
  ostium: -0.0001,
};

const IMPACT_BPS: Record<TradeVenueId, [number, number]> = {
  hyperliquid: [5.5, 6.2],
  lighter: [4.4, 5.1],
  orderly: [6.8, 7.2],
  gmx: [8.5, 9.2],
  ostium: [7.1, 7.8],
};

const FUNDING_HOURLY: Record<TradeVenueId, number> = {
  hyperliquid: 0.000012,
  lighter: 0.000008,
  orderly: 0.000014,
  gmx: 0.00001,
  ostium: 0.000018,
};

export function getFixtureVenueSnapshots(marketId: string, now = Date.now()) {
  const market = PERP_MARKETS.find((item) => item.id === marketId);
  if (!market) return [];
  return TRADE_VENUE_PRIORITY.map((venue) => {
    if (!market.venues.includes(venue)) return null;
    return buildSnapshot(venue, marketId, now);
  }).filter(Boolean) as VenueSnapshot[];
}

export function getFixtureSnapshot(
  venue: TradeVenueId,
  marketId: string,
  now = Date.now(),
) {
  const market = PERP_MARKETS.find((item) => item.id === marketId);
  if (!market?.venues.includes(venue)) return null;
  return buildSnapshot(venue, marketId, now);
}

export function getFixtureOrderBook(marketId: string, venue: TradeVenueId = "hyperliquid") {
  const mid = BASE_PRICES[marketId] ?? 100;
  const spread = mid * (venue === "lighter" ? 0.00008 : 0.00012);
  return {
    bids: Array.from({ length: 7 }, (_, index) => ({
      price: mid - spread * (index + 1),
      size: 24_000 / (index + 2),
    })),
    asks: Array.from({ length: 7 }, (_, index) => ({
      price: mid + spread * (index + 1),
      size: 22_000 / (index + 2),
    })),
  };
}

export function getFixtureCandles(marketId: string) {
  const base = BASE_PRICES[marketId] ?? 100;
  return Array.from({ length: 28 }, (_, index) => {
    const wave = Math.sin(index / 2.7) * 0.006 + Math.cos(index / 4) * 0.003;
    const close = base * (1 + wave);
    const open = base * (1 + wave - 0.0015);
    return {
      label: `${index + 1}`,
      open,
      close,
      high: Math.max(open, close) * 1.002,
      low: Math.min(open, close) * 0.998,
    };
  });
}

function buildSnapshot(venue: TradeVenueId, marketId: string, now: number): VenueSnapshot {
  const seed = snapshotSeed(venue, marketId);
  return {
    venue,
    marketId,
    ...seed,
    fetchedAt: now,
    source: "fixture",
  };
}

function snapshotSeed(venue: TradeVenueId, marketId: string): SnapshotSeed {
  const base = BASE_PRICES[marketId] ?? 100;
  const mid = base * (1 + VENUE_SKEW[venue]);
  const spread = mid * (venue === "lighter" ? 0.00008 : 0.00012);
  const [entryImpactBps, exitImpactBps] = IMPACT_BPS[venue];
  const categoryBoost = marketId.includes("/") || marketId === "US100" ? 0.35 : 1;
  return {
    midPrice: mid,
    bidPrice: mid - spread,
    askPrice: mid + spread,
    entryImpactBps: entryImpactBps * categoryBoost,
    exitImpactBps: exitImpactBps * categoryBoost,
    fundingRateHourly: FUNDING_HOURLY[venue] * categoryBoost,
    openInterestUsd: 35_000_000 / categoryBoost,
    volume24hUsd: 180_000_000 / categoryBoost,
  };
}
