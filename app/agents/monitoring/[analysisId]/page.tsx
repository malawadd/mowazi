"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import StrategyShell from "@/components/StrategyShell";
import { EmptyState, MetricCard, Panel } from "@/components/strategy-ui";
import TraceGraph from "@/components/agents/TraceGraph";
import styles from "@/components/agents/agent-portal.module.css";
import { monitoringRequest, usd, type TraceContract } from "@/lib/agentMonitoring";

export default function MonitoringRunPage() {
  const params = useParams<{ analysisId: string }>();
  const analysisId = params.analysisId;
  const [trace, setTrace] = useState<TraceContract | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setTrace(await monitoringRequest<TraceContract>(`runs/${analysisId}`)); setError(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, [analysisId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const stream = new EventSource("/api/agent-monitoring/stream");
    stream.addEventListener("trace", (event) => {
      try { if (JSON.parse((event as MessageEvent).data).analysis_id === analysisId) void load(); } catch { return; }
    });
    return () => stream.close();
  }, [analysisId, load]);

  const download = () => {
    if (!trace) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(trace, null, 2)], { type: "application/json" }));
    link.download = `moeazi-trace-${analysisId}.json`; link.click(); URL.revokeObjectURL(link.href);
  };

  if (error) return <StrategyShell title="Decision trace" subtitle="Evidence to action, without hidden reasoning">
    <Panel title="Trace unavailable" description="Detailed traces expire after seven days" tone="orange">
      <p className={styles.error}>{error}</p><div className={styles.actions}><Link href="/agents/monitoring">Back to monitoring</Link></div>
    </Panel>
  </StrategyShell>;
  if (!trace) return <StrategyShell title="Decision trace" subtitle="Evidence to action, without hidden reasoning">
    <EmptyState title="Loading decision graph…" body="Reading sanitized model inputs, outputs, usage, and checks." />
  </StrategyShell>;

  const run = trace.run;
  const billing = run.billing_route ?? {};
  return <StrategyShell title="Decision trace" subtitle={`${run.market} · ${run.tier} team · ${new Date(run.created_at).toLocaleString()}`}>
    <div className={styles.monitoringToolbar}><div className={styles.actions}><Link href="/agents/monitoring">← All runs</Link>
      <button type="button" onClick={download}>Export sanitized JSON</button></div></div>
    <section className="metric-grid">
      <MetricCard label="Consensus" value={`${run.consensus > 0 ? "+" : ""}${(run.consensus * 100).toFixed(0)}`} detail={run.consensus > 0.15 ? "Bullish" : run.consensus < -0.15 ? "Bearish" : "Mixed"} tone="sky" />
      <MetricCard label="Confidence" value={`${(run.confidence * 100).toFixed(0)}%`} detail={`${(run.disagreement * 100).toFixed(0)}% disagreement`} tone="mint" />
      <MetricCard label="Provider usage" value={usd(billing.providerCostMicrousd ?? 0)} detail={(billing.credentialSources ?? ["platform"]).join(" + ")} tone="orange" />
      <MetricCard label="Infrastructure" value={`${billing.platformCredits ?? 0} credits`} detail={`${trace.graph.nodes.length} auditable nodes`} tone="paper" />
    </section>
    <Panel title="Evidence-to-action graph" description="Select any node to inspect its sanitized contract" tone="paper">
      <TraceGraph contract={trace.graph} />
    </Panel>
  </StrategyShell>;
}
