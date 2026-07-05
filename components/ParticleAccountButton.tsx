"use client";

import { useRouter } from "next/navigation";
import { useParticleSession } from "@/components/ParticleAuthProvider";

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function ParticleAccountButton() {
  const router = useRouter();
  const { session, signOut, status } = useParticleSession();

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
      <span className="mono-label">{shortenAddress(session.walletAddress)}</span>
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
