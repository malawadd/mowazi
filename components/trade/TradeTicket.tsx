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
  signedIn,
  previewing,
  submitting,
  saving,
  message,
  onChange,
  onPreview,
  onSubmit,
  onSaveDefaults,
}: {
  market: PerpMarket;
  state: TicketState;
  quote: BestExecutionQuote | null;
  signedIn: boolean;
  previewing: boolean;
  submitting: boolean;
  saving: boolean;
  message: string | null;
  onChange: (patch: Partial<TicketState>) => void;
  onPreview: () => void;
  onSubmit: () => void;
  onSaveDefaults: () => void;
}) {
  const notional = Number(state.marginUsd || 0) * Number(state.leverage || 0);
  const winner = quote?.quotes.find((item) => item.venue === quote.winningVenue);
  const liveWinner = winner?.venue === "hyperliquid" && winner.eligible;

  return (
    <section className={styles.ticket}>
      <div className={styles.panelHeaderCompact}>
        <div>
          <span className={styles.kicker}>Ticket</span>
          <p>Market execution intent</p>
        </div>
      </div>
      <div className={styles.ticketBody}>
        <div className={styles.sideGrid}>
          <button aria-pressed={state.side === "long"} type="button" onClick={() => onChange({ side: "long" })}>
            Long
          </button>
          <button aria-pressed={state.side === "short"} type="button" onClick={() => onChange({ side: "short" })}>
            Short
          </button>
        </div>
        <Field label="Margin USDC" value={state.marginUsd} onChange={(value) => onChange({ marginUsd: value })} />
        <Field label="Leverage" value={state.leverage} onChange={(value) => onChange({ leverage: value })} />
        <Field label="Slippage bps" value={state.slippageCapBps} onChange={(value) => onChange({ slippageCapBps: value })} />
        <Field
          label="Hold hours"
          value={state.expectedHoldHours}
          placeholder="Optional"
          onChange={(value) => onChange({ expectedHoldHours: value })}
        />
        <div className={styles.ticketStats}>
          <span>Notional</span>
          <strong>{formatUsd(notional)}</strong>
          <span>Market cap</span>
          <strong>{market.maxLeverage}x</strong>
        </div>
        {winner ? (
          <div className={styles.routeWinner}>
            <span>Best venue</span>
            <strong>{winner.venueLabel}</strong>
            <em>{formatUsd(winner.costs.totalCostUsd)} all-in cost</em>
          </div>
        ) : null}
        {message ? <p className={styles.ticketMessage}>{message}</p> : null}
        <button className={styles.primaryAction} type="button" disabled={previewing} onClick={onPreview}>
          {previewing ? "Previewing..." : "Preview route"}
        </button>
        <button className={styles.longAction} type="button" disabled={submitting || !liveWinner} onClick={onSubmit}>
          {submitting ? "Submitting..." : signedIn ? "Submit trade" : "Sign in to trade"}
        </button>
        <button className={styles.ghostAction} type="button" disabled={saving || !signedIn} onClick={onSaveDefaults}>
          {saving ? "Saving..." : "Save defaults"}
        </button>
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <input inputMode="decimal" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
