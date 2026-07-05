"use client";

import { useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import { DataRow, EmptyState, Panel, StatusBadge } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";

type AlertRow = {
  _id: string;
  code: string;
  message: string;
  severity: string;
  detail?: string | null;
};

type VenueStateRow = {
  _id: string;
  venueRole: string;
  status: string;
  summary: string;
  syncedAt: number;
};

type IncidentRow = {
  _id: string;
  code: string;
  summary: string;
  detail?: string | null;
  severity: string;
  runbook?: string | null;
};

function formatUsd(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "N/A";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

export default function RiskPage() {
  const risk = useQuery(api.queries.getRiskStatus, {});

  if (!risk?.hasStrategyAccount) {
    return (
      <StrategyShell title="Risk" subtitle="Alerts, exposure, and pause state">
        <EmptyState
          title="No risk profile available yet."
          body="Provision the strategy account to begin collecting risk snapshots."
        />
      </StrategyShell>
    );
  }

  const strategyAccount = risk.strategyAccount;

  return (
    <StrategyShell title="Risk" subtitle="Alerts, exposure, and pause state">
      <div className="two-column-grid">
        <Panel title="Snapshot" description="Latest equity and exposure view" tone="paper">
          <div className="stack-list">
            <DataRow label="Status" value={<StatusBadge tone={strategyAccount?.status === "active" ? "positive" : "warning"}>{strategyAccount?.status ?? "unknown"}</StatusBadge>} />
            <DataRow label="Health" value={<StatusBadge tone={strategyAccount?.healthStatus === "ready" ? "positive" : strategyAccount?.healthStatus === "degraded" ? "danger" : "warning"}>{strategyAccount?.healthStatus ?? "unknown"}</StatusBadge>} />
            <DataRow label="Emergency stop" value={strategyAccount?.emergencyStop ? "Active" : "Clear"} />
            <DataRow label="Health reason" value={strategyAccount?.healthReason ?? "No health note recorded."} />
            <DataRow label="Total equity" value={formatUsd(risk.latestSnapshot?.totalEquityUsd)} />
            <DataRow label="LP value" value={formatUsd(risk.latestSnapshot?.lpValueUsd)} />
            <DataRow label="Hedge value" value={formatUsd(risk.latestSnapshot?.hedgeValueUsd)} />
            <DataRow label="Net exposure" value={formatUsd(risk.latestSnapshot?.netExposureUsd)} />
          </div>
        </Panel>

        <Panel title="Open alerts" description="Warnings emitted by the worker or operator actions" tone="rose">
          <div className="stack-list">
            {risk.alerts.length === 0 ? (
              <p className="muted-copy">No active alerts.</p>
            ) : (
              risk.alerts.map((alert: AlertRow) => (
                <article key={alert._id} className="list-card">
                  <div className="list-card-head">
                    <div>
                      <h4>{alert.code}</h4>
                      <p>{alert.message}</p>
                    </div>
                    <StatusBadge tone={alert.severity === "critical" ? "danger" : alert.severity === "warning" ? "warning" : "info"}>
                      {alert.severity}
                    </StatusBadge>
                  </div>
                  <p>{alert.detail ?? "No extra detail recorded."}</p>
                </article>
              ))
            )}
          </div>
        </Panel>
      </div>

      <div className="two-column-grid">
        <Panel title="Venue sync" description="Freshness of the latest worker reconciliation" tone="paper">
          <div className="stack-list">
            {risk.venueStates.length === 0 ? (
              <p className="muted-copy">No venue sync events recorded yet.</p>
            ) : (
              risk.venueStates.map((state: VenueStateRow) => (
                <article key={state._id} className="list-card">
                  <div className="list-card-head">
                    <div>
                      <h4>{state.venueRole.replaceAll("_", " ")}</h4>
                      <p>{state.summary}</p>
                    </div>
                    <StatusBadge tone={state.status === "fresh" ? "positive" : state.status === "error" ? "danger" : "warning"}>
                      {state.status}
                    </StatusBadge>
                  </div>
                  <p>{new Date(state.syncedAt).toLocaleString()}</p>
                </article>
              ))
            )}
          </div>
        </Panel>

        <Panel title="Incidents" description="Operator-facing incident stream and runbooks" tone="rose">
          <div className="stack-list">
            {risk.incidents.length === 0 ? (
              <p className="muted-copy">No incidents recorded.</p>
            ) : (
              risk.incidents.map((incident: IncidentRow) => (
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
                  <p>{incident.detail ?? "No detail recorded."}</p>
                  <p>{incident.runbook ?? "No runbook attached."}</p>
                </article>
              ))
            )}
          </div>
        </Panel>
      </div>
    </StrategyShell>
  );
}
