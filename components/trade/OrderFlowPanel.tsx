"use client";

import { formatNumber } from "@/lib/trade/format";
import type { PerpMarket, VenueLevel, VenueSnapshot } from "@/lib/trade/types";
import type { LiveTrade } from "./useHyperliquidFeed";
import styles from "./trade-ui.module.css";

export default function OrderFlowPanel({
  market,
  snapshot,
  trades,
}: {
  market: PerpMarket;
  snapshot: VenueSnapshot | null;
  trades: LiveTrade[];
}) {
  return (
    <section className={styles.flowPanel}>
      <div className={styles.panelHeaderCompact}>
        <div>
          <span className={styles.kicker}>Order book</span>
          <p>Hyperliquid live depth</p>
        </div>
      </div>
      <div className={styles.bookTable}>
        <DepthRows rows={(snapshot?.asks ?? []).slice(0, 9).reverse()} side="ask" precision={market.pricePrecision} />
        <div className={styles.spreadRow}>
          <strong>{formatNumber(snapshot?.midPrice, market.pricePrecision)}</strong>
          <span>mid</span>
        </div>
        <DepthRows rows={(snapshot?.bids ?? []).slice(0, 9)} side="bid" precision={market.pricePrecision} />
      </div>

      <div className={styles.panelHeaderCompact}>
        <div>
          <span className={styles.kicker}>Trades</span>
          <p>Latest prints</p>
        </div>
      </div>
      <div className={styles.tradesTape}>
        {trades.length === 0 ? (
          <p className={styles.emptyText}>Waiting for prints...</p>
        ) : (
          trades.slice(-16).reverse().map((trade) => (
            <div key={trade.id} className={styles.tradeRow}>
              <strong className={trade.side === "buy" ? styles.bidText : styles.askText}>
                {formatNumber(trade.price, market.pricePrecision)}
              </strong>
              <span>{formatNumber(trade.size, 4)}</span>
              <time>{new Date(trade.time).toLocaleTimeString()}</time>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function DepthRows({ rows, side, precision }: { rows: VenueLevel[]; side: "bid" | "ask"; precision: number }) {
  const max = Math.max(...rows.map((row) => row.size), 1);
  return (
    <>
      {rows.map((row) => (
        <div key={`${side}-${row.price}-${row.size}`} className={`${styles.depthRow} ${styles[side]}`}>
          <span className={styles.depthBar} style={{ inlineSize: `${Math.min(100, (row.size / max) * 100)}%` }} />
          <strong>{formatNumber(row.price, precision)}</strong>
          <span>{formatNumber(row.size, 4)}</span>
        </div>
      ))}
    </>
  );
}
