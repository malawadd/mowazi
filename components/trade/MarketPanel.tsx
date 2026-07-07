"use client";

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
  return (
    <section className={styles.marketRail}>
      <div className={styles.panelHeaderCompact}>
        <div>
          <span className={styles.kicker}>Markets</span>
          <p>Crypto and RWA coverage</p>
        </div>
      </div>
      <div className={styles.marketList}>
        {markets.map((market) => {
          const live = market.venues.includes("hyperliquid") && market.category === "crypto";
          return (
            <button
              key={market.id}
              aria-pressed={market.id === selectedMarket.id}
              className={styles.marketButton}
              type="button"
              onClick={() => onSelectMarket(market.id)}
            >
              <span>
                <strong>{market.id}</strong>
                <small>{market.category.toUpperCase()}</small>
              </span>
              <em>{live ? "HL live" : "venue pending"}</em>
            </button>
          );
        })}
      </div>
    </section>
  );
}
