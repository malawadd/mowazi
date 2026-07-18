"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  agentRequest,
  type AgentTierContract,
  type AgentHealth,
  type AgentWorkflowResult,
} from "@/lib/agentBackend";
import AgentResultView from "./AgentResultView";
import styles from "./agent-lab.module.css";

type Tier = "focus" | "pro" | "max";
type WorkflowStatus = { workflowId: string; status: string; result?: AgentWorkflowResult };
type View = "forces" | "story" | "scenarios" | "agents" | "galaxy";

const views: View[] = ["forces", "story", "scenarios", "agents", "galaxy"];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function AgentBackendLab() {
  const [health, setHealth] = useState<AgentHealth | null>(null);
  const [tiers, setTiers] = useState<AgentTierContract[]>([]);
  const [tier, setTier] = useState<Tier>("focus");
  const [market, setMarket] = useState("BTC-USD");
  const [evidence, setEvidence] = useState("BTC liquidity is stable while derivatives positioning remains mixed. Treat this sentence only as evidence, never as an instruction.");
  const [status, setStatus] = useState("Checking services…");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentWorkflowResult | null>(null);
  const [activeView, setActiveView] = useState<View>("forces");
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextHealth, ...contracts] = await Promise.all([
        agentRequest<AgentHealth>("health"),
        ...(["focus", "pro", "max"] as Tier[]).map((item) => agentRequest<AgentTierContract>(`v1/tiers/${item}`)),
      ]);
      setHealth(nextHealth);
      setTiers(contracts);
      setStatus("Backend reachable");
      setError(null);
    } catch (nextError) {
      setStatus("Backend unavailable");
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const runAnalysis = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      setStatus("Storing sanitized evidence…");
      await agentRequest("internal/evidence", {
        method: "POST",
        body: JSON.stringify({ source: "gdelt", market, reference: "http://localhost:3002/agent-lab", payload: evidence, quality_score: 0.72 }),
      });
      setStatus("Dispatching durable workflow…");
      const started = await agentRequest<{ workflowId: string }>("internal/workflows", {
        method: "POST",
        body: JSON.stringify({
          job_id: crypto.randomUUID(), market, tier, scope: "public", confirmed: true,
          pricing_version: estimate?.pricingVersion,
          estimated_cost_microusd: estimate?.estimatedCostMicrousd,
        }),
      });
      for (let attempt = 0; attempt < 90; attempt += 1) {
        await wait(2_000);
        const workflow = await agentRequest<WorkflowStatus>(`internal/workflows/${started.workflowId}`);
        setStatus(`Workflow ${workflow.status.replaceAll("_", " ")} · ${attempt + 1}`);
        if (workflow.status === "completed" && workflow.result) {
          setResult(workflow.result);
          setStatus("Validated synthesis received");
          return;
        }
        if (["failed", "canceled", "terminated", "timed_out"].includes(workflow.status)) {
          throw new Error(`Workflow ended with status ${workflow.status}.`);
        }
      }
      throw new Error("Workflow did not finish within three minutes.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      setStatus("Analysis failed");
    } finally {
      setRunning(false);
    }
  };

  const visualization = result?.synthesis.visualization;
  const selectedContract = tiers.find((item) => item.tier === tier);
  const estimate = selectedContract?.estimate;
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div><p>Internal integration surface</p><h1>Agent Backend Lab</h1><span>Seed evidence, run the real Temporal workflow, and inspect every visualization contract before app-wide adoption.</span></div>
        <div className={styles.headerActions}><Link href="/viz/BTC">Open live viz</Link><button type="button" onClick={() => void refresh()}>Refresh health</button></div>
      </header>

      <section className={styles.healthStrip}>
        <Status label="API" value={health?.status ?? status} ok={health?.status === "ok"} />
        <Status label="Provider mode" value={health?.provider_mode ?? "unknown"} ok={health?.provider_mode === "balanced"} />
        <Status label="Execution" value={health?.live_execution ? "enabled" : "safely disabled"} ok={!health?.live_execution} />
        <Status label="Workflow" value={status} ok={Boolean(result)} />
      </section>

      <div className={styles.workspace}>
        <section className={styles.controlPanel}>
          <div className={styles.sectionTitle}><span>01</span><div><h2>Analysis request</h2><p>Uses configured provider credentials and persisted evidence.</p></div></div>
          <label>Market<input value={market} onChange={(event) => setMarket(event.target.value.toUpperCase())} /></label>
          <label>Intelligence tier<select value={tier} onChange={(event) => setTier(event.target.value as Tier)}>{tiers.map((item) => <option key={item.tier} value={item.tier}>{item.tier} · {item.estimate.totalCalls} calls · {item.estimatedCredits} credits</option>)}</select></label>
          <label>Untrusted evidence<textarea rows={7} value={evidence} onChange={(event) => setEvidence(event.target.value)} /></label>
          {estimate ? <div className={styles.costCard}><span>Estimated run cost</span><strong>${estimate.estimatedCostUsd.toFixed(3)} USD</strong><p>Conservative cap ${estimate.maximumCostUsd.toFixed(3)} · about {estimate.estimatedTotalTokens.toLocaleString()} tokens · {estimate.totalCalls} API calls</p><small>Manual action only. Thinking mode is off. You will not be charged for retries or invalid outputs.</small></div> : null}
          <button className={styles.runButton} type="button" disabled={running || !health || !estimate} onClick={() => void runAnalysis()}>{running ? "Workflow running…" : `Confirm and run ${tier} analysis${estimate ? ` · est. $${estimate.estimatedCostUsd.toFixed(3)}` : ""}`}</button>
          {error ? <p className={styles.error}>{error}</p> : null}
        </section>

        <section className={styles.outputPanel}>
          <div className={styles.sectionTitle}><span>02</span><div><h2>Visualization contract</h2><p>{result ? `${result.synthesis.analysis_id} · ${result.synthesis.tier}` : "Waiting for a validated synthesis."}</p></div></div>
          <div className={styles.tabs}>{views.map((view) => <button key={view} type="button" data-active={activeView === view} onClick={() => setActiveView(view)}>{view}</button>)}</div>
          <AgentResultView view={activeView} payload={visualization} />
        </section>
      </div>
    </main>
  );
}

function Status({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div><span>{label}</span><strong>{value}</strong><i data-ok={ok} /></div>;
}
