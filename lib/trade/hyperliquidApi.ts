import type { PerpMarket, VenueLevel, VenueSnapshot } from "./types";

export const HYPERLIQUID_API_URL = "https://api.hyperliquid.xyz";
export const HYPERLIQUID_WS_URL = "wss://api.hyperliquid.xyz/ws";
export const HYPERLIQUID_BRIDGE_ADDRESS = "0x2df1c51e09aecf9cacb7bc98cb1742757f163df7";

export type HyperliquidBook = {
  coin: string;
  bids: VenueLevel[];
  asks: VenueLevel[];
  time: number;
};

export type HyperliquidAccountState = {
  accountValueUsd: number;
  withdrawableUsd: number;
  raw: unknown;
};

export function coinForHyperliquidMarket(marketId: string) {
  return marketId.endsWith("-PERP") ? marketId.replace("-PERP", "") : null;
}

export async function postHyperliquidInfo<T>(body: unknown): Promise<T> {
  const response = await fetch(`${HYPERLIQUID_API_URL}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hyperliquid info failed (${response.status}): ${text.slice(0, 240)}`);
  }
  return (await response.json()) as T;
}

export async function postHyperliquidExchange(body: unknown): Promise<unknown> {
  const response = await fetch(`${HYPERLIQUID_API_URL}/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hyperliquid exchange failed (${response.status}): ${text.slice(0, 240)}`);
  }
  return await response.json();
}

export async function readHyperliquidRestSnapshot(market: PerpMarket, now = Date.now()) {
  const coin = coinForHyperliquidMarket(market.id);
  if (!coin) return null;
  const [mids, book, ctxs] = await Promise.all([
    postHyperliquidInfo<Record<string, string>>({ type: "allMids" }),
    postHyperliquidInfo<{ levels?: Array<Array<{ px: string; sz: string }>>; time?: number }>({
      type: "l2Book",
      coin,
    }),
    postHyperliquidInfo<[unknown, Array<Record<string, unknown>>]>({ type: "metaAndAssetCtxs" }).catch(() => null),
  ]);
  const mid = Number(mids[coin]);
  const bids = normalizeLevels(book.levels?.[0]);
  const asks = normalizeLevels(book.levels?.[1]);
  const bid = bids[0]?.price ?? mid;
  const ask = asks[0]?.price ?? mid;
  if (!Number.isFinite(mid) || !Number.isFinite(bid) || !Number.isFinite(ask)) return null;

  const assetCtx = assetContextForCoin(ctxs, coin);
  return {
    venue: "hyperliquid",
    marketId: market.id,
    midPrice: mid,
    bidPrice: bid,
    askPrice: ask,
    bids,
    asks,
    entryImpactBps: 0,
    exitImpactBps: 0,
    fundingRateHourly: Number(assetCtx?.funding ?? 0),
    openInterestUsd: Number(assetCtx?.openInterest ?? 0) * mid,
    volume24hUsd: Number(assetCtx?.dayNtlVlm ?? 0),
    fetchedAt: book.time ?? now,
    source: "public",
  } satisfies VenueSnapshot;
}

export async function readHyperliquidAccountState(user: string): Promise<HyperliquidAccountState> {
  const raw = await postHyperliquidInfo<Record<string, unknown>>({ type: "clearinghouseState", user });
  const margin = asRecord(raw.marginSummary);
  return {
    accountValueUsd: Number(margin.accountValue ?? 0),
    withdrawableUsd: Number(raw.withdrawable ?? margin.accountValue ?? 0),
    raw,
  };
}

export async function waitForHyperliquidCredit(user: string, minAccountValueUsd: number, timeoutMs = 70_000) {
  const startedAt = Date.now();
  let last: HyperliquidAccountState | null = null;
  while (Date.now() - startedAt < timeoutMs) {
    last = await readHyperliquidAccountState(user);
    if (last.accountValueUsd >= minAccountValueUsd) return last;
    await new Promise((resolve) => window.setTimeout(resolve, 4_000));
  }
  throw new Error(
    `Hyperliquid deposit is not credited yet. Last account value: ${last?.accountValueUsd ?? 0} USDC.`,
  );
}

export function normalizeLevels(levels: Array<{ px: string; sz: string }> | undefined) {
  return (levels ?? [])
    .map((level) => ({ price: Number(level.px), size: Number(level.sz) }))
    .filter((level) => Number.isFinite(level.price) && Number.isFinite(level.size) && level.size > 0);
}

function assetContextForCoin(ctxs: [unknown, Array<Record<string, unknown>>] | null, coin: string) {
  const universe = asRecord(ctxs?.[0]).universe as Array<{ name?: string }> | undefined;
  const index = universe?.findIndex((item) => item.name === coin) ?? -1;
  return index >= 0 ? ctxs?.[1]?.[index] : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
