"use client";

import { formatUsd, shortAddress } from "@/lib/trade/format";
import type { TradeSettings } from "@/lib/trade/types";
import styles from "./trade-ui.module.css";

type AccountWallet = {
  evmUaAddress: string;
  unifiedBalanceUsd: number;
  lastRefreshedAt: number;
} | null;

type QueuedIntent = {
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

export default function TradeSidePanels({
  accountWallet,
  settings,
  queuedIntents,
  cancellingId,
  onCancelIntent,
}: {
  accountWallet: AccountWallet;
  settings: TradeSettings;
  queuedIntents: QueuedIntent[];
  cancellingId: string | null;
  onCancelIntent: (intentId: string) => void;
}) {
  return (
    <div className={styles.stack}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.kicker}>Collateral</p>
            <p className={styles.muted}>Arbitrum USDC account wallet</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.metric}>
            <span className={styles.metricLabel}>Unified balance</span>
            <h3>{formatUsd(accountWallet?.unifiedBalanceUsd)}</h3>
          </div>
          <p className={styles.muted}>{shortAddress(accountWallet?.evmUaAddress)}</p>
          <p className={styles.muted}>
            V1 does not move collateral. Queued intents reserve no funds until execution is enabled.
          </p>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.kicker}>Settings</p>
            <p className={styles.muted}>Saved ticket defaults</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.metricsGrid}>
            <Metric label="Market" value={settings.defaultMarketId} />
            <Metric label="Leverage" value={`${settings.defaultLeverage}x`} />
            <Metric label="Margin" value={formatUsd(settings.defaultMarginUsd)} />
            <Metric label="Slip cap" value={`${settings.slippageCapBps} bps`} />
          </div>
          <p className={styles.muted}>
            Confirmation {settings.requireConfirmation ? "required" : "not required"} · Hold{" "}
            {settings.expectedHoldHours ? `${settings.expectedHoldHours}h` : "excluded"}
          </p>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.kicker}>Queued intents</p>
            <p className={styles.muted}>No live execution in V1</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          {queuedIntents.length === 0 ? (
            <p className={styles.muted}>No queued trade intents yet.</p>
          ) : (
            <div className={styles.intentList}>
              {queuedIntents.map((intent) => (
                <article key={intent.id} className={styles.intentCard}>
                  <div className={styles.bookRow}>
                    <strong>
                      {intent.marketId} {intent.side}
                    </strong>
                    <span className={styles.status}>{intent.status}</span>
                  </div>
                  <p className={styles.muted}>
                    {formatUsd(intent.notionalUsd)} via {intent.selectedVenue ?? "pending"} · {intent.leverage}x
                  </p>
                  <p className={styles.muted}>{new Date(intent.queuedAt).toLocaleString()}</p>
                  {intent.status === "queued" ? (
                    <button
                      className={styles.tinyButton}
                      type="button"
                      disabled={cancellingId === intent.id}
                      onClick={() => onCancelIntent(intent.id)}
                    >
                      {cancellingId === intent.id ? "Cancelling" : "Cancel"}
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
