"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@/lib/trade/format";
import { loadRoutingMarkets, previewBestRoute } from "@/lib/trade/routeBackend";
import type { BestExecutionQuote, PerpMarket, TradeVenueId } from "@/lib/trade/types";
import styles from "./agent-lab.module.css";

const VENUES: TradeVenueId[] = ["hyperliquid", "lighter", "orderly", "gmx", "ostium"];

export default function RoutingLab() {
  const [markets, setMarkets] = useState<PerpMarket[]>([]);
  const [market, setMarket] = useState("BTC");
  const [side, setSide] = useState<"long" | "short">("long");
  const [margin, setMargin] = useState("100");
  const [leverage, setLeverage] = useState("5");
  const [ready, setReady] = useState<TradeVenueId[]>(["hyperliquid"]);
  const [quote, setQuote] = useState<BestExecutionQuote | null>(null);
  const [status, setStatus] = useState("Loading live market union…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadRoutingMarkets().then((items) => { setMarkets(items); setStatus(`${items.length} public markets discovered`); })
      .catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
  }, []);

  const run = async () => {
    setBusy(true); setQuote(null);
    try {
      const next = await previewBestRoute({
        input: { marketId: market, side, marginUsd: Number(margin), leverage: Number(leverage), slippageCapBps: 75, holdTimeHours: 8 },
        readyVenues: ready,
      });
      setQuote(next); setStatus("Live mainnet public quotes compared. Zero transactions sent.");
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  return (
    <section className={styles.routingLab}>
      <div className={styles.sectionTitle}><span>R</span><div><h2>Venue routing lab</h2><p>Mainnet read-only quotes, readiness fallback, and deterministic cost ranking.</p></div></div>
      <div className={styles.routingControls}>
        <label>Market<select value={market} onChange={(event) => setMarket(event.target.value)}>{markets.map((item) => <option key={item.id}>{item.id}</option>)}</select></label>
        <label>Side<select value={side} onChange={(event) => setSide(event.target.value as typeof side)}><option value="long">Long</option><option value="short">Short</option></select></label>
        <label>Margin USD<input value={margin} onChange={(event) => setMargin(event.target.value)} /></label>
        <label>Leverage<input value={leverage} onChange={(event) => setLeverage(event.target.value)} /></label>
      </div>
      <fieldset className={styles.venueChecks}><legend>Assume these accounts are ready</legend>{VENUES.map((venue) => <label key={venue}><input type="checkbox" checked={ready.includes(venue)} onChange={() => setReady((items) => items.includes(venue) ? items.filter((item) => item !== venue) : [...items, venue])} />{venue}</label>)}</fieldset>
      <button className={styles.runButton} type="button" disabled={busy} onClick={() => void run()}>{busy ? "Comparing…" : "Compare all venues"}</button>
      <p>{status}</p>
      {quote ? <div className={styles.routingResults}>{quote.quotes.map((row) => <article key={row.venue} data-selected={row.venue === quote.selectedVenue}><strong>{row.venueLabel}</strong><span>{row.eligible ? row.executable ? "ready" : "setup needed" : "excluded"}</span><b>{row.eligible ? formatUsd(row.costs.totalCostUsd) : "—"}</b><small>{row.reason ?? row.setupRequirement ?? row.source}</small></article>)}</div> : null}
    </section>
  );
}
