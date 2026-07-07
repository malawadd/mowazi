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
import {
  asRecord,
  historyWindowMs,
  mergeSnapshot,
  normalizeCandle,
  normalizeTrade,
  numberFrom,
  safeJson,
  upsertCandle,
  type LiveTrade,
  type TradeCandle,
} from "./hyperliquidFeedUtils";

export type { LiveTrade, TradeCandle } from "./hyperliquidFeedUtils";

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

export function useHyperliquidFeed(market: PerpMarket | null, interval: string) {
  const [state, setState] = useState<FeedState>(EMPTY);
  const snapshotRef = useRef<VenueSnapshot | null>(null);
  const oldestRef = useRef<number | null>(null);
  const loadingMoreRef = useRef(false);
  const genRef = useRef(0);
  const liveCoinRef = useRef<string | null>(null);
  const coin = useMemo(() => (market ? coinForHyperliquidMarket(market.id) : null), [market]);

  const loadMoreCandles = useCallback(async () => {
    const liveCoin = liveCoinRef.current;
    const gen = genRef.current;
    if (loadingMoreRef.current || !oldestRef.current || !liveCoin || gen === 0) return;
    loadingMoreRef.current = true;
    try {
      const endTime = oldestRef.current;
      const startTime = endTime - historyWindowMs(interval);
      const candles = await postHyperliquidInfo<Array<Record<string, unknown>>>({
        type: "candleSnapshot",
        req: { coin: liveCoin, interval, startTime, endTime },
      }).catch(() => []);
      if (genRef.current !== gen) return;
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
    if (!coin || !market || !market.venues.includes("hyperliquid")) {
      snapshotRef.current = null;
      genRef.current = 0;
      setState({ ...EMPTY, status: "unsupported", error: "Hyperliquid does not list this market yet." });
      return;
    }
    const liveCoin = coin;
    const liveMarket = market;
    liveCoinRef.current = liveCoin;
    genRef.current += 1;
    const gen = genRef.current;

    let ws: WebSocket | null = null;

    snapshotRef.current = null;
    oldestRef.current = null;
    setState({ ...EMPTY, status: "connecting" });

    const markLive = (patch: Partial<FeedState>) => {
      if (genRef.current !== gen) return;
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
        readHyperliquidRestSnapshot(liveMarket, endTime),
        postHyperliquidInfo<Array<Record<string, unknown>>>({
          type: "candleSnapshot",
          req: { coin: liveCoin, interval, startTime, endTime },
        }).catch(() => []),
      ]);
      if (genRef.current !== gen) return;
      const normalized = candles.map(normalizeCandle).filter(Boolean) as TradeCandle[];
      if (normalized.length > 0) oldestRef.current = normalized[0].time;
      markLive({ snapshot, candles: normalized });
    }

    function connect() {
      ws = new WebSocket(HYPERLIQUID_WS_URL);
      ws.onopen = () => {
        if (genRef.current !== gen) return;
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
      ws.onmessage = (event) => {
        if (genRef.current === gen) handleMessage(event.data);
      };
      ws.onerror = () => {
        if (genRef.current !== gen) return;
        setState((current) => ({ ...current, status: "offline", error: "Live feed error." }));
      };
      ws.onclose = () => {
        if (genRef.current === gen) {
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
          snapshot: mergeSnapshot(snapshotRef.current, liveMarket.id, {
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
        if (Number.isFinite(mid)) markLive({ snapshot: mergeSnapshot(snapshotRef.current, liveMarket.id, { midPrice: mid }) });
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
        const mark = numberFrom(ctx.markPx);
        const oracle = numberFrom(ctx.oraclePx);
        const prev = numberFrom(ctx.prevDayPx);
        const reference = mark ?? snapshotRef.current?.markPrice ?? snapshotRef.current?.midPrice ?? 0;
        markLive({
          snapshot: mergeSnapshot(snapshotRef.current, liveMarket.id, {
            markPrice: mark ?? undefined,
            oraclePrice: oracle ?? undefined,
            prevDayPrice: prev ?? undefined,
            dayChangePct:
              reference && prev && prev > 0 ? ((reference - prev) / prev) * 100 : undefined,
            fundingRateHourly: Number(ctx.funding ?? 0),
            dayBaseVolume: numberFrom(ctx.dayBaseVlm) ?? undefined,
            openInterestUsd: Number(ctx.openInterest ?? 0) * reference,
            volume24hUsd: Number(ctx.dayNtlVlm ?? 0),
          }),
        });
      }
    }

    void loadRest().catch((error) => {
      if (genRef.current === gen) setState((current) => ({ ...current, status: "offline", error: String(error) }));
    });
    connect();
    const staleTimer = window.setInterval(() => {
      if (genRef.current !== gen) return;
      setState((current) =>
        current.lastUpdate && Date.now() - current.lastUpdate > 20_000 ? { ...current, status: "stale" } : current,
      );
    }, 2000);

    return () => {
      genRef.current += 1; // invalidate all pending callbacks
      window.clearInterval(staleTimer);
      ws?.close();
    };
  }, [coin, interval, market]);

  return { ...state, loadMoreCandles };
}
