"use client";

import { useState } from "react";
import { formatUsd, shortAddress } from "@/lib/trade/format";
import type { TradeSettings } from "@/lib/trade/types";
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
}: {
  signedIn: boolean;
  accountWallet: AccountWallet;
  settings: TradeSettings;
  intents: TradeIntentRow[];
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
            <Row label="Default leverage" value={`${settings.defaultLeverage}x`} />
            <Row label="Slippage cap" value={`${settings.slippageCapBps} bps`} />
          </div>
        ) : null}
        {active === "History" ? <IntentHistory intents={intents} /> : null}
        {!["Balances", "History"].includes(active) ? (
          <p className={styles.emptyText}>{signedIn ? `No ${active.toLowerCase()} yet.` : "Sign in to view account data."}</p>
        ) : null}
      </div>
    </section>
  );
}

function IntentHistory({ intents }: { intents: TradeIntentRow[] }) {
  if (intents.length === 0) return <p className={styles.emptyText}>No trade history yet.</p>;
  return (
    <div className={styles.historyList}>
      {intents.map((intent) => (
        <article key={intent.id} className={styles.historyRow}>
          <strong>
            {intent.marketId} {intent.side}
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
