"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import styles from "./agent-status-rail.module.css";

const modeName: Record<string, string> = {
  shadow: "Shadow", insights: "Shadow", approval_required: "Approval", autopilot: "Autopilot",
};
type RailScenario = { name: string; probability?: number; disclaimer?: string };

function age(ms: number | null) {
  if (ms === null) return "No analysis yet";
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1_000))}s ago`;
  return `${Math.floor(ms / 60_000)}m ago`;
}

export default function AgentStatusRail({ marketId }: { marketId: string }) {
  const summary = useQuery(api.agentQueries.getTradeAgentSummary, { marketId });
  const pause = useMutation(api.agentMutations.pauseAutopilot);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const agent = summary?.agent;
  const mode = agent ? modeName[agent.profile.authorityMode] ?? "Shadow" : null;

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (summary === undefined) return <div className={styles.rail} data-mode="loading"><span>Agent</span><strong>Checking status…</strong></div>;
  if (!summary.signedIn || !agent) return <div className={styles.rail} data-mode="none">
    <div><span>Agent</span><strong>No agent on this market</strong><small>Keep the terminal focused. Build and configure your agent in the portal.</small></div>
    <Link href={summary.signedIn ? "/agents/create" : "/sign-in?redirect=/agents/create"}>{summary.signedIn ? "Create your agent" : "Sign in to create"}</Link>
  </div>;

  const detail = mode === "Shadow"
    ? `${agent.latestAction?.side ? `Simulated ${agent.latestAction.side}` : "Waiting for a setup"} · P&L $${(agent.shadow?.unrealizedPnlUsd ?? 0).toFixed(2)}`
    : mode === "Approval"
      ? `${agent.pendingApprovals} proposal${agent.pendingApprovals === 1 ? "" : "s"} waiting`
      : `${agent.latestAction ? `${agent.latestAction.side} · ${agent.latestAction.status}` : "Monitoring"} · ${agent.health}`;

  return <>
    <section className={styles.rail} data-mode={agent.profile.authorityMode} aria-label={`${mode} agent status`}>
      <button ref={triggerRef} className={styles.summaryButton} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <span>{mode} agent · {agent.profile.name}</span>
        <strong>{agent.thesis}</strong>
        <small>{detail} · {age(agent.freshnessMs)} · {Math.round(agent.confidence * 100)}% confidence</small>
      </button>
      <div className={styles.railActions}>
        {mode === "Approval" ? <Link href="/agents/approvals">Review in portal</Link> : null}
        {mode === "Autopilot" ? <button type="button" onClick={() => void pause({ paused: true })}>Pause now</button> : null}
        {mode === "Shadow" ? <span>Simulation only</span> : null}
      </div>
    </section>
    {open ? <div className={styles.backdrop}>
      <button className={styles.scrim} aria-label="Close agent details" onClick={() => setOpen(false)} />
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="agent-drawer-title">
        <header><div><p>{mode} · {marketId}</p><h2 id="agent-drawer-title">{agent.profile.name}</h2></div>
          <button ref={closeRef} type="button" aria-label="Close agent details" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>×</button></header>
        <section><p className={styles.kicker}>Current thesis</p><h3>{agent.thesis}</h3>
          <div className={styles.metrics}><div><span>Confidence</span><strong>{Math.round(agent.confidence * 100)}%</strong></div>
            <div><span>Freshness</span><strong>{age(agent.freshnessMs)}</strong></div><div><span>Health</span><strong>{agent.health}</strong></div></div>
        </section>
        <section><p className={styles.kicker}>Latest action</p>
          <p>{agent.latestAction ? `${agent.latestAction.side === "long" ? "Long" : "Short"} proposal · ${agent.latestAction.status.replaceAll("_", " ")}` : "No proposal has been generated for this market yet."}</p>
          {agent.shadow ? <p>Simulated entry ${agent.shadow.entryPrice.toFixed(2)} · mark ${agent.shadow.markPrice.toFixed(2)} · unrealized P&L ${agent.shadow.unrealizedPnlUsd.toFixed(2)}</p> : null}
        </section>
        <section><p className={styles.kicker}>Scenarios</p>
          {agent.scenarios.length ? (agent.scenarios as RailScenario[]).slice(0, 3).map((scenario, index) =>
            <article key={`${scenario.name}-${index}`}><strong>{scenario.name}</strong><span>{Math.round(Number(scenario.probability ?? 0) * 100)}%</span><p>{scenario.disclaimer ?? "Scenario, not a prediction."}</p></article>)
            : <p>No stored scenarios are available yet.</p>}
        </section>
        <section><p className={styles.kicker}>Evidence summary</p>
          <p>{agent.conflicts.length ? agent.conflicts.slice(0, 3).join(" ") : "No material evidence conflict was recorded in the current snapshot."}</p>
        </section>
        <footer><Link href="/agents/activity">View history</Link><Link href="/agents">Open agent portal</Link></footer>
      </aside>
    </div> : null}
  </>;
}
