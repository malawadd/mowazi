import { readHyperliquidRestSnapshot } from "./hyperliquidApi";
import { getPerpMarket, TRADE_VENUE_PRIORITY } from "./markets";
import type { RouteInput, TradeVenueId, VenueSnapshot } from "./types";

export async function getVenueSnapshotsWithFallback(input: RouteInput) {
  return await getPublicVenueSnapshots(input);
}

export async function getPublicVenueSnapshots(input: RouteInput) {
  const now = input.now ?? Date.now();
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
  if (venue === "hyperliquid") {
    const market = getPerpMarket(marketId);
    return market ? await readHyperliquidRestSnapshot(market, now) : null;
  }
  return null;
}
