"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import { EmptyState, Panel, StatusBadge } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_AUTOMATION_POLICY, type AutomationPolicy } from "@/convex/helpers/agentPolicy";
import styles from "@/components/agents/agent-portal.module.css";

const venues = ["hyperliquid", "lighter", "orderly", "gmx", "ostium", "uniswap"];

export default function AgentPolicyPage() {
  const settings = useQuery(api.agentQueries.getAgentSettings, {});
  const saveDraft = useMutation(api.agentProfiles.saveAutomationPolicy);
  const activate = useMutation(api.agentMutations.activateAutomationPolicy);
  const [policy, setPolicy] = useState<AutomationPolicy>(DEFAULT_AUTOMATION_POLICY);
  const [advanced, setAdvanced] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings?.activePolicy?.policy) setPolicy(settings.activePolicy.policy as AutomationPolicy);
  }, [settings?.activePolicy]);

  if (settings === undefined) return <StrategyShell title="Guardrails" subtitle="Deterministic limits before every order"><EmptyState title="Loading policy…" body="Reading active and draft versions." /></StrategyShell>;
  if (!settings?.profile) return <StrategyShell title="Guardrails" subtitle="Deterministic limits before every order"><EmptyState title="Create an agent first." body="A policy belongs to one strategy account agent." /></StrategyShell>;

  const number = (key: keyof AutomationPolicy, value: number) => setPolicy((current) => ({ ...current, [key]: value }));
  const save = async () => {
    setBusy(true); setMessage(null);
    try {
      const result = await saveDraft({ policyJson: JSON.stringify(policy) });
      setMessage(`Draft version ${result.version} saved. Review its diff, then activate explicitly.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const latestDraft = settings.drafts[0];
  const diff = (latestDraft?.diff ?? {}) as Record<string, { from: unknown; to: unknown }>;

  return (
    <StrategyShell title="Guardrails" subtitle="Readable limits, explicit activation">
      <div className={styles.heroRow}><div><p className={styles.eyebrow}>Execution policy</p><h3>What your agent may never exceed</h3>
        <p>These checks run outside the LLM against a fresh quote before every real submission.</p></div>
        <StatusBadge tone={settings.activePolicy ? "positive" : "warning"}>{settings.activePolicy ? `Active v${settings.activePolicy.version}` : "No active policy"}</StatusBadge>
      </div>
      <Panel title="Core limits" description="The controls most people need" tone="sky">
        <div className={styles.policyGrid}>
          <NumberField label="Maximum order (USD)" value={policy.maxOrderUsd} onChange={(v) => number("maxOrderUsd", v)} />
          <NumberField label="Maximum daily volume" value={policy.maxDailyVolumeUsd} onChange={(v) => number("maxDailyVolumeUsd", v)} />
          <NumberField label="Maximum leverage" value={policy.maxLeverage} onChange={(v) => number("maxLeverage", v)} />
          <NumberField label="Maximum exposure" value={policy.maxExposureUsd} onChange={(v) => number("maxExposureUsd", v)} />
          <NumberField label="Maximum daily loss" value={policy.maxDailyLossUsd} onChange={(v) => number("maxDailyLossUsd", v)} />
          <NumberField label="Maximum drawdown %" value={policy.maxDailyDrawdownPct} onChange={(v) => number("maxDailyDrawdownPct", v)} />
        </div>
        <label className={`${styles.field} ${styles.full}`}>Allowed markets
          <input value={policy.allowedMarkets.join(", ")} onChange={(event) => setPolicy((current) => ({ ...current, allowedMarkets: event.target.value.split(",").map((v) => v.trim().toUpperCase()).filter(Boolean) }))} />
        </label>
        <div className={styles.policyGrid}>
          {venues.map((venue) => <label className={styles.checkRow} key={venue}>
            <input type="checkbox" checked={policy.allowedVenues.includes(venue)}
              onChange={(event) => setPolicy((current) => ({ ...current, allowedVenues: event.target.checked ? [...current.allowedVenues, venue] : current.allowedVenues.filter((item) => item !== venue) }))} />
            {venue[0].toUpperCase() + venue.slice(1)}
          </label>)}
        </div>
      </Panel>
      <Panel title="Advanced controls" description="Freshness, conviction, cooldowns, and protective exits" tone="paper"
        actions={<button className="secondary-button" type="button" onClick={() => setAdvanced(!advanced)}>{advanced ? "Hide advanced" : "Show advanced"}</button>}>
        {advanced ? <div className={styles.policyGrid}>
          <NumberField label="Maximum slippage (bps)" value={policy.maxSlippageBps} onChange={(v) => number("maxSlippageBps", v)} />
          <NumberField label="Maximum analysis age (ms)" value={policy.maxAnalysisAgeMs} onChange={(v) => number("maxAnalysisAgeMs", v)} />
          <NumberField label="Minimum confidence" value={policy.minConfidence} step={0.05} onChange={(v) => number("minConfidence", v)} />
          <NumberField label="Minimum consensus" value={policy.minConsensus} step={0.05} onChange={(v) => number("minConsensus", v)} />
          <NumberField label="Cooldown (seconds)" value={policy.cooldownSeconds} onChange={(v) => number("cooldownSeconds", v)} />
          <NumberField label="Concurrent positions" value={policy.maxConcurrentPositions} onChange={(v) => number("maxConcurrentPositions", v)} />
          <NumberField label="Daily credit budget" value={policy.dailyCreditBudget} onChange={(v) => number("dailyCreditBudget", v)} />
          <label className={styles.checkRow}><input type="checkbox" checked={policy.requireStopLoss} onChange={(e) => setPolicy((p) => ({ ...p, requireStopLoss: e.target.checked }))} />Require stop loss</label>
          <label className={styles.checkRow}><input type="checkbox" checked={policy.requireTakeProfit} onChange={(e) => setPolicy((p) => ({ ...p, requireTakeProfit: e.target.checked }))} />Require take profit</label>
        </div> : <p className={styles.notice}>Advanced controls remain active even while hidden.</p>}
        <div className={styles.actions}><button className={styles.primary} disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save as new draft"}</button></div>
        {message ? <p className={styles.notice}>{message}</p> : null}
      </Panel>
      {latestDraft ? <Panel title={`Draft version ${latestDraft.version}`} description="Field-by-field changes from the active policy" tone="orange">
        <div className={styles.diff}>
          {Object.entries(diff).length ? Object.entries(diff).map(([key, change]) =>
            <div className={styles.diffRow} key={key}><strong>{key}</strong><span>From: {JSON.stringify(change.from)}</span><span>To: {JSON.stringify(change.to)}</span></div>)
            : <p>No field changes in this draft.</p>}
        </div>
        <div className={styles.actions}><button className={styles.primary} onClick={() => void activate({ policyId: latestDraft._id as Id<"automationPolicies"> })}>Activate this version</button></div>
      </Panel> : null}
    </StrategyShell>
  );
}

function NumberField({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (value: number) => void }) {
  return <label className={styles.field}>{label}<input type="number" min={0} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}
