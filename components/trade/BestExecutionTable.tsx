"use client";

import { formatAge, formatNumber, formatUsd } from "@/lib/trade/format";
import type { BestExecutionQuote } from "@/lib/trade/types";
import styles from "./trade-ui.module.css";

export default function BestExecutionTable({ quote }: { quote: BestExecutionQuote | null }) {
  return (
    <section className={styles.tableWrap}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Best execution</p>
          <p className={styles.muted}>All-in cost by eligible venue</p>
        </div>
        {quote?.winningVenue ? <span className={`${styles.status} ${styles.positive}`}>Automatic</span> : null}
      </div>
      <div className={styles.panelBody}>
        {!quote ? (
          <p className={styles.muted}>Preview a route to compare venue costs.</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.costTable}>
              <thead>
                <tr>
                  <th>Venue</th>
                  <th>Status</th>
                  <th>Entry</th>
                  <th>Fees</th>
                  <th>Slippage</th>
                  <th>Funding</th>
                  <th>Transfer</th>
                  <th>Total</th>
                  <th>Fresh</th>
                </tr>
              </thead>
              <tbody>
                {quote.quotes.map((row) => {
                  const isWinner = row.venue === quote.winningVenue;
                  const slippage = row.costs.entrySlippageUsd + row.costs.exitSlippageUsd;
                  const fees = row.costs.entryFeeUsd + row.costs.exitFeeUsd;
                  return (
                    <tr key={row.venue}>
                      <td>
                        <strong>{row.venueLabel}</strong>
                        <br />
                        <span className={styles.cellMuted}>{row.kind}</span>
                      </td>
                      <td>
                        <span
                          className={`${styles.status} ${
                            row.eligible ? (isWinner ? styles.positive : "") : styles.warning
                          }`}
                        >
                          {row.eligible ? (isWinner ? "winner" : "eligible") : "excluded"}
                        </span>
                        {!row.eligible ? <p className={styles.cellMuted}>{row.reason}</p> : null}
                      </td>
                      <td>{row.estimatedEntryPrice ? formatNumber(row.estimatedEntryPrice, 5) : "N/A"}</td>
                      <td>{formatUsd(fees)}</td>
                      <td>{formatUsd(slippage)}</td>
                      <td>{formatUsd(row.costs.fundingUsd)}</td>
                      <td>{formatUsd(row.costs.transferCostUsd)}</td>
                      <td>
                        <strong>{formatUsd(row.costs.totalCostUsd)}</strong>
                      </td>
                      <td>
                        {formatAge(row.freshnessMs)}
                        <br />
                        <span className={styles.cellMuted}>{row.source}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
