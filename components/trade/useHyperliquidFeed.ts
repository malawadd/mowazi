"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HYPERLIQUID_WS_URL,
  coinForHyperliquidMarket,
  normalizeLevels,
  postHyperliquidInfo,
  readHyperliquidRestSnapshot,
} from "@/lib/trade/hyperliquidApi";
import type { PerpMarket, VenueSnapshot } from "@/lib/trade/types";

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

type FeedState = {
  snapshot: VenueSnapshot | null;
  candles: TradeCandle[];
  trades: LiveTrade[];
  status: "connecting" | "live" | "stale" | "offline" | "unsupported";
  error: string | null;
  lastUpdate: number | null;
};

const EMPTY: FeedState = {
  snapshot: null,
  candles: [],
  trades: [],
  status: "connecting",
  error: null,
  lastUpdate: null,
};

export function useHyperliquidFeed(market: PerpMarket, interval: string) {
  const [state, setState] = useState<FeedState>(EMPTY);
  const snapshotRef = useRef<VenueSnapshot | null>(null);
  const oldestRef = useRef<number | null>(null);
  const loadingMoreRef = useRef(false);
  const cancelledRef = useRef(false);
  const liveCoinRef = useRef<string | null>(null);
  const coin = useMemo(() => coinForHyperliquidMarket(market.id), [market.id]);

  const loadMoreCandles = useCallback(async () => {
    const liveCoin = liveCoinRef.current;
    if (loadingMoreRef.current || !oldestRef.current || !liveCoin || cancelledRef.current) return;
    loadingMoreRef.current = true;
    try {
      const endTime = oldestRef.current;
      const startTime = endTime - historyWindowMs(interval);
      const candles = await postHyperliquidInfo<Array<Record<string, unknown>>>({
        type: "candleSnapshot",
        req: { coin: liveCoin, interval, startTime, endTime },
      }).catch(() => []);
      if (cancelledRef.current) return;
      const normalized = candles.map(normalizeCandle).filter(Boolean) as TradeCandle[];
      if (normalized.length === 0) return;
      oldestRef.current = normalized[0].time;
      setState((current) => {
        const merged = [...normalized, ...current.candles];
        const seen = new Set<number>();
        const deduped = merged.filter((c) => {
          if (seen.has(c.time)) return false;
          seen.add(c.time);
          return true;
        });
        deduped.sort((a, b) => a.time - b.time);
        return { ...current, candles: deduped, status: "live", error: null, lastUpdate: Date.now() };
      });
    } finally {
      loadingMoreRef.current = false;
    }
  }, [interval]);

  useEffect(() => {
    if (!coin || !market.venues.includes("hyperliquid")) {
      snapshotRef.current = null;
      cancelledRef.current = true;
      setState({ ...EMPTY, status: "unsupported", error: "Hyperliquid does not list this market yet." });
      return;
    }
    const liveCoin = coin;
    liveCoinRef.current = liveCoin;

    cancelledRef.current = false;
    let ws: WebSocket | null = null;

    snapshotRef.current = null;
    oldestRef.current = null;
    setState({ ...EMPTY, status: "connecting" });

    const markLive = (patch: Partial<FeedState>) => {
      if (patch.snapshot) snapshotRef.current = patch.snapshot;
      setState((current) => ({
        ...current,
        ...patch,
        status: "live",
        error: null,
        lastUpdate: Date.now(),
      }));
    };

    async function loadRest() {
      const endTime = Date.now();
      const startTime = endTime - historyWindowMs(interval);
      const [snapshot, candles] = await Promise.all([
        readHyperliquidRestSnapshot(market, endTime),
        postHyperliquidInfo<Array<Record<string, unknown>>>({
          type: "candleSnapshot",
          req: { coin: liveCoin, interval, startTime, endTime },
        }).catch(() => []),
      ]);
      if (!cancelledRef.current) {
        const normalized = candles.map(normalizeCandle).filter(Boolean) as TradeCandle[];
        if (normalized.length > 0) oldestRef.current = normalized[0].time;
        markLive({ snapshot, candles: normalized });
      }
    }

    function connect() {
      ws = new WebSocket(HYPERLIQUID_WS_URL);
      ws.onopen = () => {
        for (const subscription of [
          { type: "allMids" },
          { type: "l2Book", coin: liveCoin },
          { type: "trades", coin: liveCoin },
          { type: "candle", coin: liveCoin, interval },
          { type: "activeAssetCtx", coin: liveCoin },
        ]) {
          ws?.send(JSON.stringify({ method: "subscribe", subscription }));
        }
      };
      ws.onmessage = (event) => handleMessage(event.data);
      ws.onerror = () => setState((current) => ({ ...current, status: "offline", error: "Live feed error." }));
      ws.onclose = () => {
        if (!cancelledRef.current) {
          setState((current) => ({ ...current, status: "offline" }));
          window.setTimeout(connect, 1800);
        }
      };
    }

    function handleMessage(raw: string) {
      const message = safeJson(raw);
      const channel = typeof message.channel === "string" ? message.channel : "";
      const data = message.data;
      if (channel === "l2Book") {
        const levels = asRecord(data).levels as Array<Array<{ px: string; sz: string }>> | undefined;
        const bids = normalizeLevels(levels?.[0]);
        const asks = normalizeLevels(levels?.[1]);
        markLive({
          snapshot: mergeSnapshot(snapshotRef.current, market.id, {
            bidPrice: bids[0]?.price,
            askPrice: asks[0]?.price,
            bids,
            asks,
            fetchedAt: Number(asRecord(data).time ?? Date.now()),
          }),
        });
      }
      if (channel === "allMids") {
        const mid = Number(asRecord(asRecord(data).mids ?? data)[liveCoin]);
        if (Number.isFinite(mid)) markLive({ snapshot: mergeSnapshot(snapshotRef.current, market.id, { midPrice: mid }) });
      }
      if (channel === "trades") {
        const rows = Array.isArray(data) ? data : [data];
        const nextTrades = rows.map(normalizeTrade).filter(Boolean) as LiveTrade[];
        setState((current) => ({
          ...current,
          trades: [...current.trades, ...nextTrades].slice(-40),
          status: "live",
          error: null,
          lastUpdate: Date.now(),
        }));
      }
      if (channel === "candle") {
        const candle = normalizeCandle(data);
        if (candle) {
          setState((current) => {
            const next = upsertCandle(current.candles, candle);
            if (next.length > 0 && oldestRef.current === null) oldestRef.current = next[0].time;
            return {
              ...current,
              candles: next,
              status: "live",
              error: null,
              lastUpdate: Date.now(),
            };
          });
        }
      }
      if (channel === "activeAssetCtx") {
        const ctx = asRecord(asRecord(data).ctx ?? data);
        markLive({
          snapshot: mergeSnapshot(snapshotRef.current, market.id, {
            fundingRateHourly: Number(ctx.funding ?? 0),
            openInterestUsd: Number(ctx.openInterest ?? 0) * (snapshotRef.current?.midPrice ?? 0),
            volume24hUsd: Number(ctx.dayNtlVlm ?? 0),
          }),
        });
      }
    }

    void loadRest().catch((error) => {
      if (!cancelledRef.current) setState((current) => ({ ...current, status: "offline", error: String(error) }));
    });
    connect();
    const staleTimer = window.setInterval(() => {
      setState((current) =>
        current.lastUpdate && Date.now() - current.lastUpdate > 20_000 ? { ...current, status: "stale" } : current,
      );
    }, 2000);

    return () => {
      cancelledRef.current = true;
      window.clearInterval(staleTimer);
      ws?.close();
    };
  }, [coin, interval, market]);

  return { ...state, loadMoreCandles };
}

