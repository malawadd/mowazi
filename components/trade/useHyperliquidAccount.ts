"use client";

import { useCallback, useEffect, useState } from "react";
import { postHyperliquidInfo, readHyperliquidAccountState } from "@/lib/trade/hyperliquidApi";

export type HyperliquidAccountData = {
  accountValueUsd: number;
  withdrawableUsd: number;
  positions: Array<Record<string, unknown>>;
  openOrders: Array<Record<string, unknown>>;
  fills: Array<Record<string, unknown>>;
  funding: Array<Record<string, unknown>>;
  loading: boolean;
  error: string | null;
  updatedAt: number | null;
};

const EMPTY: HyperliquidAccountData = {
  accountValueUsd: 0,
  withdrawableUsd: 0,
  positions: [],
  openOrders: [],
  fills: [],
  funding: [],
  loading: false,
  error: null,
  updatedAt: null,
};

export function useHyperliquidAccount(ownerAddress: string | null | undefined) {
  const [state, setState] = useState<HyperliquidAccountData>(EMPTY);

  const refresh = useCallback(async () => {
    if (!ownerAddress) {
      setState(EMPTY);
      return null;
    }
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const startTime = Date.now() - 1000 * 60 * 60 * 24 * 30;
      const [account, openOrders, fills, funding] = await Promise.all([
        readHyperliquidAccountState(ownerAddress),
        postHyperliquidInfo<Array<Record<string, unknown>>>({
          type: "frontendOpenOrders",
          user: ownerAddress,
        }).catch(() => []),
        postHyperliquidInfo<Array<Record<string, unknown>>>({
          type: "userFills",
          user: ownerAddress,
          aggregateByTime: true,
        }).catch(() => []),
        postHyperliquidInfo<Array<Record<string, unknown>>>({
          type: "userFunding",
          user: ownerAddress,
          startTime,
        }).catch(() => []),
      ]);
      const next = {
        accountValueUsd: account.accountValueUsd,
        withdrawableUsd: account.withdrawableUsd,
        positions: account.positions,
        openOrders,
        fills,
        funding,
        loading: false,
        error: null,
        updatedAt: Date.now(),
      };
      setState(next);
      return next;
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
      return null;
    }
  }, [ownerAddress]);

  useEffect(() => {
    void refresh();
    if (!ownerAddress) return;
    const timer = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [ownerAddress, refresh]);

  return { ...state, refresh };
}
