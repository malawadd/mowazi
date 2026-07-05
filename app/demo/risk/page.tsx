import StrategyShell from "@/components/StrategyShell";
import { DataRow, Panel, StatusBadge } from "@/components/strategy-ui";
import { riskDemo } from "@/lib/demo-fixtures/risk";

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

export default function DemoRiskPage() {
  return (
    <StrategyShell title="Risk" subtitle="Alerts, exposure, and pause state" pathnameOverride="/risk" showUserButton={false}>
      <div className="two-column-grid">
        <Panel title="Snapshot" description="Latest equity and exposure view" tone="paper">
          <div className="stack-list">
            <DataRow label="Status" value={<StatusBadge tone="positive">{riskDemo.strategyAccount.status}</StatusBadge>} />
            <DataRow label="Health" value={<StatusBadge tone="warning">{riskDemo.strategyAccount.healthStatus}</StatusBadge>} />
            <DataRow label="Emergency stop" value={riskDemo.strategyAccount.emergencyStop ? "Active" : "Clear"} />
            <DataRow label="Health reason" value={riskDemo.strategyAccount.healthReason} />
            <DataRow label="Total equity" value={formatUsd(riskDemo.latestSnapshot.totalEquityUsd)} />
            <DataRow label="LP value" value={formatUsd(riskDemo.latestSnapshot.lpValueUsd)} />
            <DataRow label="Hedge value" value={formatUsd(riskDemo.latestSnapshot.hedgeValueUsd)} />
            <DataRow label="Net exposure" value={formatUsd(riskDemo.latestSnapshot.netExposureUsd)} />
          </div>
        </Panel>

        <Panel title="Open alerts" description="Warnings emitted by the worker or operator actions" tone="rose">
          <div className="stack-list">
            {riskDemo.alerts.map((alert) => (
              <article key={alert._id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h4>{alert.code}</h4>
                    <p>{alert.message}</p>
                  </div>
                  <StatusBadge tone={alert.severity === "warning" ? "warning" : "info"}>{alert.severity}</StatusBadge>
                </div>
                <p>{alert.detail}</p>
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <div className="two-column-grid">
        <Panel title="Venue sync" description="Freshness of the latest worker reconciliation" tone="paper">
          <div className="stack-list">
            {riskDemo.venueStates.map((state) => (
              <article key={state._id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h4>{state.venueRole.replaceAll("_", " ")}</h4>
                    <p>{state.summary}</p>
                  </div>
                  <StatusBadge tone={state.status === "fresh" ? "positive" : "warning"}>{state.status}</StatusBadge>
                </div>
                <p>{new Date(state.syncedAt).toLocaleString()}</p>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="Incidents" description="Operator-facing incident stream and runbooks" tone="rose">
          <div className="stack-list">
            {riskDemo.incidents.map((incident) => (
              <article key={incident._id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h4>{incident.code}</h4>
                    <p>{incident.summary}</p>
                  </div>
                  <StatusBadge tone={incident.severity === "warning" ? "warning" : "info"}>{incident.severity}</StatusBadge>
                </div>
                <p>{incident.detail}</p>
                <p>{incident.runbook}</p>
              </article>
            ))}
          </div>
        </Panel>
      </div>
    </StrategyShell>
  );
}
