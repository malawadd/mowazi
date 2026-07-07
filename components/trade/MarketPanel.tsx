"use client";

import { getFixtureCandles, getFixtureOrderBook } from "@/lib/trade/fixtures";
import { formatNumber, formatUsd } from "@/lib/trade/format";
import type { PerpMarket } from "@/lib/trade/types";
import styles from "./trade-ui.module.css";

export default function MarketPanel({
  markets,
  selectedMarket,
  onSelectMarket,
}: {
  markets: PerpMarket[];
  selectedMarket: PerpMarket;
  onSelectMarket: (marketId: string) => void;
}) {
  const candles = getFixtureCandles(selectedMarket.id);
  const book = getFixtureOrderBook(selectedMarket.id);
  const lows = candles.map((item) => item.low);
  const highs = candles.map((item) => item.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);

  return (
    <div className={styles.stack}>
      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.kicker}>Markets</p>
            <p className={styles.muted}>Crypto and RWA perps</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.marketList}>
            {markets.map((market) => (
              <button
                key={market.id}
                aria-pressed={market.id === selectedMarket.id}
                className={styles.marketButton}
                type="button"
                onClick={() => onSelectMarket(market.id)}
              >
                <strong>{market.label}</strong>
                <br />
                <span>
                  {market.category.toUpperCase()} · up to {market.maxLeverage}x
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.kicker}>Book</p>
            <p className={styles.muted}>{selectedMarket.label} synthetic depth</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.bookGrid}>
            <div className={styles.stack}>
              {book.bids.slice(0, 5).map((row) => (
                <div key={`bid-${row.price}`} className={styles.bookRow}>
                  <span>{formatNumber(row.price, selectedMarket.pricePrecision)}</span>
                  <strong>{formatUsd(row.size, 0)}</strong>
                </div>
              ))}
            </div>
            <div className={styles.stack}>
              {book.asks.slice(0, 5).map((row) => (
                <div key={`ask-${row.price}`} className={styles.bookRow}>
                  <span>{formatNumber(row.price, selectedMarket.pricePrecision)}</span>
                  <strong>{formatUsd(row.size, 0)}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <p className={styles.kicker}>Chart</p>
            <p className={styles.muted}>Fixture candle path</p>
          </div>
        </div>
        <div className={styles.panelBody}>
          <div className={styles.chart} aria-label={`${selectedMarket.label} chart`}>
            {candles.map((candle) => {
              const height = ((candle.close - min) / Math.max(max - min, 1)) * 88 + 8;
              return (
                <div
                  key={candle.label}
                  className={`${styles.bar} ${candle.close < candle.open ? styles.barDown : ""}`}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
