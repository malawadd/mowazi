"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import { EmptyState, Panel, StatusBadge } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import styles from "@/components/agents/agent-portal.module.css";

export default function AgentApprovalsPage() {
  const settings = useQuery(api.agentQueries.getAgentSettings, {});
  const decide = useMutation(api.agentMutations.decideTradeProposal);
  const dispatch = useAction(api.agentActions.dispatchApprovedProposal);
  const [message, setMessage] = useState<string | null>(null);
  const pending = settings?.proposals.filter((item) => item.status === "pending_approval") ?? [];

  const act = async (proposalId: Id<"tradeProposals">, decision: "approved" | "rejected") => {
    try {
      await decide({ proposalId, decision });
      if (decision === "approved") await dispatch({ proposalId });
      setMessage(decision === "approved"
        ? "Approved. Execution will fetch a new quote and rerun every policy check; the displayed quote is not reused."
        : "Proposal rejected. No order will be submitted.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
  };

  return <StrategyShell title="Approvals" subtitle="Expiring proposals, fresh checks">
    {message ? <p className={styles.notice}>{message}</p> : null}
    {!pending.length ? <Panel title="Proposal inbox" description="Approval agents place proposals here" tone="orange">
      <EmptyState title="Nothing needs your approval." body="New proposals appear with a clear thesis, cost, expiry, and policy context." />
    </Panel> : <div className={styles.activityList}>{pending.map((proposal) =>
      <article className={styles.activityCard} key={proposal._id}>
        <header><div><p className={styles.eyebrow}>{proposal.marketId}</p><h3>{proposal.side === "long" ? "Buy / long" : "Sell / short"} proposal</h3></div>
          <StatusBadge tone={proposal.expiresAt <= Date.now() ? "danger" : "warning"}>{proposal.expiresAt <= Date.now() ? "Expired" : `Expires ${new Date(proposal.expiresAt).toLocaleTimeString()}`}</StatusBadge></header>
        <p>{proposal.payload?.reasoning ?? proposal.payload?.thesis ?? "The agent found a policy-eligible setup. Review its evidence in the analysis detail."}</p>
        <div className={styles.dataList}>
          <div><span>Confidence</span><strong>{Math.round(proposal.confidence * 100)}%</strong></div>
          <div><span>Consensus</span><strong>{Math.round(proposal.consensus * 100)}%</strong></div>
          <div><span>Estimated size</span><strong>${Number(proposal.payload?.size_usd ?? proposal.payload?.sizeUsd ?? 0).toFixed(2)}</strong></div>
          <div><span>Execution behavior</span><strong>Requote → policy check → submit</strong></div>
        </div>
        <div className={styles.actions}><button className={styles.primary} disabled={proposal.expiresAt <= Date.now()} onClick={() => void act(proposal._id, "approved")}>Approve with fresh checks</button>
          <button className={styles.danger} onClick={() => void act(proposal._id, "rejected")}>Reject</button></div>
      </article>)}</div>}
  </StrategyShell>;
}
