"use client";

import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import { EmptyState, MetricCard, Panel, StatusBadge } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";
import styles from "@/components/agents/agent-portal.module.css";

const modeNames: Record<string, string> = {
  shadow: "Shadow", insights: "Shadow",
  approval_required: "Approval", autopilot: "Autopilot",
};

export default function AgentsPage() {
  const settings = useQuery(api.agentQueries.getAgentSettings, {});
  const activate = useMutation(api.agentProfiles.activateAgentProfile);
  const syncSchedule = useAction(api.agentActions.syncAgentSchedule);
  const setLifecycle = useMutation(api.agentProfiles.setAgentLifecycle);

  if (settings === undefined) {
    return <StrategyShell title="Agent" subtitle="Your autonomous trading team">
      <EmptyState title="Loading your agent…" body="Reading the current profile, policy, credits, and activity." />
    </StrategyShell>;
  }
  if (!settings?.profile) {
    return <StrategyShell title="Agent" subtitle="Your autonomous trading team">
      <Panel title="No agent yet" description="One named specialist team belongs to each strategy account" tone="sky">
        <EmptyState title="Build your market agent."
          body="Choose Shadow, Approval, or Autopilot. Every mode analyzes automatically; only trading authority changes."
          action={<Link className="primary-button" href="/agents/create">Create your agent</Link>} />
      </Panel>
    </StrategyShell>;
  }

  const profile = settings.profile;
  const available = settings.credits?.available ?? 0;
  const mode = modeNames[profile.authorityMode] ?? "Shadow";
  const active = profile.lifecycleStatus === "active" && !profile.paused;
  const perRun = settings.modelConfiguration?.estimatedCredits
    ?? (profile.tier === "max" ? 113 : profile.tier === "pro" ? 62 : 25);
  const runs = Math.floor(available / perRun);

  return (
    <StrategyShell title="Agent" subtitle="Your autonomous trading team">
      <div className={styles.heroRow}>
        <div><p className={styles.eyebrow}>Strategy account agent</p><h3>{profile.name}</h3>
          <p>{mode} mode · {profile.tier} intelligence · policy version {settings.activePolicy?.version ?? "not active"}</p></div>
        <span className={styles.statusDot} data-blocked={!active}>
          {active ? "Active" : profile.lifecycleStatus}
        </span>
      </div>
      <section className="metric-grid">
        <MetricCard label="Mode" value={mode} detail="Effective trading authority" tone={profile.authorityMode === "autopilot" ? "mint" : profile.authorityMode === "approval_required" ? "paper" : "sky"} />
        <MetricCard label="Markets" value={String(profile.watchMarkets.length)} detail={profile.watchMarkets.join(", ")} tone="paper" />
        <MetricCard label="Next run" value={!active ? "Paused" : profile.cadence === "on_demand" ? "Event driven" : profile.nextRunAt ? new Date(profile.nextRunAt).toLocaleTimeString() : "Scheduling"} detail={`${profile.cadence} cadence`} tone="orange" />
        <MetricCard label="Run capacity" value={`≈ ${runs}`} detail={`${available} available credits · ${perRun} estimated/run`} tone="mint" />
      </section>
      <div className="two-column-grid">
        <Panel title="Operating state" description="What this agent can do right now" tone="paper">
          <div className={styles.dataList}>
            <div><span>Analysis</span><strong>Automatic while active</strong></div>
            <div><span>Trade handling</span><strong>{mode === "Shadow" ? "Simulated fills" : mode === "Approval" ? "Waits for approval" : "Executes inside policy"}</strong></div>
            <div><span>Event triggers</span><strong>{profile.eventTriggers.length ? profile.eventTriggers.join(", ") : "None"}</strong></div>
            <div><span>Daily credit ceiling</span><strong>{profile.dailyCreditLimit.toLocaleString()} credits</strong></div>
          </div>
          <div className={styles.actions}>
            {active
              ? <button className={styles.danger} onClick={() => void setLifecycle({ status: "paused" })}>Pause agent</button>
              : <button className={styles.primary} onClick={() => void activate({}).then((result) =>
                syncSchedule({ profileId: result.profileId }))}>Activate agent</button>}
            <Link href="/agents/create">Edit setup</Link>
            <Link href="/agents/models">Models & keys</Link>
            <Link href="/agents/monitoring">Monitor decisions</Link>
            <Link href="/agents/policy">Edit guardrails</Link>
          </div>
        </Panel>
        <Panel title="Attention" description="Items that need you" tone="orange">
          <div className={styles.activityList}>
            <article className={styles.activityCard}><header><h3>Approvals</h3><StatusBadge tone={settings.approvals.length ? "warning" : "positive"}>{settings.approvals.length}</StatusBadge></header><p>Proposals waiting for a fresh quote and your decision.</p></article>
            <article className={styles.activityCard}><header><h3>Safety state</h3><StatusBadge tone={settings.emergencyStop ? "danger" : "positive"}>{settings.emergencyStop ? "Emergency stop" : "Clear"}</StatusBadge></header><p>Autopilot cannot exceed the active deterministic policy.</p></article>
          </div>
          <div className={styles.actions}><Link href="/agents/approvals">Review approvals</Link><Link href="/agents/activity">Open history</Link></div>
        </Panel>
      </div>
    </StrategyShell>
  );
}