function historyWindowMs(interval: string) {
  switch (interval) {
    case "1m":  return 1000 * 60 * 60 * 6;       // 6 hours
    case "5m":  return 1000 * 60 * 60 * 24;      // 1 day
    case "15m": return 1000 * 60 * 60 * 24 * 3;  // 3 days
    case "1h":  return 1000 * 60 * 60 * 24 * 7;  // 7 days
    case "1d":  return 1000 * 60 * 60 * 24 * 90; // 90 days
    default:    return 1000 * 60 * 60 * 24;
  }
}

function mergeSnapshot(current: VenueSnapshot | null, marketId: string, patch: Partial<VenueSnapshot>) {
  const mid = patch.midPrice ?? current?.midPrice ?? patch.bidPrice ?? patch.askPrice ?? 0;
  return {
    venue: "hyperliquid" as const,
    marketId,
    midPrice: mid,
    bidPrice: patch.bidPrice ?? current?.bidPrice ?? mid,
    askPrice: patch.askPrice ?? current?.askPrice ?? mid,
    bids: patch.bids ?? current?.bids,
    asks: patch.asks ?? current?.asks,
    entryImpactBps: 0,
    exitImpactBps: 0,
    fundingRateHourly: patch.fundingRateHourly ?? current?.fundingRateHourly ?? 0,
    openInterestUsd: patch.openInterestUsd ?? current?.openInterestUsd ?? 0,
    volume24hUsd: patch.volume24hUsd ?? current?.volume24hUsd ?? 0,
    fetchedAt: patch.fetchedAt ?? Date.now(),
    source: "public" as const,
  };
}

function normalizeCandle(value: unknown): TradeCandle | null {
  const row = asRecord(asRecord(value).candle ?? value);
  const time = Number(row.t ?? row.time ?? 0);
  const open = Number(row.o ?? row.open);
  const high = Number(row.h ?? row.high);
  const low = Number(row.l ?? row.low);
  const close = Number(row.c ?? row.close);
  const volume = Number(row.v ?? row.volume ?? 0);
  return [time, open, high, low, close].every(Number.isFinite) ? { time, open, high, low, close, volume } : null;
}

let _tradeSeq = 0;
function normalizeTrade(value: unknown): LiveTrade | null {
  const row = asRecord(value);
  const price = Number(row.px ?? row.price);
  const size = Number(row.sz ?? row.size);
  const time = Number(row.time ?? Date.now());
  if (!Number.isFinite(price) || !Number.isFinite(size)) return null;
  _tradeSeq += 1;
  return { id: `${time}-${price}-${size}-${_tradeSeq}`, price, size, side: row.side === "A" ? "sell" : "buy", time };
}

function upsertCandle(rows: TradeCandle[], next: TradeCandle) {
  const index = rows.findIndex((row) => row.time === next.time);
  if (index < 0) return [...rows, next];
  return rows.map((row, rowIndex) => (rowIndex === index ? next : row));
}

function safeJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
