import { getFixtureVenueSnapshots } from "./fixtures";
import { getPerpMarket, TRADE_VENUE_PRIORITY } from "./markets";
import type { RouteInput, TradeVenueId, VenueSnapshot } from "./types";

export async function getVenueSnapshotsWithFallback(input: RouteInput) {
  const now = input.now ?? Date.now();
  const [publicSnapshots, fixtureSnapshots] = await Promise.all([
    getPublicVenueSnapshots(input, now),
    Promise.resolve(getFixtureVenueSnapshots(input.marketId, now)),
  ]);
  const publicByVenue = new Map(publicSnapshots.map((snapshot) => [snapshot.venue, snapshot]));
  return fixtureSnapshots.map((fixture) => publicByVenue.get(fixture.venue) ?? fixture);
}

export async function getPublicVenueSnapshots(input: RouteInput, now = Date.now()) {
  const market = getPerpMarket(input.marketId);
  if (!market) return [];

  const results = await Promise.allSettled(
    TRADE_VENUE_PRIORITY.filter((venue) => market.venues.includes(venue)).map((venue) =>
      readPublicSnapshot(venue, input.marketId, now),
    ),
  );

  return results
    .map((result) => (result.status === "fulfilled" ? result.value : null))
    .filter(Boolean) as VenueSnapshot[];
}

async function readPublicSnapshot(venue: TradeVenueId, marketId: string, now: number) {
  if (venue === "hyperliquid") return await readHyperliquidSnapshot(marketId, now);
  if (venue === "orderly") return await readOrderlySnapshot(marketId, now);
  return null;
}

async function readHyperliquidSnapshot(marketId: string, now: number) {
  const coin = coinForMarket(marketId);
  if (!coin) return null;
  const [mids, book] = await Promise.all([
    postJson("https://api.hyperliquid.xyz/info", { type: "allMids" }),
    postJson("https://api.hyperliquid.xyz/info", { type: "l2Book", coin }),
  ]);
  const mid = Number((mids as Record<string, string>)[coin]);
  const levels = (book as { levels?: Array<Array<{ px: string; sz: string }>> }).levels;
  const bid = Number(levels?.[0]?.[0]?.px ?? mid);
  const ask = Number(levels?.[1]?.[0]?.px ?? mid);
  if (!Number.isFinite(mid) || !Number.isFinite(bid) || !Number.isFinite(ask)) return null;

  return {
    venue: "hyperliquid",
    marketId,
    midPrice: mid,
    bidPrice: bid,
    askPrice: ask,
    entryImpactBps: 5.5,
    exitImpactBps: 6.2,
    fundingRateHourly: 0.000012,
    openInterestUsd: 0,
    volume24hUsd: 0,
    fetchedAt: now,
    source: "public",
  } satisfies VenueSnapshot;
}

async function readOrderlySnapshot(marketId: string, now: number) {
  const coin = coinForMarket(marketId);
  if (!coin) return null;
  const symbol = `PERP_${coin}_USDC`;
  const payload = await fetchJson(`https://api.orderly.org/v1/public/market_info/${symbol}`);
  const data = asRecord(asRecord(payload).data ?? payload);
  const mark = Number(data.mark_price ?? data.markPrice ?? data["24h_close"]);
  const index = Number(data.index_price ?? data.indexPrice ?? mark);
  if (!Number.isFinite(mark) || !Number.isFinite(index)) return null;

  return {
    venue: "orderly",
    marketId,
    midPrice: mark,
    bidPrice: mark * 0.9999,
    askPrice: mark * 1.0001,
    entryImpactBps: 6.8,
    exitImpactBps: 7.2,
    fundingRateHourly: Number(data.est_funding_rate ?? data.funding_rate ?? 0) / 8,
    openInterestUsd: Number(data.open_interest ?? 0),
    volume24hUsd: Number(data["24h_amount"] ?? data.volume24h ?? 0),
    fetchedAt: now,
    source: "public",
  } satisfies VenueSnapshot;
}

function coinForMarket(marketId: string) {
  if (marketId.endsWith("-PERP")) return marketId.replace("-PERP", "");
  return null;
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return await response.json();
}

async function fetchJson(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return await response.json();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
