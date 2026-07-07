"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const coin = useMemo(() => coinForHyperliquidMarket(market.id), [market.id]);

  useEffect(() => {
    if (!coin || !market.venues.includes("hyperliquid")) {
      snapshotRef.current = null;
      setState({ ...EMPTY, status: "unsupported", error: "Hyperliquid does not list this market yet." });
      return;
    }
    const liveCoin = coin;

    let cancelled = false;
    let ws: WebSocket | null = null;

    snapshotRef.current = null;
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
      const startTime = endTime - 1000 * 60 * 60 * 24;
      const [snapshot, candles] = await Promise.all([
        readHyperliquidRestSnapshot(market, endTime),
        postHyperliquidInfo<Array<Record<string, unknown>>>({
          type: "candleSnapshot",
          req: { coin: liveCoin, interval, startTime, endTime },
        }).catch(() => []),
      ]);
      if (!cancelled) {
        markLive({ snapshot, candles: candles.map(normalizeCandle).filter(Boolean) as TradeCandle[] });
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
        if (!cancelled) {
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
          setState((current) => ({
            ...current,
            candles: upsertCandle(current.candles, candle).slice(-160),
            status: "live",
            error: null,
            lastUpdate: Date.now(),
          }));
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
      if (!cancelled) setState((current) => ({ ...current, status: "offline", error: String(error) }));
    });
    connect();
    const staleTimer = window.setInterval(() => {
      setState((current) =>
        current.lastUpdate && Date.now() - current.lastUpdate > 20_000 ? { ...current, status: "stale" } : current,
      );
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(staleTimer);
      ws?.close();
    };
  }, [coin, interval, market]);

  return state;
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

function normalizeTrade(value: unknown): LiveTrade | null {
  const row = asRecord(value);
  const price = Number(row.px ?? row.price);
  const size = Number(row.sz ?? row.size);
  const time = Number(row.time ?? Date.now());
  if (!Number.isFinite(price) || !Number.isFinite(size)) return null;
  return { id: `${time}-${price}-${size}`, price, size, side: row.side === "A" ? "sell" : "buy", time };
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
