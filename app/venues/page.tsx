"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import StrategyShell from "@/components/StrategyShell";
import { EmptyState, Panel, StatusBadge } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";
import { useOwnerSigner } from "@/hooks/useOwnerSigner";
import { agentRequest } from "@/lib/agentBackend";
import styles from "@/components/agents/agent-portal.module.css";

type Mode = "shadow" | "approval" | "autopilot";
type Venue = "hyperliquid" | "lighter" | "orderly" | "gmx" | "ostium" | "uniswap";
type Setup = { _id: string; state: string; step: string; authorityMode: Mode; fundingAmount: string; workflowId: string };
type Integration = { venue: Venue; enabled: boolean; routingEnabled: boolean; ready: boolean; status: string; authorityMode: Mode; setupAttempt?: Setup | null };

const INFO: Record<Venue, { label: string; product: string; authority: string }> = {
  hyperliquid: { label: "Hyperliquid", product: "Perpetuals · CLOB", authority: "Unique approved agent wallet" },
  lighter: { label: "Lighter", product: "Perpetuals · CLOB", authority: "Account index + registered API key" },
  orderly: { label: "Orderly", product: "Omnichain perpetuals", authority: "Scoped Ed25519 trading key" },
  gmx: { label: "GMX", product: "Arbitrum perpetuals", authority: "Bounded subaccount signer" },
  ostium: { label: "Ostium", product: "Perpetuals + RWAs", authority: "Native one-click delegation" },
  uniswap: { label: "Uniswap", product: "Arbitrum spot", authority: "Fresh signature or scoped UA permission" },
};

