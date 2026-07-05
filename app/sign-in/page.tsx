"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthCore, useConnect, useEthereum } from "@particle-network/authkit/hooks";
import { EmptyState, Panel } from "@/components/strategy-ui";
import { useParticleSession } from "@/components/ParticleAuthProvider";

type ParticleAuthUserInfo = {
  uuid?: string;
  token?: string;
  email?: string;
  name?: string;
  wallets?: Array<{
    chain_name?: string;
    public_address?: string;
  }>;
};

function getUserInfoEvmAddress(userInfo: ParticleAuthUserInfo | undefined) {
  return userInfo?.wallets
    ?.find((wallet) => wallet.chain_name === "evm_chain")
    ?.public_address?.toLowerCase();
}

async function safeResponseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function getRedirectPath() {
  if (typeof window === "undefined") return "/dashboard";
  const requested = new URLSearchParams(window.location.search).get("redirect");
  return requested && requested.startsWith("/") ? requested : "/dashboard";
}

export default function SignInPage() {
  const router = useRouter();
  const { connected, connect, connectionStatus } = useConnect();
  const { userInfo: connectedUserInfo } = useAuthCore();
  const { address, enable, signMessage } = useEthereum();
  const { refreshSession, session, status } = useParticleSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated" && session) {
      router.replace(getRedirectPath());
    }
  }, [router, session, status]);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const userInfo = (connected ? connectedUserInfo : await connect()) as ParticleAuthUserInfo | undefined;
      const walletAddress = (address ?? getUserInfoEvmAddress(userInfo) ?? (await enable()))?.toLowerCase();
      const particleUuid = userInfo?.uuid;
      const particleToken = userInfo?.token;

      if (!walletAddress || !particleUuid || !particleToken) {
        throw new Error("Particle did not return the wallet and user proof required for sign-in.");
      }

      const nonceResponse = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ address: walletAddress }),
      });
      const nonceData = await safeResponseJson<{ message?: string; error?: string }>(nonceResponse);
      if (!nonceResponse.ok || !nonceData?.message) {
        throw new Error(nonceData?.error ?? "Could not create Particle sign-in challenge.");
      }

      const signature = await signMessage(nonceData.message);
      const sessionResponse = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          address: walletAddress,
          signature,
          particleUuid,
          particleToken,
        }),
      });
      const sessionData = await safeResponseJson<{ error?: string }>(sessionResponse);
      if (!sessionResponse.ok) {
        throw new Error(sessionData?.error ?? "Could not verify Particle sign-in.");
      }

      await refreshSession();
      router.replace(getRedirectPath());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="marketing-shell">
      <Panel title="Particle sign-in" description="Connect your Particle wallet to open Moeazi." tone="sky">
        <EmptyState
          title="Sign in with Particle."
          body={`Status: ${connectionStatus}`}
          action={
            <button className="primary-button" type="button" disabled={busy} onClick={signIn}>
              {busy ? "Signing in..." : "Continue with Particle"}
            </button>
          }
        />
        {error ? <p className="muted-copy">{error}</p> : null}
      </Panel>
    </main>
  );
}
