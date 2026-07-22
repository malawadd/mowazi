"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import StrategyShell from "@/components/StrategyShell";
import { EmptyState, MetricCard, Panel, StatusBadge } from "@/components/strategy-ui";
import styles from "@/components/agents/agent-portal.module.css";
import { monitoringRequest, usd, type MonitoringRun, type UsageRow } from "@/lib/agentMonitoring";

export default function MonitoringPage() {
  const [runs, setRuns] = useState<MonitoringRun[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [market, setMarket] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const suffix = market ? `?days=7&market=${encodeURIComponent(market)}` : "?days=7";
      const [runResult, usageResult] = await Promise.all([
        monitoringRequest<{ runs: MonitoringRun[] }>(`runs${suffix}`),
        monitoringRequest<{ usage: UsageRow[] }>("usage?days=7"),
      ]);
      setRuns(runResult.runs); setUsage(usageResult.usage); setError(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setLoading(false); }
  }, [market]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const stream = new EventSource("/api/agent-monitoring/stream");
    stream.addEventListener("trace", () => void load());
    return () => stream.close();
  }, [load]);

  const totals = useMemo(() => usage.reduce((sum, row) => ({
    calls: sum.calls + row.calls, successful: sum.successful + row.successful_calls,
    input: sum.input + row.input_tokens, cached: sum.cached + row.cached_input_tokens,
    output: sum.output + row.output_tokens, cost: sum.cost + row.provider_cost_microusd,
    credits: sum.credits + row.platform_credits, latency: sum.latency + row.latency_ms,
  }), { calls: 0, successful: 0, input: 0, cached: 0, output: 0, cost: 0, credits: 0, latency: 0 }), [usage]);
  const tokens = totals.input + totals.output;
  const cacheRate = totals.input ? totals.cached / totals.input : 0;
  const successRate = totals.calls ? totals.successful / totals.calls : 0;

  const exportUsage = () => {
    const headings = ["day", "provider", "model", "credential_source", "calls", "successful_calls", "input_tokens", "cached_input_tokens", "output_tokens", "provider_cost_microusd", "platform_credits"];
    const csv = [headings.join(","), ...usage.map((row) => headings.map((key) => JSON.stringify(row[key as keyof UsageRow] ?? "")).join(","))].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = `moeazi-agent-usage-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click(); URL.revokeObjectURL(link.href);
  };

  return <StrategyShell title="Agent monitoring" subtitle="Every model call, decision, cost, and downstream action">
    <div className={styles.monitoringToolbar}>
      <label className={styles.field}>Market filter
        <input value={market} onChange={(event) => setMarket(event.target.value.toUpperCase())} placeholder="All markets" />
      </label>
      <div className={styles.actions}><button type="button" onClick={() => void load()}>Refresh</button>
        <button type="button" disabled={!usage.length} onClick={exportUsage}>Export usage CSV</button></div>
    </div>
    <p className={styles.retentionNote}><strong>Seven-day detailed window.</strong> Sanitized inputs, outputs, and graph events expire automatically. Content-free daily usage remains available for billing history.</p>
    <section className="metric-grid">
      <MetricCard label="Runs" value={String(runs.length)} detail="Private analyses in the selected window" tone="sky" />
      <MetricCard label="Validated calls" value={`${totals.successful}/${totals.calls}`} detail={`${(successRate * 100).toFixed(0)}% success rate`} tone="mint" />
      <MetricCard label="Tokens" value={tokens.toLocaleString()} detail={`${(cacheRate * 100).toFixed(0)}% input cache rate`} tone="orange" />
      <MetricCard label="Provider spend" value={usd(totals.cost)} detail={`${totals.credits} Moeazi infrastructure credits`} tone="paper" />
    </section>
    {error ? <p className={styles.error}>{error}</p> : null}
    <div className="two-column-grid">
      <Panel title="Recent decision traces" description="Open a run to inspect its complete evidence-to-action graph" tone="paper">
        {loading ? <EmptyState title="Loading traces…" body="Reading tenant-scoped Timescale history." />
          : !runs.length ? <EmptyState title="No detailed traces yet." body="A completed private analysis will appear here without adding idle Convex traffic." />
            : <div className={styles.activityList}>{runs.map((run) => <article className={styles.activityCard} key={run.analysis_id}>
              <header><div><p className={styles.eyebrow}>{run.tier} · {new Date(run.created_at).toLocaleString()}</p><h3>{run.market}</h3></div>
                <StatusBadge tone={Math.abs(run.consensus) > 0.15 ? "positive" : "warning"}>{run.consensus > 0.15 ? "Bullish" : run.consensus < -0.15 ? "Bearish" : "Mixed"}</StatusBadge></header>
              <p>{Math.round(run.confidence * 100)}% confidence · {run.billing_route?.platformCredits ?? 0} credits · {usd(run.billing_route?.providerCostMicrousd ?? 0)} provider usage</p>
              <div className={styles.actions}><Link href={`/agents/monitoring/${run.analysis_id}`}>Open decision graph</Link></div>
            </article>)}</div>}
      </Panel>
      <Panel title="Model usage" description="Actual provider and credential-source utilization" tone="mint">
        {!usage.length ? <EmptyState title="No model usage yet." body="Validated and failed calls will be grouped here by day and model." />
          : <div className={styles.usageBars}>{usage.map((row) => {
            const width = Math.max(4, totals.calls ? row.calls / totals.calls * 100 : 0);
            return <article key={`${row.day}-${row.provider}-${row.model}-${row.credential_source}`}>
              <header><strong>{row.provider} · {row.model}</strong><span>{row.credential_source.toUpperCase()}</span></header>
              <div><i style={{ width: `${width}%` }} /></div>
              <p>{row.calls} calls · {(row.input_tokens + row.output_tokens).toLocaleString()} tokens · {usd(row.provider_cost_microusd)} · {row.platform_credits} credits</p>
            </article>;
          })}</div>}
      </Panel>
    </div>
  </StrategyShell>;
}
