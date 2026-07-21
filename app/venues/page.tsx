"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import StrategyShell from "@/components/StrategyShell";
import { EmptyState, Panel, StatusBadge } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";
import styles from "@/components/agents/agent-portal.module.css";

const INFO: Record<string, { label: string; product: string; setup: string }> = {
  hyperliquid: { label: "Hyperliquid", product: "Perpetuals · CLOB", setup: "Managed master and agent wallet" },
  lighter: { label: "Lighter", product: "Perpetuals · CLOB", setup: "Trading account authorization" },
  orderly: { label: "Orderly", product: "Perpetuals · Omnichain CLOB", setup: "Orderly account and trading key" },
  gmx: { label: "GMX", product: "Perpetuals · Arbitrum", setup: "Managed trading wallet" },
  ostium: { label: "Ostium", product: "Perpetuals and real-world markets", setup: "Managed trading wallet" },
  uniswap: { label: "Uniswap", product: "Spot swaps", setup: "Managed Optimism execution wallet" },
};

export default function VenuesPage() {
  const data = useQuery(api.venueIntegrations.getVenueIntegrations, {});
  const setEnabled = useMutation(api.venueIntegrations.setVenueEnabled);
  return (
    <StrategyShell title="Trading" subtitle="Venue connections">
      <Panel title="Routing readiness" description="Public prices are readable without credentials. Execution remains disabled until an account is authorized and certified." tone="sky">
        {!data?.signedIn ? (
          <EmptyState title="Sign in to manage venues" body="Venue readiness belongs to your managed strategy account." action={<Link className="primary-button" href="/sign-in?redirect=/venues">Sign in</Link>} />
        ) : !data.strategyAccountId ? (
          <EmptyState title="Create a strategy account first" body="The router needs an account boundary before it can create venue integrations." action={<Link className="primary-button" href="/dashboard">Open setup</Link>} />
        ) : (
          <div className={styles.activityList}>
            {data.integrations.map((item) => {
              const info = INFO[item.venue];
              return (
                <article className={styles.activityCard} key={item.venue}>
                  <header><div><h3>{info.label}</h3><p>{info.product}</p></div><StatusBadge tone={item.ready ? "positive" : item.enabled ? "warning" : "neutral"}>{item.ready ? "Ready" : item.enabled ? "Setup required" : "Disabled"}</StatusBadge></header>
                  <div className={styles.dataList}>
                    <div><span>Public quote feed</span><strong>Available without signing</strong></div>
                    <div><span>Execution setup</span><strong>{info.setup}</strong></div>
                    <div><span>Live orders</span><strong>Globally disabled</strong></div>
                  </div>
                  <div className={styles.actions}>
                    <button className={item.enabled ? styles.danger : styles.primary} type="button" onClick={() => void setEnabled({ venue: item.venue, enabled: !item.enabled })}>
                      {item.enabled ? "Disable for routing" : "Enable for routing"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </StrategyShell>
  );
}
