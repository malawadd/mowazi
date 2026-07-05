"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import { EmptyState, Panel, StatusBadge } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";

type ExecutionRow = {
  _id: string;
  summary: string;
  kind: string;
  status: string;
  detail?: string | null;
  txHash?: string | null;
  requestId?: string | null;
};

type AuditRow = {
  _id: string;
  summary: string;
  kind: string;
  actor: string;
  detail?: string | null;
};

type IncidentRow = {
  _id: string;
  code: string;
  summary: string;
  severity: string;
  detail?: string | null;
};

type WithdrawalRow = {
  _id: string;
  amount: string;
  asset: string;
  status: string;
  destination: string;
};

type ActivitySectionKey = "executions" | "auditEvents" | "incidents" | "withdrawals";

const INITIAL_VISIBLE_COUNT = 5;
const VISIBLE_INCREMENT = 5;

export default function ActivityPage() {
  const activity = useQuery(api.queries.getExecutionActivity, {});
  const [visibleCounts, setVisibleCounts] = useState<Record<ActivitySectionKey, number>>({
    executions: INITIAL_VISIBLE_COUNT,
    auditEvents: INITIAL_VISIBLE_COUNT,
    incidents: INITIAL_VISIBLE_COUNT,
    withdrawals: INITIAL_VISIBLE_COUNT,
  });

  if (!activity) {
    return (
      <StrategyShell title="Activity" subtitle="Execution ledger and operator audit stream">
        <EmptyState title="Loading activity..." body="Fetching execution history from Convex." />
      </StrategyShell>
    );
  }

  const showMore = (section: ActivitySectionKey) => {
    setVisibleCounts((current) => ({
      ...current,
      [section]: current[section] + VISIBLE_INCREMENT,
    }));
  };

  const visibleExecutions = activity.executions.slice(0, visibleCounts.executions);
  const visibleAuditEvents = activity.auditEvents.slice(0, visibleCounts.auditEvents);
  const visibleIncidents = activity.incidents.slice(0, visibleCounts.incidents);
  const visibleWithdrawals = activity.withdrawals.slice(0, visibleCounts.withdrawals);

  return (
    <StrategyShell title="Activity" subtitle="Execution ledger and operator audit stream">
      <div className="two-column-grid">
        <Panel title="Executions" description="Bounded execution actions recorded by the worker" tone="paper">
          <div className="stack-list">
            {activity.executions.length === 0 ? (
              <p className="muted-copy">No execution events recorded yet.</p>
            ) : (
              visibleExecutions.map((execution: ExecutionRow) => (
                <article key={execution._id} className="list-card">
                  <div className="list-card-head">
                    <div>
                      <h4>{execution.summary}</h4>
                      <p>{execution.kind}</p>
                    </div>
                    <StatusBadge tone={execution.status === "filled" ? "positive" : execution.status === "failed" ? "danger" : "info"}>
                      {execution.status}
                    </StatusBadge>
                  </div>
                  <p className="card-detail-wrap">{execution.detail ?? "No detail recorded."}</p>
                  <p className="mono-label card-detail-wrap">
                    {execution.txHash ?? execution.requestId ?? "No transaction hash"}
                  </p>
                </article>
              ))
            )}
            {activity.executions.length > visibleCounts.executions ? (
              <div className="activity-more">
                <button className="secondary-button" type="button" onClick={() => showMore("executions")}>
                  Show 5 more
                </button>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Audit" description="Configuration and operator changes" tone="lilac">
          <div className="stack-list">
            {activity.auditEvents.length === 0 ? (
              <p className="muted-copy">No audit events recorded yet.</p>
            ) : (
              visibleAuditEvents.map((event: AuditRow) => (
                <article key={event._id} className="list-card">
                  <div className="list-card-head">
                    <div>
                      <h4>{event.summary}</h4>
                      <p>{event.kind}</p>
                    </div>
                    <StatusBadge tone="info">{event.actor}</StatusBadge>
                  </div>
                  <p className="card-detail-wrap">{event.detail ?? "No additional detail."}</p>
                </article>
              ))
            )}
            {activity.auditEvents.length > visibleCounts.auditEvents ? (
              <div className="activity-more">
                <button className="secondary-button" type="button" onClick={() => showMore("auditEvents")}>
                  Show 5 more
                </button>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>

      <div className="two-column-grid">
        <Panel title="Incidents" description="Operational incidents and recovery breadcrumbs" tone="rose">
          <div className="stack-list">
            {activity.incidents.length === 0 ? (
              <p className="muted-copy">No incidents recorded yet.</p>
            ) : (
              visibleIncidents.map((incident: IncidentRow) => (
                <article key={incident._id} className="list-card">
                  <div className="list-card-head">
                    <div>
                      <h4>{incident.code}</h4>
                      <p>{incident.summary}</p>
                    </div>
                    <StatusBadge tone={incident.severity === "critical" ? "danger" : incident.severity === "warning" ? "warning" : "info"}>
                      {incident.severity}
                    </StatusBadge>
                  </div>
                  <p className="card-detail-wrap">{incident.detail ?? "No detail recorded."}</p>
                </article>
              ))
            )}
            {activity.incidents.length > visibleCounts.incidents ? (
              <div className="activity-more">
                <button className="secondary-button" type="button" onClick={() => showMore("incidents")}>
                  Show 5 more
                </button>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Withdrawals" description="Recent withdrawal pipeline activity" tone="paper">
          <div className="stack-list">
            {activity.withdrawals.length === 0 ? (
              <p className="muted-copy">No withdrawals recorded yet.</p>
            ) : (
              visibleWithdrawals.map((withdrawal: WithdrawalRow) => (
                <article key={withdrawal._id} className="list-card">
                  <div className="list-card-head">
                    <div>
                      <h4>{withdrawal.amount} {withdrawal.asset}</h4>
                      <p className="card-detail-wrap">{withdrawal.destination}</p>
                    </div>
                    <StatusBadge tone={withdrawal.status === "completed" ? "positive" : withdrawal.status === "failed" ? "danger" : "warning"}>
                      {withdrawal.status}
                    </StatusBadge>
                  </div>
                </article>
              ))
            )}
            {activity.withdrawals.length > visibleCounts.withdrawals ? (
              <div className="activity-more">
                <button className="secondary-button" type="button" onClick={() => showMore("withdrawals")}>
                  Show 5 more
                </button>
              </div>
            ) : null}
          </div>
        </Panel>
      </div>
    </StrategyShell>
  );
}
