"use client";

import { formatUsd } from "@/lib/trade/format";
import type { TradeTicketLimits } from "@/lib/trade/ticketLimits";
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
  limits,
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
  limits: TradeTicketLimits;
  onChange: (patch: Partial<TicketState>) => void;
  onPreview: () => void;
  onSubmit: () => void;
  onSaveDefaults: () => void;
}) {
  const notional = Number(state.marginUsd || 0) * Number(state.leverage || 0);
  const winner = quote?.quotes.find((item) => item.venue === quote.winningVenue);
  const executableWinner = Boolean(winner?.executable);

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
        <RangeField
          label="Margin USDC"
          value={state.marginUsd}
          min={0}
          max={Math.max(limits.maxMarginUsd, Number(state.marginUsd) || 1)}
          step={1}
          onChange={(value) => onChange({ marginUsd: value })}
        />
        <RangeField
          label="Leverage"
          value={state.leverage}
          min={1}
          max={limits.maxLeverage}
          step={1}
          suffix="x"
          onChange={(value) => onChange({ leverage: value })}
        />
        <RangeField
          label="Slippage bps"
          value={state.slippageCapBps}
          min={0}
          max={500}
          step={5}
          onChange={(value) => onChange({ slippageCapBps: value })}
        />
        <Field
          label="Hold hours"
          value={state.expectedHoldHours}
          placeholder="Optional"
          onChange={(value) => onChange({ expectedHoldHours: value })}
        />
        <div className={styles.ticketStats}>
          <span>Notional</span>
          <strong>{formatUsd(notional)}</strong>
          <span>Depth max</span>
          <strong>{formatUsd(limits.maxMarginByDepthUsd)}</strong>
          <span>Account cap</span>
          <strong>{limits.maxMarginByAccountUsd === null ? "Preview" : formatUsd(limits.maxMarginByAccountUsd)}</strong>
          <span>Leverage cap</span>
          <strong>{market.maxLeverage}x</strong>
        </div>
        {limits.reason ? <p className={styles.ticketMessage}>{limits.reason}</p> : null}
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
        <button className={styles.longAction} type="button" disabled={submitting || !executableWinner || limits.maxMarginUsd <= 0} onClick={onSubmit}>
          {submitting ? "Simulating..." : signedIn ? "Simulate selected route" : "Sign in to simulate"}
        </button>
        <button className={styles.ghostAction} type="button" disabled={saving || !signedIn} onClick={onSaveDefaults}>
          {saving ? "Saving..." : "Save defaults"}
        </button>
      </div>
    </section>
  );
}

function RangeField({
  label,
  value,
  min,
  max,
  step,
  suffix = "",
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: string) => void;
}) {
  const numeric = Number(value || 0);
  const safeMax = Math.max(min, max);
  const safeValue = Math.min(Math.max(Number.isFinite(numeric) ? numeric : min, min), safeMax);
  const commit = (next: string) => onChange(next);
  return (
    <label className={styles.field}>
      <span>
        {label}
        <em>{formatValue(safeValue, suffix)}</em>
      </span>
      <input
        type="range"
        min={min}
        max={safeMax}
        step={step}
        value={safeValue}
        onChange={(event) => commit(event.target.value)}
      />
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => commit(event.target.value)}
        onBlur={() => commit(String(safeValue))}
      />
    </label>
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

function formatValue(value: number, suffix: string) {
  return `${Number.isInteger(value) ? value : value.toFixed(2)}${suffix}`;
}
