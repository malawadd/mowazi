"use client";

import { useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import { EmptyState, Panel, StatusBadge } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";
import styles from "@/components/agents/agent-portal.module.css";

type TimelineItem = {
  id: string; at: number; kind: string; title: string; detail: string; status: string;
};

export default function AgentActivityPage() {
  const activity = useQuery(api.agentQueries.getAgentActivity, {});
  if (activity === undefined) return <StrategyShell title="Agent activity" subtitle="Analyses, simulations, proposals, and trades"><EmptyState title="Loading activity…" body="Reading recent material events." /></StrategyShell>;
  const rows: TimelineItem[] = activity ? [
    ...activity.jobs.map((row) => ({ id: row._id, at: row.updatedAt, kind: "Analysis", title: `${row.marketId} · ${row.tier}`, detail: row.error ?? `${row.trigger.replaceAll("_", " ")} analysis`, status: row.status })),
    ...activity.proposals.map((row) => ({ id: row._id, at: row.updatedAt, kind: "Proposal", title: `${row.marketId} · ${row.side}`, detail: row.payload?.reasoning ?? "Typed trade proposal", status: row.status })),
    ...activity.shadowExecutions.map((row) => ({ id: row._id, at: row.updatedAt, kind: "Simulation", title: `${row.marketId} · ${row.side}`, detail: `$${row.sizeUsd.toFixed(2)} simulated · P&L $${row.unrealizedPnlUsd.toFixed(2)}`, status: row.status })),
    ...activity.audits.map((row) => ({ id: row._id, at: row.createdAt, kind: "Audit", title: row.summary, detail: row.kind.replaceAll(".", " · "), status: "recorded" })),
  ].sort((a, b) => b.at - a.at).slice(0, 60) : [];

  return <StrategyShell title="Agent activity" subtitle="Analyses, simulations, proposals, and trades">
    <Panel title="Material timeline" description="Current UI history; detailed evidence and provider traces remain in Timescale" tone="paper">
      {!rows.length ? <EmptyState title="No agent activity yet." body="Activate an agent or run an explicit development analysis to start the timeline." />
        : <div className={styles.activityList}>{rows.map((row) =>
          <article className={styles.activityCard} key={`${row.kind}-${row.id}`}>
            <header><div><p className={styles.eyebrow}>{row.kind}</p><h3>{row.title}</h3></div>
              <StatusBadge tone={["failed", "blocked", "cancelled"].includes(row.status) ? "danger" : ["queued", "pending_approval", "claimed"].includes(row.status) ? "warning" : "positive"}>{row.status.replaceAll("_", " ")}</StatusBadge></header>
            <p>{row.detail}</p><time>{new Date(row.at).toLocaleString()}</time>
          </article>)}</div>}
    </Panel>
  </StrategyShell>;
}
