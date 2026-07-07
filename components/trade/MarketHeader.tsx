"use client";

import { formatNumber, formatUsd } from "@/lib/trade/format";
import type { PerpMarket, VenueSnapshot } from "@/lib/trade/types";
import styles from "./trade-ui.module.css";

export default function MarketHeader({
  market,
  markets,
  snapshot,
  status,
  onSelectMarket,
}: {
  market: PerpMarket;
  markets: PerpMarket[];
  snapshot: VenueSnapshot | null;
  status: string;
  onSelectMarket: (marketId: string) => void;
}) {
  const mark = snapshot?.midPrice ?? null;
  const oracle = mark ? mark * 0.99994 : null;
  const fundingPct = snapshot ? snapshot.fundingRateHourly * 100 : null;

  return (
    <section className={styles.marketHeader}>
      <div className={styles.pairBlock}>
        <span className={styles.kicker}>Market</span>
        <select className={styles.marketSelect} value={market.id} onChange={(event) => onSelectMarket(event.target.value)}>
          {markets.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id}
            </option>
          ))}
        </select>
        <span className={styles.leverageChip}>{market.maxLeverage}x</span>
      </div>
      <HeaderMetric label="Feed" value={status} tone={status === "live" ? "positive" : "warning"} />
      <HeaderMetric label="Mark" value={formatNumber(mark, market.pricePrecision)} />
      <HeaderMetric label="Oracle" value={formatNumber(oracle, market.pricePrecision)} />
      <HeaderMetric label="24h Volume" value={formatUsd(snapshot?.volume24hUsd, 0)} />
      <HeaderMetric label="Open Interest" value={formatUsd(snapshot?.openInterestUsd, 0)} />
      <HeaderMetric label="Funding" value={fundingPct === null ? "N/A" : `${formatNumber(fundingPct, 4)}% / h`} />
    </section>
  );
}

function HeaderMetric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "warning" }) {
  return (
    <div className={`${styles.headerMetric} ${tone === "positive" ? styles.metricPositive : ""} ${tone === "warning" ? styles.metricWarning : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
