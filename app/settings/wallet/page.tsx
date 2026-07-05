"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import AccountWalletPanel from "@/components/AccountWalletPanel";
import PaymentLinkPanel from "@/components/PaymentLinkPanel";
import StrategyFundingTransferPanel from "@/components/StrategyFundingTransferPanel";
import { useParticleSession } from "@/components/ParticleAuthProvider";
import { EmptyState, Panel } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";

export default function WalletSettingsPage() {
  const { status } = useParticleSession();
  const isSignedIn = status === "authenticated";
  const dashboard = useQuery(api.queries.getStrategyDashboard, {});
  const savedWallet = useQuery(api.accountWallets.getViewerAccountWallet, isSignedIn ? {} : "skip");
  const instructions = useQuery(api.queries.getDepositInstructions, isSignedIn ? {} : "skip");
  const refreshFundingState = useAction(api.publicActions.refreshFundingState);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const refreshManagedFundingState = async () => {
    const result = (await refreshFundingState({})) as {
      results?: Array<{ role: string; status: string }>;
    };
    const refreshed = result?.results?.filter((item) => item.status === "fresh").length ?? 0;
    setRefreshMessage(
      refreshed > 0
        ? `Strategy wallets refreshed: ${refreshed}.`
        : "Refresh finished, but no strategy wallet returned a fresh venue read.",
    );
  };

  return (
    <StrategyShell title="Wallet" subtitle="Particle account wallet, shared deposits, and strategy funding">
      {!isSignedIn ? (
        <EmptyState
          title={status === "loading" ? "Loading Particle session..." : "Sign in to view your account wallet."}
          body="Wallet settings are tied to your Moeazi strategy account."
        />
      ) : dashboard && !dashboard.hasStrategyAccount ? (
        <EmptyState
          title="No strategy account provisioned yet."
          body="Create the strategy account before syncing a public deposit wallet or share link."
        />
      ) : (
        <div className="stack-list">
          <AccountWalletPanel savedWallet={savedWallet ?? null} />
          <PaymentLinkPanel savedWallet={savedWallet ?? null} />
          <StrategyFundingTransferPanel
            instructions={instructions ?? []}
            onTransferComplete={async () => {
              try {
                await refreshManagedFundingState();
              } catch (error) {
                setRefreshMessage(error instanceof Error ? error.message : String(error));
              }
            }}
          />
          {refreshMessage ? (
            <Panel title="Strategy wallet refresh" tone="paper">
              <p className="muted-copy">{refreshMessage}</p>
            </Panel>
          ) : null}
        </div>
      )}
    </StrategyShell>
  );
}
