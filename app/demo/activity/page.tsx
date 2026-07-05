import StrategyShell from "@/components/StrategyShell";
import { Panel, StatusBadge } from "@/components/strategy-ui";
import { activityDemo } from "@/lib/demo-fixtures/activity";

export default function DemoActivityPage() {
  return (
    <StrategyShell title="Activity" subtitle="Execution ledger and operator audit stream" pathnameOverride="/activity" showUserButton={false}>
      <div className="two-column-grid">
        <Panel title="Executions" description="Bounded execution actions recorded by the worker" tone="paper">
          <div className="stack-list">
            {activityDemo.executions.slice(0, 5).map((execution) => {
              const reference = "txHash" in execution ? execution.txHash : execution.requestId;
              return (
                <article key={execution._id} className="list-card">
                  <div className="list-card-head">
                    <div>
                      <h4>{execution.summary}</h4>
                      <p>{execution.kind}</p>
                    </div>
                    <StatusBadge tone={execution.status === "filled" ? "positive" : execution.status === "failed" ? "danger" : "info"}>{execution.status}</StatusBadge>
                  </div>
                  <p className="card-detail-wrap">{execution.detail}</p>
                  <p className="mono-label card-detail-wrap">{reference}</p>
                </article>
              );
            })}
            <div className="activity-more"><button className="secondary-button" type="button" disabled>Show 5 more</button></div>
          </div>
        </Panel>

        <Panel title="Audit" description="Configuration and operator changes" tone="lilac">
          <div className="stack-list">
            {activityDemo.auditEvents.slice(0, 5).map((event) => (
              <article key={event._id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h4>{event.summary}</h4>
                    <p>{event.kind}</p>
                  </div>
                  <StatusBadge tone="info">{event.actor}</StatusBadge>
                </div>
                <p className="card-detail-wrap">{event.detail}</p>
              </article>
            ))}
            <div className="activity-more"><button className="secondary-button" type="button" disabled>Show 5 more</button></div>
          </div>
        </Panel>
      </div>

      <div className="two-column-grid">
        <Panel title="Incidents" description="Operational incidents and recovery breadcrumbs" tone="rose">
          <div className="stack-list">
            {activityDemo.incidents.map((incident) => (
              <article key={incident._id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h4>{incident.code}</h4>
                    <p>{incident.summary}</p>
                  </div>
                  <StatusBadge tone={incident.severity === "warning" ? "warning" : "info"}>{incident.severity}</StatusBadge>
                </div>
                <p className="card-detail-wrap">{incident.detail}</p>
              </article>
            ))}
          </div>
        </Panel>

        <Panel title="Withdrawals" description="Recent withdrawal pipeline activity" tone="paper">
          <div className="stack-list">
            {activityDemo.withdrawals.slice(0, 5).map((withdrawal) => (
              <article key={withdrawal._id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h4>{withdrawal.amount} {withdrawal.asset}</h4>
                    <p className="card-detail-wrap">{withdrawal.destination}</p>
                  </div>
                  <StatusBadge tone={withdrawal.status === "completed" ? "positive" : withdrawal.status === "failed" ? "danger" : "warning"}>{withdrawal.status}</StatusBadge>
                </div>
              </article>
            ))}
            <div className="activity-more"><button className="secondary-button" type="button" disabled>Show 5 more</button></div>
          </div>
        </Panel>
      </div>
    </StrategyShell>
  );
}
