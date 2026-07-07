"use client";

import { formatUsd } from "@/lib/trade/format";
import type { BestExecutionQuote, PerpMarket, TradeSide } from "@/lib/trade/types";
import styles from "./trade-ui.module.css";

export type TicketState = {
  side: TradeSide;
  marginUsd: string;
  leverage: string;
  slippageCapBps: string;
  expectedHoldHours: string;
};

export default function TradeTicket({
  market,
  state,
  quote,
  previewing,
  queueing,
  saving,
  message,
  onChange,
  onPreview,
  onQueue,
  onSaveDefaults,
}: {
  market: PerpMarket;
  state: TicketState;
  quote: BestExecutionQuote | null;
  previewing: boolean;
  queueing: boolean;
  saving: boolean;
  message: string | null;
  onChange: (patch: Partial<TicketState>) => void;
  onPreview: () => void;
  onQueue: () => void;
  onSaveDefaults: () => void;
}) {
  const notional = Number(state.marginUsd || 0) * Number(state.leverage || 0);
  const winner = quote?.quotes.find((item) => item.venue === quote.winningVenue);

  return (
    <section className={styles.ticket}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Ticket</p>
          <p className={styles.muted}>Market order intent</p>
        </div>
      </div>
      <div className={styles.panelBody}>
        <div className={styles.ticketForm}>
          <div className={styles.sideGrid}>
            <button
              aria-pressed={state.side === "long"}
              className={styles.sideButton}
              type="button"
              onClick={() => onChange({ side: "long" })}
            >
              Long
            </button>
            <button
              aria-pressed={state.side === "short"}
              className={styles.sideButton}
              type="button"
              onClick={() => onChange({ side: "short" })}
            >
              Short
            </button>
          </div>

          <label className={styles.field}>
            <span className={styles.metricLabel}>Margin USDC</span>
            <input
              className={styles.input}
              inputMode="decimal"
              value={state.marginUsd}
              onChange={(event) => onChange({ marginUsd: event.target.value })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.metricLabel}>Leverage</span>
            <input
              className={styles.input}
              inputMode="decimal"
              value={state.leverage}
              onChange={(event) => onChange({ leverage: event.target.value })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.metricLabel}>Slippage cap bps</span>
            <input
              className={styles.input}
              inputMode="decimal"
              value={state.slippageCapBps}
              onChange={(event) => onChange({ slippageCapBps: event.target.value })}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.metricLabel}>Hold time hours</span>
            <input
              className={styles.input}
              inputMode="decimal"
              placeholder="Optional"
              value={state.expectedHoldHours}
              onChange={(event) => onChange({ expectedHoldHours: event.target.value })}
            />
          </label>

          <div className={styles.metricsGrid}>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Notional</span>
              <strong>{formatUsd(notional)}</strong>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Market cap</span>
              <strong>{market.maxLeverage}x</strong>
            </div>
          </div>

          {winner ? (
            <div className={styles.intentCard}>
              <span className={styles.metricLabel}>Best venue</span>
              <h3>{winner.venueLabel}</h3>
              <p className={styles.muted}>Estimated cost {formatUsd(winner.costs.totalCostUsd)}</p>
            </div>
          ) : null}

          {message ? <p className={styles.muted}>{message}</p> : null}

          <button className="primary-button" type="button" disabled={previewing} onClick={onPreview}>
            {previewing ? "Previewing..." : "Preview route"}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={!quote?.winningVenue || queueing}
            onClick={onQueue}
          >
            {queueing ? "Queueing..." : "Queue intent"}
          </button>
          <button className={styles.tinyButton} type="button" disabled={saving} onClick={onSaveDefaults}>
            {saving ? "Saving defaults" : "Save defaults"}
          </button>
        </div>
      </div>
    </section>
  );
}
