import StrategyShell from "@/components/StrategyShell";
import { DisclosureCard, MetricCard, Panel, StatusBadge } from "@/components/strategy-ui";
import { withdrawalsDemo } from "@/lib/demo-fixtures/withdrawals";

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function toneForStatus(status: string) {
  if (status === "completed" || status === "queued") return "positive";
  if (["pending_checks", "confirming", "signing", "submitted"].includes(status)) return "warning";
  if (["failed", "cancelled", "rejected"].includes(status)) return "danger";
  return "info";
}

export default function DemoWithdrawalsPage() {
  const totalWalletHoldingsUsd = withdrawalsDemo.fundingAccounts.reduce((sum, account) => sum + account.totalWalletHoldingsUsd, 0);
  const lowGasWalletCount = withdrawalsDemo.fundingAccounts.filter((account) => Boolean(account.lowGasWarning)).length;

  return (
    <StrategyShell title="Withdrawals" subtitle="Wallet balances and settlement tracking" pathnameOverride="/withdrawals" showUserButton={false}>
      <section className="metric-grid">
        <MetricCard label="Funding wallets tracked" value={String(withdrawalsDemo.fundingAccounts.length)} detail="Live wallet inventory available to withdrawal flow" tone="mint" />
        <MetricCard label="Wallet holdings" value={formatUsd(totalWalletHoldingsUsd)} detail="Combined inventory across tracked funding rails" tone="paper" />
        <MetricCard label="Low gas wallets" value={String(lowGasWalletCount)} detail="Operational ETH reserve still needs attention before more chain actions" tone="orange" />
        <MetricCard label="Recent withdrawals" value={String(withdrawalsDemo.withdrawals.length)} detail="Latest settlement records across both funding rails" tone="lilac" />
      </section>

      <Panel title="Manual refresh" description="Synthetic demo fixture of the operator fallback path for fresh wallet balances." tone="orange" actions={<button className="secondary-button" type="button" disabled>Refresh wallet balances</button>}>
        <div className="stack-list">
          <p className="muted-copy">This mirrors the manual balance sync used before the supervisor has written fresh venue state back into the account.</p>
          <p>Manual refresh completed from synthetic marketing fixture balances.</p>
        </div>
      </Panel>

      <Panel title="Wallet inventory" description="Use these balances as the source of truth for what each funding wallet currently holds." tone="mint">
        <div className="stack-list">
          {withdrawalsDemo.fundingAccounts.map((account, index) => {
            const strategyAssets = account.walletAssets.filter((asset) => asset.purpose === "strategy");
            const gasAssets = account.walletAssets.filter((asset) => asset.purpose === "gas");
            return (
              <DisclosureCard
                key={account.venueAccountId}
                title={account.role}
                meta={`${account.venue} · ${account.walletAddress}`}
                tone="mint"
                defaultOpen={index === 0}
                badge={<StatusBadge tone={account.lowGasWarning ? "warning" : "info"}>{account.lowGasWarning ? "low gas" : "tracked"}</StatusBadge>}
              >
                <div className="stack-list">
                  <p>Wallet holdings: {formatUsd(account.totalWalletHoldingsUsd)} · Strategy assets: {formatUsd(account.strategyAssetValueUsd)} · Gas reserve: {formatUsd(account.gasReserveValueUsd)}</p>
                  {account.lowGasWarning ? <div className="support-note"><p>{account.lowGasWarning.message}</p></div> : null}
                  <div className="asset-bucket-grid">
                    <div className="inventory-section">
                      <p className="subsection-label">Strategy assets</p>
                      <div className="stack-list">
                        {strategyAssets.map((asset) => (
                          <article key={asset.asset} className="inventory-row">
                            <div className="list-card-head">
                              <div><h4>{asset.asset} · {asset.label}</h4><p>Balance: {asset.balance} · Withdrawable: {asset.availableBalance}</p></div>
                              <StatusBadge tone="info">strategy asset</StatusBadge>
                            </div>
                            <p>Estimated value: {formatUsd(asset.valueUsd)}</p>
                            <p>{asset.withdrawNote}</p>
                          </article>
                        ))}
                      </div>
                    </div>
                    <div className="inventory-section">
                      <p className="subsection-label">Gas reserve</p>
                      <div className="stack-list">
                        {gasAssets.map((asset) => (
                          <article key={asset.asset} className="inventory-row">
                            <div className="list-card-head">
                              <div><h4>{asset.asset} · {asset.label}</h4><p>Balance: {asset.balance} · Withdrawable: {asset.availableBalance}</p></div>
                              <StatusBadge tone="warning">gas reserve</StatusBadge>
                            </div>
                            <p>Estimated value: {formatUsd(asset.valueUsd)}</p>
                            <p>{asset.withdrawNote}</p>
                          </article>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DisclosureCard title="Transfer history" meta="Recent observed incoming and outgoing balance changes for this wallet." tone="paper" badge={<StatusBadge tone="info">{account.recentTransfers.length} items</StatusBadge>}>
                    <div className="stack-list">
                      {account.recentTransfers.map((transfer) => (
                        <article key={transfer.id} className="inventory-row">
                          <div className="list-card-head">
                            <div><h4>{transfer.direction === "in" ? "+" : "-"}{transfer.amount} {transfer.asset}</h4><p>{transfer.purpose === "gas" ? "Gas reserve" : "Strategy asset"} · Balance after: {transfer.balanceAfter}</p></div>
                            <StatusBadge tone={transfer.direction === "in" ? "positive" : "warning"}>{transfer.direction === "in" ? "incoming" : "outgoing"}</StatusBadge>
                          </div>
                          <p>{formatUsd(transfer.valueUsd)} · {new Date(transfer.observedAt).toLocaleString()}</p>
                          <p>{transfer.detail}</p>
                        </article>
                      ))}
                    </div>
                  </DisclosureCard>
                </div>
              </DisclosureCard>
            );
          })}
        </div>
      </Panel>

      <div className="two-column-grid">
        <Panel title="Request withdrawal" description="Only assets supported by the selected funding wallet appear here, and the available amount comes from the live inventory above." tone="orange">
          <form className="settings-grid">
            <label className="field"><span>Funding venue</span><select className="text-input" defaultValue="optimism"><option>optimism execution wallet</option><option>hyperliquid master wallet</option></select></label>
            <label className="field"><span>Asset</span><select className="text-input" defaultValue="USDC"><option>USDC - Strategy capital</option><option>LINK - Inventory buffer</option><option>ETH - Gas reserve</option></select></label>
            <label className="field"><span>Amount</span><input className="text-input" defaultValue="125.00" readOnly /></label>
            <label className="field"><span>Destination</span><input className="text-input" defaultValue="0x31b2c8838fddb1dff5601f536916f23871c3" readOnly /></label>
            <label className="field field-span-2"><span>Operator note</span><textarea className="text-input textarea-input" defaultValue="Synthetic withdrawal demo request for landing capture." rows={4} readOnly /></label>
            <div className="support-note field-span-2"><p>Available now: 5,820.00 USDC</p><p>Current wallet balance: 6,024.92 USDC</p><p>A small portion remains reserved for pending onchain work.</p></div>
            <div className="form-actions field-span-2"><button className="primary-button" type="button" disabled>Send withdrawal</button></div>
          </form>
        </Panel>

        <Panel title="Settlement notes" description="Read the withdrawal status ladder as short operational checkpoints instead of one giant black box." tone="paper">
          <div className="stack-list">
            <div className="support-note"><p>`pending checks` means the request needs validation before it can be signed.</p></div>
            <div className="support-note"><p>`queued` is now only a brief internal staging step before Moeazi immediately tries to process the withdrawal.</p></div>
            <div className="support-note"><p>`signing`, `submitted`, and `confirming` mean the venue action is in flight.</p></div>
            <div className="support-note"><p>Native ETH on Optimism is treated as an operational gas reserve, so the withdrawable amount can be slightly lower than the full balance.</p></div>
            <div className="support-note"><p>Optimism withdrawals complete from transaction receipts. HyperLiquid withdrawals stay in confirming until the venue state settles.</p></div>
          </div>
        </Panel>
      </div>

      <Panel title="Recent withdrawals" description="Review the latest settlement state transitions across both funding rails." tone="paper">
        <div className="stack-list">
          {withdrawalsDemo.withdrawals.map((withdrawal) => (
            <article key={withdrawal._id} className="list-card">
              <div className="list-card-head">
                <div><h4>{withdrawal.amount} {withdrawal.asset}</h4><p>{withdrawal.venueRole}</p></div>
                <StatusBadge tone={toneForStatus(withdrawal.status)}>{withdrawal.status}</StatusBadge>
              </div>
              <p className="mono-label">{withdrawal.destination}</p>
              <p>Fee estimate: {withdrawal.feeEstimateUsd} USD</p>
              <p>{withdrawal.note}</p>
              <p>{new Date(withdrawal.requestedAt).toLocaleString()}</p>
              {["queued", "draft", "pending_checks", "failed"].includes(withdrawal.status) ? <div className="inventory-actions"><button className="primary-button" type="button" disabled>Process now</button><button className="secondary-button" type="button" disabled>Cancel</button></div> : null}
            </article>
          ))}
        </div>
      </Panel>
    </StrategyShell>
  );
}
