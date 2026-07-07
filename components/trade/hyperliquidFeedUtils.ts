import type { VenueSnapshot } from "@/lib/trade/types";

export type TradeCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type LiveTrade = {
  id: string;
  price: number;
  size: number;
  side: "buy" | "sell";
  time: number;
};

export function historyWindowMs(interval: string) {
  switch (interval) {
    case "1m": return 1000 * 60 * 60 * 6;
    case "5m": return 1000 * 60 * 60 * 24;
    case "15m": return 1000 * 60 * 60 * 24 * 3;
    case "1h": return 1000 * 60 * 60 * 24 * 7;
    case "1d": return 1000 * 60 * 60 * 24 * 90;
    default: return 1000 * 60 * 60 * 24;
  }
}

export function mergeSnapshot(current: VenueSnapshot | null, marketId: string, patch: Partial<VenueSnapshot>) {
  const mid = patch.midPrice ?? current?.midPrice ?? patch.bidPrice ?? patch.askPrice ?? 0;
  return {
    venue: "hyperliquid" as const,
    marketId,
    coin: current?.coin ?? patch.coin,
    assetIndex: current?.assetIndex ?? patch.assetIndex,
    szDecimals: current?.szDecimals ?? patch.szDecimals,
    maxLeverage: current?.maxLeverage ?? patch.maxLeverage,
    midPrice: mid,
    markPrice: patch.markPrice ?? current?.markPrice,
    oraclePrice: patch.oraclePrice ?? current?.oraclePrice,
    prevDayPrice: patch.prevDayPrice ?? current?.prevDayPrice,
    dayChangePct: patch.dayChangePct ?? current?.dayChangePct,
    bidPrice: patch.bidPrice ?? current?.bidPrice ?? mid,
    askPrice: patch.askPrice ?? current?.askPrice ?? mid,
    bids: patch.bids ?? current?.bids,
    asks: patch.asks ?? current?.asks,
    entryImpactBps: 0,
    exitImpactBps: 0,
    fundingRateHourly: patch.fundingRateHourly ?? current?.fundingRateHourly ?? 0,
    dayBaseVolume: patch.dayBaseVolume ?? current?.dayBaseVolume,
    openInterestUsd: patch.openInterestUsd ?? current?.openInterestUsd ?? 0,
    volume24hUsd: patch.volume24hUsd ?? current?.volume24hUsd ?? 0,
    fetchedAt: patch.fetchedAt ?? Date.now(),
    source: "public" as const,
  };
}

let tradeSeq = 0;

export function normalizeTrade(value: unknown): LiveTrade | null {
  const row = asRecord(value);
  const price = Number(row.px ?? row.price);
  const size = Number(row.sz ?? row.size);
  const time = Number(row.time ?? Date.now());
  if (!Number.isFinite(price) || !Number.isFinite(size)) return null;
  tradeSeq += 1;
  return { id: `${time}-${price}-${size}-${tradeSeq}`, price, size, side: row.side === "A" ? "sell" : "buy", time };
}

export function normalizeCandle(value: unknown): TradeCandle | null {
  const row = asRecord(asRecord(value).candle ?? value);
  const time = Number(row.t ?? row.time ?? 0);
  const open = Number(row.o ?? row.open);
  const high = Number(row.h ?? row.high);
  const low = Number(row.l ?? row.low);
  const close = Number(row.c ?? row.close);
  const volume = Number(row.v ?? row.volume ?? 0);
  return [time, open, high, low, close].every(Number.isFinite) ? { time, open, high, low, close, volume } : null;
}

export function upsertCandle(rows: TradeCandle[], next: TradeCandle) {
  const index = rows.findIndex((row) => row.time === next.time);
  if (index < 0) return [...rows, next];
  return rows.map((row, rowIndex) => (rowIndex === index ? next : row));
}

export function safeJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function numberFrom(value: unknown) {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}
