import StrategyShell from "@/components/StrategyShell";
import { Panel, StatusBadge } from "@/components/strategy-ui";
import { depositsDemo } from "@/lib/demo-fixtures/deposits";

type DepositInstruction = (typeof depositsDemo)[number];
type DepositAsset = DepositInstruction["strategyAssets"][number] | DepositInstruction["operationalAssets"][number];
type DepositWorkflowRecord = DepositInstruction["depositRecords"][number];

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function AssetSection({
  title,
  assets,
  workflow,
}: {
  title: string;
  assets: readonly DepositAsset[];
  workflow: readonly DepositWorkflowRecord[];
}) {
  if (assets.length === 0) return null;
  return (
    <div className="stack-list">
      <h4>{title}</h4>
      {assets.map((asset) => {
        const record = workflow.find((item) => item.asset === asset.asset);
        return (
          <article key={`${title}-${asset.asset}`} className="list-card">
            <div className="list-card-head">
              <div>
                <h4>{asset.asset} · {asset.label}</h4>
                <p>Balance: {asset.balance} · Value: {formatUsd(asset.valueUsd)}</p>
              </div>
              <StatusBadge tone={record?.status === "confirmed" ? "positive" : record?.status === "detected" ? "warning" : "info"}>{record?.status ?? "inventory"}</StatusBadge>
            </div>
            <p>Withdrawable now: {asset.availableBalance}{asset.withdrawNote ? ` · ${asset.withdrawNote}` : ""}</p>
          </article>
        );
      })}
    </div>
  );
}

export default function DemoDepositsPage() {
  return (
    <StrategyShell
      title="Deposits"
      subtitle="Live wallet inventory, funding rails, and gas reserve visibility"
      pathnameOverride="/deposits"
      showUserButton={false}
    >
      <div className="stack-list">
        <Panel
          title="Manual refresh"
          description="Fallback path for accounts that have not been picked up by the live supervisor yet."
          tone="orange"
          actions={<button className="secondary-button" type="button" disabled>Refresh wallet balances</button>}
        >
          <div className="stack-list">
            <p className="muted-copy">Synthetic demo fixture showing how the operator fallback path looks before live supervisor activity catches up.</p>
            <p>Manual sync complete. 2 funding wallets refreshed from the demo venue state.</p>
          </div>
        </Panel>

        {depositsDemo.map((instruction) => (
          <Panel key={instruction.venueAccountId} title={instruction.role} description={instruction.note} tone="mint">
            <div className="stack-list">
              <div className="list-card-head">
                <div>
                  <h4>{instruction.venue}</h4>
                  <p>{instruction.chainRef}</p>
                </div>
                <StatusBadge tone={instruction.status === "ready" ? "positive" : "warning"}>{instruction.status}</StatusBadge>
              </div>
              <p className="mono-label">{instruction.walletAddress}</p>
              <p>Wallet holdings: {formatUsd(instruction.totalWalletHoldingsUsd)} · Strategy assets: {formatUsd(instruction.strategyAssetValueUsd)} · Operational gas reserve: {formatUsd(instruction.gasReserveValueUsd)}</p>
              <p>Sync status: {instruction.lastSyncStatus} · {new Date(instruction.lastSyncedAt).toLocaleString()}</p>
              {instruction.lowGasWarning ? <p>{instruction.lowGasWarning.message}</p> : null}
              <AssetSection title="Strategy assets" assets={instruction.strategyAssets} workflow={instruction.depositRecords} />
              <AssetSection title="Operational gas reserve" assets={instruction.operationalAssets} workflow={instruction.depositRecords} />
              <div className="stack-list">
                <h4>Recent landed transfers</h4>
                {instruction.recentTransfers.map((transfer) => (
                  <article key={transfer.id} className="list-card">
                    <div className="list-card-head">
                      <div>
                        <h4>{transfer.direction === "in" ? "+" : "-"}{transfer.amount} {transfer.asset}</h4>
                        <p>{transfer.purpose === "gas" ? "Gas reserve" : "Strategy asset"} · Balance after: {transfer.balanceAfter}</p>
                      </div>
                      <StatusBadge tone={transfer.direction === "in" ? "positive" : "warning"}>{transfer.direction === "in" ? "landed" : "outgoing"}</StatusBadge>
                    </div>
                    <p>{formatUsd(transfer.valueUsd)} · {new Date(transfer.observedAt).toLocaleString()}</p>
                    <p>{transfer.detail}</p>
                  </article>
                ))}
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </StrategyShell>
  );
}
