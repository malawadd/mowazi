"use client";

import { useState } from "react";
import { formatUsd, shortAddress } from "@/lib/trade/format";
import type { TradeSettings } from "@/lib/trade/types";
import type { HyperliquidAccountData } from "./useHyperliquidAccount";
import styles from "./trade-ui.module.css";

type AccountWallet = {
  ownerAddress?: string;
  evmUaAddress: string;
  unifiedBalanceUsd: number;
  lastRefreshedAt: number;
} | null;

type TradeIntentRow = {
  id: string;
  marketId: string;
  coin?: string;
  side: string;
  status: string;
  marginUsd: number;
  leverage: number;
  notionalUsd: number;
  selectedVenue: string | null;
  queuedAt: number;
};

const tabs = ["Balances", "Positions", "Open orders", "Fills", "Funding", "History"];

export default function TerminalTabs({
  signedIn,
  accountWallet,
  settings,
  intents,
  hyperliquid,
}: {
  signedIn: boolean;
  accountWallet: AccountWallet;
  settings: TradeSettings;
  intents: TradeIntentRow[];
  hyperliquid: HyperliquidAccountData;
}) {
  const [active, setActive] = useState(tabs[0]);
  return (
    <section className={styles.tabsPanel}>
      <div className={styles.tabBar}>
        {tabs.map((tab) => (
          <button key={tab} aria-pressed={active === tab} type="button" onClick={() => setActive(tab)}>
            {tab}
          </button>
        ))}
      </div>
      <div className={styles.tabBody}>
        {active === "Balances" ? (
          <div className={styles.tableLike}>
            <Row label="Particle UA" value={signedIn ? shortAddress(accountWallet?.evmUaAddress) : "Sign in to view"} />
            <Row label="Unified balance" value={signedIn ? formatUsd(accountWallet?.unifiedBalanceUsd) : "Hidden"} />
            <Row label="Hyperliquid equity" value={signedIn ? formatUsd(hyperliquid.accountValueUsd) : "Hidden"} />
            <Row label="Hyperliquid withdrawable" value={signedIn ? formatUsd(hyperliquid.withdrawableUsd) : "Hidden"} />
            <Row label="Default leverage" value={`${settings.defaultLeverage}x`} />
            <Row label="Slippage cap" value={`${settings.slippageCapBps} bps`} />
          </div>
        ) : null}
        {active === "Positions" ? (
          <Rows signedIn={signedIn} loading={hyperliquid.loading} rows={hyperliquid.positions} empty="No live positions." />
        ) : null}
        {active === "Open orders" ? (
          <Rows signedIn={signedIn} loading={hyperliquid.loading} rows={hyperliquid.openOrders} empty="No open orders." />
        ) : null}
        {active === "Fills" ? (
          <Rows signedIn={signedIn} loading={hyperliquid.loading} rows={hyperliquid.fills} empty="No fills returned." />
        ) : null}
        {active === "Funding" ? (
          <Rows signedIn={signedIn} loading={hyperliquid.loading} rows={hyperliquid.funding} empty="No funding rows returned." />
        ) : null}
        {active === "History" ? <IntentHistory intents={intents} /> : null}
      </div>
    </section>
  );
}

function Rows({
  signedIn,
  loading,
  rows,
  empty,
}: {
  signedIn: boolean;
  loading: boolean;
  rows: Array<Record<string, unknown>>;
  empty: string;
}) {
  if (!signedIn) return <p className={styles.emptyText}>Sign in to view account data.</p>;
  if (loading) return <p className={styles.emptyText}>Loading live Hyperliquid account data...</p>;
  if (rows.length === 0) return <p className={styles.emptyText}>{empty}</p>;
  return (
    <div className={styles.historyList}>
      {rows.slice(0, 12).map((row, index) => (
        <article key={`${row.hash ?? row.oid ?? row.coin ?? index}`} className={styles.historyRow}>
          <strong>{String(valueAt(row, ["coin", "name", "dir"]) ?? "row")}</strong>
          <span>{String(valueAt(row, ["side", "status", "crossed"]) ?? "")}</span>
          <span>{formatRowAmount(row)}</span>
          <time>{formatRowTime(row)}</time>
        </article>
      ))}
    </div>
  );
}

function IntentHistory({ intents }: { intents: TradeIntentRow[] }) {
  if (intents.length === 0) return <p className={styles.emptyText}>No trade history yet.</p>;
  return (
    <div className={styles.historyList}>
      {intents.map((intent) => (
        <article key={intent.id} className={styles.historyRow}>
          <strong>
            {intent.coin ?? intent.marketId} {intent.side}
          </strong>
          <span>{intent.status}</span>
          <span>{formatUsd(intent.notionalUsd)}</span>
          <time>{new Date(intent.queuedAt).toLocaleString()}</time>
        </article>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function valueAt(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
  }
  const position = row.position && typeof row.position === "object" ? (row.position as Record<string, unknown>) : null;
  if (!position) return null;
  for (const key of keys) {
    if (position[key] !== undefined && position[key] !== null) return position[key];
  }
  return null;
}

function formatRowAmount(row: Record<string, unknown>) {
  const raw = valueAt(row, ["positionValue", "notional", "sz", "fee", "closedPnl"]);
  const next = Number(raw);
  return Number.isFinite(next) ? next.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "";
}

function formatRowTime(row: Record<string, unknown>) {
  const time = Number(valueAt(row, ["time", "timestamp"]));
  return Number.isFinite(time) && time > 0 ? new Date(time).toLocaleString() : "";
}
