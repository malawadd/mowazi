"use client";

import { formatAge, formatNumber, formatUsd } from "@/lib/trade/format";
import type { BestExecutionQuote, TradeVenueId } from "@/lib/trade/types";
import Link from "next/link";
import styles from "./trade-ui.module.css";

export default function BestExecutionTable({
  quote, overrideVenue, onOverride,
}: {
  quote: BestExecutionQuote | null;
  overrideVenue?: TradeVenueId | null;
  onOverride?: (venue: TradeVenueId | null) => void;
}) {
  return (
    <section className={styles.tableWrap}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.kicker}>Best execution</p>
          <p className={styles.muted}>All-in cost by eligible venue</p>
        </div>
        {quote?.winningVenue ? <span className={`${styles.status} ${styles.positive}`}>{quote.overrideApplied ? "Manual override" : "Auto-selected"}</span> : null}
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
                  {onOverride ? <th>Use</th> : null}
                </tr>
              </thead>
              <tbody>
                {quote.quotes.map((row) => {
                  const isWinner = row.venue === quote.selectedVenue;
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
                          {row.eligible ? (row.executable ? (isWinner ? "selected" : "ready") : "setup needed") : "excluded"}
                        </span>
                        {!row.eligible ? <p className={styles.cellMuted}>{row.reason}</p> : null}
                        {row.eligible && !row.executable ? <p className={styles.cellMuted}>{row.setupRequirement} <Link href={`/venues?venue=${row.venue}`}>Connect</Link></p> : null}
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
                      {onOverride ? (
                        <td>
                          <input
                            aria-label={`Use ${row.venueLabel}`}
                            type="radio"
                            name="route-override"
                            checked={overrideVenue === row.venue || (!overrideVenue && isWinner)}
                            disabled={!row.executable}
                            onChange={() => onOverride(row.venue)}
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {quote?.warnings?.map((warning) => <p className={styles.ticketMessage} key={warning}>{warning}</p>)}
        {quote && onOverride && overrideVenue ? (
          <button className={styles.ghostAction} type="button" onClick={() => onOverride(null)}>Return to automatic selection</button>
        ) : null}
      </div>
    </section>
  );
}
