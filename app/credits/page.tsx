"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import { EmptyState, MetricCard, Panel } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";
import styles from "@/components/agents/agent-portal.module.css";

export default function CreditsPage() {
  const credits = useQuery(api.agentQueries.getCredits, {});
  const settings = useQuery(api.agentQueries.getAgentSettings, {});
  const models = useQuery(api.agentModels.getModelSettings, {});
  const claim = useMutation(api.agentCredits.claimStarterCredits);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tier = settings?.profile?.tier ?? "focus";
  const effectiveModel = models?.effective as { estimatedCredits?: number; credits?: number; estimatedProviderCostMicrousd?: number } | undefined;
  const perRun = effectiveModel?.estimatedCredits ?? effectiveModel?.credits
    ?? (tier === "max" ? 113 : tier === "pro" ? 62 : 25);
  const providerMicrousd = effectiveModel?.estimatedProviderCostMicrousd ?? 0;
  const usdPerRun = providerMicrousd / 1_000_000;
  const available = credits?.available ?? 0;
  const runs = Math.floor(available / perRun);

  const claimCredits = async () => {
    setBusy(true);
    try {
      const result = await claim({});
      setMessage(result.claimed ? `${result.amount} development credits added.` : "Starter credits were already claimed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  return <StrategyShell title="Credits" subtitle="Upfront estimates and immutable usage">
    <section className="metric-grid">
      <MetricCard label="Available" value={available.toLocaleString()} detail="Balance minus active reservations" tone="mint" />
      <MetricCard label="Reserved" value={(credits?.reserved ?? 0).toLocaleString()} detail="Held for active validated runs" tone="orange" />
      <MetricCard label="Runs remaining" value={`≈ ${runs}`} detail={`At ${tier} tier · ${perRun} credits/run`} tone="sky" />
      <MetricCard label="BYOK provider estimate" value={`$${usdPerRun.toFixed(4)}/run`} detail="Paid directly to your selected provider; platform routes show $0" tone="paper" />
    </section>
    <div className="two-column-grid">
      <Panel title="Closed beta allocation" description="Purchasing is intentionally not part of this milestone" tone="sky">
        <p>Eligible development accounts can claim one starter allocation. Operator grants use the same immutable integer-credit ledger.</p>
        <div className={styles.actions}><button className={styles.primary} disabled={busy || credits?.claimedStarter} onClick={() => void claimCredits()}>{credits?.claimedStarter ? "Starter allocation claimed" : busy ? "Claiming…" : "Claim beta credits"}</button></div>
        {message ? <p className={styles.notice}>{message}</p> : null}
      </Panel>
      <Panel title="How settlement works" description="Only useful validated outputs are billed" tone="mint">
        <div className={styles.dataList}>
          <div><span>Before a run</span><strong>Maximum estimate reserved</strong></div>
          <div><span>Successful outputs</span><strong>Settled at the rate card</strong></div>
          <div><span>Unused reservation</span><strong>Released immediately</strong></div>
          <div><span>Failed validated outputs</span><strong>0 Moeazi credits</strong></div>
          <div><span>BYOK attempts</span><strong>Provider may still bill tokens</strong></div>
        </div>
      </Panel>
    </div>
    <Panel title="Credit ledger" description="Every grant, reservation, release, and settlement" tone="paper">
      {!credits?.ledger.length ? <EmptyState title="No ledger entries." body="Claim starter credits or receive an operator grant to begin." />
        : <div style={{ overflowX: "auto" }}><table className={styles.ledger}><thead><tr><th>Time</th><th>Type</th><th>Amount</th><th>Balance</th><th>Reference</th></tr></thead>
          <tbody>{credits.ledger.map((row) => <tr key={row._id}><td>{new Date(row.createdAt).toLocaleString()}</td><td>{row.kind}</td><td>{row.amount}</td><td>{row.balanceAfter}</td><td>{row.reference}</td></tr>)}</tbody></table></div>}
    </Panel>
  </StrategyShell>;
}