export default function VenuesPage() {
  const data = useQuery(api.venueIntegrations.getVenueIntegrations, {});
  const signer = useOwnerSigner();
  const prepareDelegation = useMutation(api.venueIntegrations.prepareArbitrumDelegation);
  const confirmDelegation = useMutation(api.venueIntegrations.confirmArbitrumDelegation);
  const syncWallet = useMutation(api.accountWallets.syncViewerAccountWallet);
  const begin = useMutation(api.venueIntegrations.beginVenueSetup);
  const prepare = useMutation(api.venueIntegrations.prepareVenueSetupStep);
  const confirm = useMutation(api.venueIntegrations.confirmVenueSetupStep);
  const route = useMutation(api.venueIntegrations.setVenueRoutingEnabled);
  const revoke = useMutation(api.venueIntegrations.revokeVenueAuthority);
  const prepareMigration = useMutation(api.venueIntegrations.prepareOptimismMigration);
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [proofs, setProofs] = useState<Record<string, string>>({});
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = async (key: string, work: () => Promise<unknown>, success: string) => {
    setBusy(key); setNotice(null);
    try { await work(); setNotice(success); } catch (error) { setNotice(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(null); }
  };

  const enableDelegation = () => run("delegation", async () => {
    await prepareDelegation({});
    const result = await signer.enableArbitrumDelegation() as {
      accountInfo?: { ownerAddress: string; evmSmartAccount: string; evmDepositAddress: string; solanaSmartAccount: string; walletProvider: "particle" | "magic" | "wallet"; accountMode: "smart_account" | "eip7702"; eip7702Delegated: boolean; delegatedChainIds: number[] };
      primaryAssets?: { totalAmountInUSD: number };
      transactionId?: string;
    } | null;
    if (!result?.accountInfo) throw new Error("Delegation was submitted but the updated account state is not available yet.");
    await syncWallet({
      ownerAddress: result.accountInfo.ownerAddress,
      evmUaAddress: result.accountInfo.evmSmartAccount,
      evmDepositAddress: result.accountInfo.evmDepositAddress,
      solanaUaAddress: result.accountInfo.solanaSmartAccount || undefined,
      walletProvider: result.accountInfo.walletProvider,
      accountMode: result.accountInfo.accountMode,
      eip7702Delegated: result.accountInfo.eip7702Delegated,
      delegatedChainIdsJson: JSON.stringify(result.accountInfo.delegatedChainIds),
      unifiedBalanceUsd: result.primaryAssets?.totalAmountInUSD ?? 0,
      assetsJson: JSON.stringify(result.primaryAssets ?? { assets: [], totalAmountInUSD: 0 }),
    });
    const reference = result.transactionId ?? transactionReference(result);
    await confirmDelegation({ transactionId: reference });
  }, "Arbitrum delegation submitted. Sync the wallet after confirmation if verification is still pending.");

  const start = (item: Integration) => run(item.venue, async () => {
    const mode = modes[item.venue] ?? "shadow";
    const attempt = await begin({ venue: item.venue, authorityMode: mode, fundingAmount: amounts[item.venue] ?? "0" }) as Setup;
    if (mode !== "shadow") {
      await agentRequest("v1/venues/setup", { method: "POST", body: JSON.stringify({
        attempt_id: attempt._id, workflow_id: attempt.workflowId, venue: item.venue,
      }) });
    }
  }, `${INFO[item.venue].label} setup started. No funds moved automatically.`);

  const next = (item: Integration) => run(item.venue, async () => {
    if (!item.setupAttempt) throw new Error("Start setup first.");
    const result = await prepare({ attemptId: item.setupAttempt._id as never }) as { instruction: string; automaticFundMovement: boolean };
    setInstructions((current) => ({ ...current, [item.venue]: result.instruction }));
  }, "Mainnet step prepared. Review every permission and fee before signing.");

  const submitProof = (item: Integration) => run(item.venue, async () => {
    const proof = proofs[item.venue]?.trim();
    if (!item.setupAttempt || !proof) throw new Error("Enter the mainnet transaction or provider request ID.");
    await confirm({ attemptId: item.setupAttempt._id as never, transactionId: proof });
    await agentRequest(`v1/venues/setup/${item.setupAttempt.workflowId}/proof`, {
      method: "POST", body: JSON.stringify({ reference: proof }),
    });
  }, "Proof submitted for collateral and authority verification. Routing remains off until verified.");

  return (
    <StrategyShell title="Trading" subtitle="Venues">
      <Panel title="One strategy owner" description="Particle and Magic both control the same user-owned Universal Account boundary" tone="sky">
        {!data?.signedIn ? (
          <EmptyState title="Sign in to manage venues" body="Venue authority belongs to your strategy owner." action={<Link className="primary-button" href="/sign-in?redirect=/venues">Sign in</Link>} />
        ) : !data.owner ? (
          <EmptyState title="Enable your account wallet first" body="Sync a Particle or Magic Universal Account; Moeazi will not generate a fallback owner." action={<Link className="primary-button" href="/profile/wallet">Open wallet setup</Link>} />
        ) : (
          <div className={styles.dataList}>
            <div><span>Signer</span><strong>{data.owner.provider}</strong></div>
            <div><span>Universal Account</span><strong>{short(data.owner.uaAddress)}</strong></div>
            <div><span>Execution network</span><StatusBadge tone="positive">Arbitrum 42161</StatusBadge></div>
            <div><span>Autopilot authority</span><StatusBadge tone={data.owner.autopilot ? "positive" : "warning"}>{data.owner.autopilot ? "Capable" : "Delegation required"}</StatusBadge></div>
            <div><span>Owner keys</span><strong>Never stored by Moeazi</strong></div>
          </div>
        )}
        {data?.owner && !data.owner.arbitrumDelegated ? (
          <div className={styles.actions}><button className={styles.primary} disabled={busy === "delegation" || !signer.capabilities.eip7702Supported} onClick={() => void enableDelegation()}>{busy === "delegation" ? "Opening signer…" : "Enable Arbitrum delegation"}</button><p>{data.owner.reason}</p></div>
        ) : null}
        {notice ? <p className={styles.notice}>{notice}</p> : null}
      </Panel>

      {data?.legacyOptimism ? (
        <Panel title="Legacy Optimism funds found" description="Review balances, allowances, pending transactions, and retained gas before moving anything" tone="orange">
          <p>Nothing will be bridged, revoked, or transferred automatically. Particle may still show Optimism in the unified balance.</p>
          <div className={styles.actions}><button className={styles.secondary} disabled={busy === "migration"} onClick={() => void run("migration", () => prepareMigration({}), "Migration review created. Confirm each legacy action separately.")}>Review migration</button></div>
        </Panel>
      ) : null}

      <Panel title="Delegated venues" description="These are protocol linkages beneath the UA, not separate Moeazi-funded owner wallets" tone="paper">
        {!data?.strategyAccountId ? (
          <EmptyState title="Create a strategy account first" body="The strategy links to your UA before any venue setup begins." action={<Link className="primary-button" href="/dashboard">Open setup</Link>} />
        ) : (
          <div className={styles.activityList}>
            {(data.integrations as Integration[]).map((item) => {
              const info = INFO[item.venue];
              const mode = modes[item.venue] ?? item.authorityMode ?? "shadow";
              return (
                <article className={styles.activityCard} key={item.venue}>
                  <header><div><h3>{info.label}</h3><p>{info.product}</p></div><StatusBadge tone={item.ready ? "positive" : item.enabled ? "warning" : "neutral"}>{item.routingEnabled ? "Routing on" : item.ready ? "Ready" : item.enabled ? item.setupAttempt?.state ?? "Setup" : "Not connected"}</StatusBadge></header>
                  <div className={styles.dataList}>
                    <div><span>Owner</span><strong>Arbitrum UA</strong></div>
                    <div><span>Restricted authority</span><strong>{info.authority}</strong></div>
                    <div><span>Fund movement</span><strong>User-reviewed mainnet action</strong></div>
                  </div>
                  {!item.enabled ? (
                    <div className={styles.formGrid}>
                      <label className={styles.field}>Mode<select value={mode} onChange={(event) => setModes((current) => ({ ...current, [item.venue]: event.target.value as Mode }))}><option value="shadow">Shadow</option><option value="approval">Approval</option><option value="autopilot">Autopilot</option></select></label>
                      <label className={styles.field}>Funding amount<input inputMode="decimal" value={amounts[item.venue] ?? "0"} onChange={(event) => setAmounts((current) => ({ ...current, [item.venue]: event.target.value }))} /></label>
                      <div className={styles.actions}><button className={styles.primary} disabled={busy === item.venue || (mode === "autopilot" && !data.owner?.autopilot)} onClick={() => void start(item)}>Start guided setup</button></div>
                    </div>
                  ) : item.setupAttempt?.state !== "ready" ? (
                    <div className={styles.formGrid}>
                      {instructions[item.venue] ? <p className={styles.full}>{instructions[item.venue]}</p> : <button className={styles.secondary} disabled={busy === item.venue} onClick={() => void next(item)}>Prepare next signed step</button>}
                      {instructions[item.venue] ? <><label className={`${styles.field} ${styles.full}`}>Transaction / request ID<input value={proofs[item.venue] ?? ""} onChange={(event) => setProofs((current) => ({ ...current, [item.venue]: event.target.value }))} /></label><button className={styles.primary} onClick={() => void submitProof(item)}>Submit for verification</button></> : null}
                    </div>
                  ) : (
                    <div className={styles.actions}>
                      <button className={item.routingEnabled ? styles.danger : styles.primary} onClick={() => void run(item.venue, () => route({ venue: item.venue, enabled: !item.routingEnabled }), item.routingEnabled ? "Routing disabled." : "Routing enabled.")}>{item.routingEnabled ? "Pause routing" : "Enable routing"}</button>
                      {mode !== "shadow" ? <button className={styles.danger} onClick={() => void run(item.venue, () => revoke({ venue: item.venue }), "Authority revoked and routing disabled.")}>Revoke authority</button> : null}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </StrategyShell>
  );
}

function short(value?: string | null) { return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "Not synced"; }
function transactionReference(value: unknown) {
  if (value && typeof value === "object") { const row = value as Record<string, unknown>; return String(row.transactionId ?? row.hash ?? row.txHash ?? "submitted"); }
  return String(value ?? "submitted");
}
