import StrategyShell from "@/components/StrategyShell";
import { DataRow, MetricCard, Panel, StatusBadge } from "@/components/strategy-ui";
import { overviewDemo } from "@/lib/demo-fixtures/overview";

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function toneForStatus(status: string) {
  if (status === "active" || status === "ready" || status === "fresh") return "positive";
  if (status === "paused" || status === "approval_required" || status === "queued") return "warning";
  if (status === "failed" || status === "emergency_stopped" || status === "cancelled") return "danger";
  return "info";
}

export default function DemoOverviewPage() {
  return (
    <StrategyShell
      title="Overview"
      subtitle="Managed strategy account health and execution state"
      pathnameOverride="/dashboard"
      showUserButton={false}
    >
      <section className="metric-grid">
        <MetricCard label="Strategy status" value={overviewDemo.strategyAccount.status} detail={overviewDemo.strategyType} tone="sky" />
        <MetricCard label="Total equity" value={formatUsd(overviewDemo.latestSnapshot.totalEquityUsd)} detail="Strategy-only equity from the latest recorded snapshot" tone="paper" />
        <MetricCard label="Net exposure" value={formatUsd(overviewDemo.latestSnapshot.netExposureUsd)} detail="Positive means long LINK delta" tone="orange" />
        <MetricCard label="Open alerts" value={String(overviewDemo.openAlerts.length)} detail="Critical alerts appear in the risk view" tone="paper" />
        <MetricCard label="Execution mode" value={overviewDemo.config.executionMode} detail={overviewDemo.strategyAccount.healthStatus} tone="sky" />
        <MetricCard label="Wallet holdings" value={formatUsd(overviewDemo.walletSummary.totalWalletHoldingsUsd)} detail="Live holdings across funding wallets, including gas reserve" tone="paper" />
        <MetricCard label="Gas reserve" value={formatUsd(overviewDemo.walletSummary.gasReserveValueUsd)} detail="Operational ETH reserve across tracked wallets" tone="orange" />
      </section>

      <Panel
        title="Execution"
        description="Account state, venue readiness, and control actions"
        tone="sky"
        actions={
          <div className="inline-actions">
            <button className="secondary-button" type="button" disabled>Refresh balances</button>
            <button className="secondary-button" type="button" disabled>Pause</button>
            <button className="primary-button" type="button" disabled>Enable</button>
          </div>
        }
      >
        <div className="two-column-grid">
          <div className="stack-list">
            {overviewDemo.venueAccounts.map((account) => {
              const funding = overviewDemo.fundingAccounts.find((item) => item.venueAccountId === account.id);
              return (
                <article key={account.id} className="list-card">
                  <div className="list-card-head">
                    <div>
                      <h4>{account.role.replaceAll("_", " ")}</h4>
                      <p>{account.accountRef}</p>
                    </div>
                    <StatusBadge tone={toneForStatus(account.status)}>{account.status}</StatusBadge>
                  </div>
                  <p className="mono-label">{account.walletAddress}</p>
                  {funding ? <p>Wallet holdings: {formatUsd(funding.totalWalletHoldingsUsd)} · Strategy assets: {formatUsd(funding.strategyAssetValueUsd)} · Gas reserve: {formatUsd(funding.gasReserveValueUsd)}</p> : null}
                  {funding ? <p>{funding.walletAssets.map((asset) => `${asset.asset} ${asset.balance}`).join(" · ")}</p> : null}
                  {funding?.lowGasWarning ? <p>{funding.lowGasWarning.message}</p> : null}
                </article>
              );
            })}
          </div>

          <div className="stack-list">
            <DataRow label="HyperLiquid agent approval" value={<button className="secondary-button" type="button" disabled>Approve agent wallet</button>} />
            <DataRow label="Last worker heartbeat" value={new Date(overviewDemo.strategyAccount.lastHeartbeatAt).toLocaleString()} />
            <DataRow label="Health reason" value={overviewDemo.strategyAccount.healthReason} />
            <DataRow label="Last reconciliation" value={new Date(overviewDemo.strategyAccount.lastReconciledAt).toLocaleString()} />
            <DataRow label="Last execution error" value={overviewDemo.strategyAccount.lastError ?? "None"} />
          </div>
        </div>
      </Panel>

      <Panel title="Lifecycle" description="Recent venue sync and withdrawal state" tone="paper">
        <div className="two-column-grid">
          <div className="stack-list">
            {overviewDemo.venueAccounts.map((account) => (
              <article key={`${account.id}-sync`} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h4>{account.role.replaceAll("_", " ")}</h4>
                    <p>{new Date(account.lastSyncedAt).toLocaleString()}</p>
                  </div>
                  <StatusBadge tone={toneForStatus(account.lastSyncStatus)}>{account.lastSyncStatus}</StatusBadge>
                </div>
                <p>{account.lastSyncError ?? "No sync error recorded."}</p>
              </article>
            ))}
          </div>

          <div className="stack-list">
            {overviewDemo.recentWithdrawals.map((withdrawal) => (
              <article key={withdrawal._id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h4>{withdrawal.amount} {withdrawal.asset}</h4>
                    <p>Withdrawal pipeline</p>
                  </div>
                  <StatusBadge tone={toneForStatus(withdrawal.status)}>{withdrawal.status}</StatusBadge>
                </div>
              </article>
            ))}
          </div>
        </div>
      </Panel>

      <Panel title="Live positions" description="Current LP and hedge state" tone="orange">
        <div className="two-column-grid">
          <div className="stack-list">
            <h4>LP positions</h4>
            {overviewDemo.openLpPositions.map((position) => (
              <article key={position._id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h4>{position.token0} / {position.token1}</h4>
                    <p>{position.poolAddress}</p>
                  </div>
                  <StatusBadge tone="info">{position.status}</StatusBadge>
                </div>
                <p>Liquidity: {position.liquidity}</p>
              </article>
            ))}
          </div>

          <div className="stack-list">
            <h4>Hedge positions</h4>
            {overviewDemo.openHedgePositions.map((position) => (
              <article key={position._id} className="list-card">
                <div className="list-card-head">
                  <div>
                    <h4>{position.symbol}</h4>
                    <p>Entry {position.entryPrice}</p>
                  </div>
                  <StatusBadge tone={position.side === "short" ? "warning" : "positive"}>{position.side}</StatusBadge>
                </div>
                <p>Size: {position.size}</p>
              </article>
            ))}
          </div>
        </div>
      </Panel>
    </StrategyShell>
  );
}
