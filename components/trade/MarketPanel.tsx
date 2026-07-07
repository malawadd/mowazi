"use client";

import { formatNumber } from "@/lib/trade/format";
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
          <p>Hyperliquid default USDC perps</p>
        </div>
      </div>
      <div className={styles.marketList}>
        {markets.map((market) => {
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
                <small>{formatNumber(market.markPrice, market.pricePrecision)} mark</small>
              </span>
              <em>{market.maxLeverage}x max</em>
            </button>
          );
        })}
      </div>
    </section>
  );
}
