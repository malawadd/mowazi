"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import { Panel } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";
import styles from "@/components/agents/agent-portal.module.css";

type Mode = "shadow" | "approval_required" | "autopilot";
type Tier = "focus" | "pro" | "max";
type Cadence = "on_demand" | "15m" | "5m" | "2m" | "1m";

const modes = [
  { id: "shadow" as const, title: "Shadow", copy: "Analyzes automatically and records simulated fills. No real order can be signed." },
  { id: "approval_required" as const, title: "Approval", copy: "Builds expiring proposals automatically. You approve after reviewing the reasoning." },
  { id: "autopilot" as const, title: "Autopilot", copy: "Requotes and executes automatically, but only after every deterministic guardrail passes." },
];
const tierCost = {
  focus: { credits: 25, usd: 0.005843, calls: 7 },
  pro: { credits: 62, usd: 0.016044, calls: 18 },
  max: { credits: 113, usd: 0.031257, calls: 33 },
};

export default function CreateAgentPage() {
  const router = useRouter();
  const current = useQuery(api.agentQueries.getAgentSettings, {});
  const save = useMutation(api.agentProfiles.saveAgentProfile);
  const [step, setStep] = useState(1);
  const [name, setName] = useState("Moeazi Scout");
  const [mode, setMode] = useState<Mode>("shadow");
  const [tier, setTier] = useState<Tier>("focus");
  const [cadence, setCadence] = useState<Cadence>("15m");
  const [markets, setMarkets] = useState("BTC-PERP");
  const [dailyCredits, setDailyCredits] = useState(100);
  const [events, setEvents] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [autopilotPhrase, setAutopilotPhrase] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const profile = current?.profile;
    if (!profile) return;
    setName(profile.name);
    setMode(profile.authorityMode as Mode);
    setTier(profile.tier);
    setCadence(profile.cadence);
    setMarkets(profile.watchMarkets.join(", "));
    setDailyCredits(profile.dailyCreditLimit);
    setEvents(profile.eventTriggers.length > 0);
  }, [current?.profile]);

  const marketList = useMemo(() => markets.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean), [markets]);
  const cost = tierCost[tier];
  const effectiveRuns = Math.max(1, Math.floor(dailyCredits / cost.credits));
  const estimatedDailyUsd = effectiveRuns * cost.usd;
  const canFinish = confirmed && (mode !== "autopilot" || autopilotPhrase === "ENABLE AUTOPILOT");

  const finish = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await save({
        name, authorityMode: mode, tier, cadence,
        watchMarkets: marketList,
        eventTriggers: events ? ["material_market_event"] : [],
        dailyCreditLimit: Math.floor(dailyCredits),
      });
      router.push("/agents");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <StrategyShell title="Create agent" subtitle="Four decisions, one accountable team">
      <div className={styles.wizard}>
        <div className={styles.progress} aria-label={`Step ${step} of 4`}>
          {["Identity", "Intelligence", "Budget", "Review"].map((label, index) =>
            <span key={label} data-active={step === index + 1}>{index + 1}. {label}</span>)}
        </div>

        {step === 1 ? <Panel title="Name and authority" description="All modes analyze automatically; authority controls what happens after analysis." tone="sky">
          <div className={styles.formGrid}>
            <label className={`${styles.field} ${styles.full}`}>Agent name
              <input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
              <small>Use a name you will recognize in approvals and activity records.</small>
            </label>
          </div>
          <div className={styles.wizardModes}>
            {modes.map((item) => <article className={styles.modeCard} data-mode={item.id} key={item.id}>
              <h3>{item.title}</h3><p>{item.copy}</p>
              <button type="button" aria-pressed={mode === item.id} onClick={() => setMode(item.id)}>
                {mode === item.id ? "Selected" : `Choose ${item.title}`}
              </button>
            </article>)}
          </div>
        </Panel> : null}

        {step === 2 ? <Panel title="Markets and intelligence" description="Choose what the specialist team watches and how often it wakes." tone="orange">
          <div className={styles.formGrid}>
            <label className={`${styles.field} ${styles.full}`}>Markets
              <input value={markets} onChange={(event) => setMarkets(event.target.value)} placeholder="BTC-PERP, ETH-PERP" />
              <small>Comma separated. Development Lite Mode clamps this to one actively analyzed market.</small>
            </label>
            <label className={styles.field}>Intelligence tier
              <select value={tier} onChange={(event) => setTier(event.target.value as Tier)}>
                <option value="focus">Focus · 6 specialist roles</option>
                <option value="pro">Pro · 12 specialist roles</option>
                <option value="max">Max · 20 specialist roles</option>
              </select>
            </label>
            <label className={styles.field}>Cadence
              <select value={cadence} onChange={(event) => setCadence(event.target.value as Cadence)}>
                <option value="on_demand">Material events only</option><option value="15m">Every 15 minutes</option>
                <option value="5m">Every 5 minutes</option><option value="2m">Every 2 minutes</option><option value="1m">Every minute</option>
              </select>
            </label>
            <label className={`${styles.checkRow} ${styles.full}`}>
              <input type="checkbox" checked={events} onChange={(event) => setEvents(event.target.checked)} />
              Wake this agent for material market events in addition to its cadence.
            </label>
          </div>
        </Panel> : null}

        {step === 3 ? <Panel title="Resource budget" description="The agent stops before it can exceed this daily credit ceiling." tone="mint">
          <div className={styles.formGrid}>
            <label className={styles.field}>Daily credit ceiling
              <input type="number" min={0} step={1} value={dailyCredits} onChange={(event) => setDailyCredits(Number(event.target.value))} />
            </label>
            <div className={styles.costBox}><p className={styles.eyebrow}>Usage forecast</p>
              <strong>Up to {effectiveRuns} runs/day</strong>
              <p>Estimated ${estimatedDailyUsd.toFixed(3)}/day · ${cost.usd.toFixed(3)}/run · maximum provider route is shown before activation.</p>
            </div>
          </div>
          <p className={styles.notice}>Estimate uses rate card deepseek-v4-2026-04-24. Failed, malformed, or retried provider calls are not billed to the user.</p>
        </Panel> : null}

        {step === 4 ? <Panel title="Review and save draft" description="Saving does not activate the schedule. You activate from the agent overview." tone="paper">
          <div className={styles.reviewBox}>
            <div className={styles.dataList}>
              <div><span>Name</span><strong>{name}</strong></div>
              <div><span>Mode</span><strong>{modes.find((item) => item.id === mode)?.title}</strong></div>
              <div><span>Coverage</span><strong>{marketList.join(", ") || "No market"}</strong></div>
              <div><span>Intelligence</span><strong>{tier} · {cost.calls} estimated calls</strong></div>
              <div><span>Schedule</span><strong>{cadence}{events ? " + material events" : ""}</strong></div>
              <div><span>Maximum daily budget</span><strong>{dailyCredits} credits · ≈ ${estimatedDailyUsd.toFixed(3)}</strong></div>
            </div>
          </div>
          {mode === "autopilot" ? <label className={`${styles.field} ${styles.full}`}>Autopilot confirmation
            <input value={autopilotPhrase} onChange={(event) => setAutopilotPhrase(event.target.value)} placeholder="ENABLE AUTOPILOT" />
            <small>Autopilot can place real trades only when deployment, venue certification, policy, credits, and system health all allow it.</small>
          </label> : null}
          <label className={styles.checkRow}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            I reviewed the authority, cost estimate, markets, and daily budget.</label>
          {message ? <p className={styles.error}>{message}</p> : null}
        </Panel> : null}

        <div className={styles.actions}>
          {step > 1 ? <button type="button" onClick={() => setStep(step - 1)}>Back</button> : null}
          {step < 4 ? <button className={styles.primary} type="button" disabled={step === 1 ? name.trim().length < 2 : step === 2 ? marketList.length === 0 : dailyCredits < 0} onClick={() => setStep(step + 1)}>Continue</button>
            : <button className={styles.primary} type="button" disabled={!canFinish || saving} onClick={() => void finish()}>{saving ? "Saving…" : "Save agent draft"}</button>}
        </div>
      </div>
    </StrategyShell>
  );
}
