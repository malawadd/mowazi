"use client";

import { useRouter } from "next/navigation";
import { useModal } from "@particle-network/connectkit";
import { useParticleSession } from "@/components/ParticleConnectKitProvider";
import { shouldOpenHeaderWalletPopup } from "@/lib/headerWallet";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function ParticleAccountButton() {
  const router = useRouter();
  const { session, signOut, status } = useParticleSession();
  const { setOpen } = useModal();

  if (status === "loading") {
    return <span className="muted-copy">Loading account...</span>;
  }

  if (!session) {
    return (
      <button className="secondary-button" type="button" onClick={() => router.push("/sign-in")}>
        Sign in
      </button>
    );
  }

  return (
    <div className="inline-actions">
      <button
        aria-label={`Open wallet menu for ${session.walletAddress}`}
        className="wallet-account-button"
        title="Open wallet menu"
        type="button"
        onClick={() => {
          if (shouldOpenHeaderWalletPopup({ hasSession: Boolean(session), sessionStatus: status })) {
            setOpen(true);
          }
        }}
      >
        {shortenAddress(session.walletAddress)}
      </button>
      <button
        className="secondary-button"
        type="button"
        onClick={async () => {
          await signOut();
          router.push("/sign-in");
        }}
      >
        Sign out
      </button>
    </div>
  );
}
