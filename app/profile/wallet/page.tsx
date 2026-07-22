"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction, useConvexAuth, useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import AccountWalletPanel from "@/components/AccountWalletPanel";
import ConnectedWalletDepositPanel from "@/components/ConnectedWalletDepositPanel";
import PaymentLinkPanel from "@/components/PaymentLinkPanel";
import StrategyFundingTransferPanel from "@/components/StrategyFundingTransferPanel";
import { useParticleSession } from "@/components/ParticleConnectKitProvider";
import { useUniversalAccount } from "@/hooks/useUniversalAccount";
import { EmptyState, Panel } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";

export default function ProfileWalletPage() {
  const { status } = useParticleSession();
  const convexAuth = useConvexAuth();
  const { accountInfo } = useUniversalAccount("eip7702-if-supported");
  const isSignedIn = status === "authenticated";
  const canUseConvex = isSignedIn && convexAuth.isAuthenticated;
  const savedWallet = useQuery(api.accountWallets.getViewerAccountWallet, canUseConvex ? {} : "skip");
  const instructions = useQuery(api.queries.getDepositInstructions, canUseConvex ? {} : "skip");
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
    <StrategyShell title="Wallet" subtitle="Particle or Magic signer · Arbitrum strategy network">
      {!isSignedIn ? (
        <EmptyState
          title={status === "loading" ? "Loading Particle session..." : "Sign in to view your account wallet."}
          body="Your account wallet is tied to your user profile, not strategy provisioning."
          action={
            status === "unauthenticated" ? (
              <Link className="primary-button" href="/sign-in?redirect=/profile/wallet">
                Sign in
              </Link>
            ) : null
          }
        />
      ) : !canUseConvex ? (
        <EmptyState
          title={convexAuth.isLoading ? "Connecting account data..." : "Reconnect your wallet session."}
          body={
            convexAuth.isLoading
              ? "Your Particle session is active. Moeazi is verifying the app data session."
              : "The app data session could not be verified. Sign out and sign back in to mint a fresh token."
          }
        />
      ) : (
        <div className="stack-list">
          <AccountWalletPanel savedWallet={savedWallet ?? null} />
          <ConnectedWalletDepositPanel
            receiverAddress={accountInfo?.evmDepositAddress ?? savedWallet?.evmDepositAddress ?? savedWallet?.evmUaAddress}
            recipientLabel="your account wallet"
            title="Deposit from connected wallet"
            description="Scan supported Particle primary assets in an EOA wallet and transfer them into your Universal Account."
          />
          <PaymentLinkPanel savedWallet={savedWallet ?? null} />
          {(instructions ?? []).length > 0 ? (
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
          ) : (
            <Panel title="Strategy funding" description="Optional after strategy provisioning" tone="paper">
              <p className="muted-copy">
                You can receive and share deposits now. Create a strategy account later when you want to move funds into
                restricted venue connections beneath your UA.
              </p>
            </Panel>
          )}
          {refreshMessage ? (
            <Panel title="Venue balance refresh" tone="paper">
              <p className="muted-copy">{refreshMessage}</p>
            </Panel>
          ) : null}
        </div>
      )}
    </StrategyShell>
  );
}
