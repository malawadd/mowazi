"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useModal, useParticleAuth, useWallets } from "@particle-network/connectkit";
import { EmptyState, Panel } from "@/components/strategy-ui";
import { useParticleSession } from "@/components/ParticleConnectKitProvider";

type ParticleUserInfo = {
  uuid?: string;
  token?: string;
  email?: string | null;
  name?: string | null;
  wallets?: Array<{
    chain_name?: string;
    public_address?: string;
  }>;
};

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
  const { address, isConnected, status: accountStatus } = useAccount();
  const { setOpen } = useModal();
  const { getUserInfo } = useParticleAuth();
  const [primaryWallet] = useWallets();
  const { refreshSession, session, status: sessionStatus } = useParticleSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const signingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (sessionStatus === "authenticated" && session) {
      router.replace(getRedirectPath());
    }
  }, [router, session, sessionStatus]);

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      const walletClient = primaryWallet?.getWalletClient();
      if (walletClient?.signMessage) {
        return await walletClient.signMessage({
          message,
          account: address as `0x${string}`,
        });
      }
      // Fallback: Particle-attached global EIP-1193 provider
      const particleProvider = (window as unknown as Record<string, unknown>).particle as
        | { ethereum?: { request: (args: { method: string; params: unknown[] }) => Promise<string> } }
        | undefined;
      if (particleProvider?.ethereum) {
        return await particleProvider.ethereum.request({
          method: "personal_sign",
          params: [message, address],
        });
      }
      throw new Error("No wallet available for signing.");
    },
    [primaryWallet, address],
  );

  const completeSignIn = useCallback(async () => {
    if (signingRef.current || !address) return;
    signingRef.current = true;
    setBusy(true);
    setError(null);

    try {
      const walletAddress = address.toLowerCase();

      // Try to get Particle user info (works for social login, fails for wallet-only)
      let particleUuid: string | undefined;
      let particleToken: string | undefined;
      let isSocialLogin = false;
      try {
        const userInfo = (await getUserInfo()) as ParticleUserInfo | undefined;
        if (userInfo?.uuid && userInfo?.token) {
          particleUuid = userInfo.uuid;
          particleToken = userInfo.token;
          isSocialLogin = true;
        }
      } catch {
        // Not a Particle social login user — wallet connection
      }

      // Get nonce
      const nonceResponse = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ address: walletAddress }),
      });
      const nonceData = await safeResponseJson<{ message?: string; error?: string }>(nonceResponse);
      if (!nonceResponse.ok || !nonceData?.message) {
        throw new Error(nonceData?.error ?? "Could not create sign-in challenge.");
      }

      // Sign the nonce message
      const signature = await signMessage(nonceData.message);

      // Create session — different endpoint for social vs wallet auth
      const sessionEndpoint = isSocialLogin ? "/api/auth/session" : "/api/auth/wallet-session";
      const sessionBody: Record<string, string> = {
        address: walletAddress,
        signature,
      };
      if (isSocialLogin) {
        sessionBody.particleUuid = particleUuid!;
        sessionBody.particleToken = particleToken!;
      }

      const sessionResponse = await fetch(sessionEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(sessionBody),
      });
      const sessionData = await safeResponseJson<{ error?: string }>(sessionResponse);
      if (!sessionResponse.ok) {
        throw new Error(sessionData?.error ?? "Could not verify sign-in.");
      }

      await refreshSession();
      router.replace(getRedirectPath());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(false);
      signingRef.current = false;
    }
  }, [address, getUserInfo, signMessage, refreshSession, router]);

  // Watch for connection — trigger sign-in when user connects in the modal
  useEffect(() => {
    if (isConnected && address && !signingRef.current && !busy) {
      void completeSignIn();
    }
  }, [isConnected, address, completeSignIn, busy]);

  const openConnectModal = () => {
    setError(null);
    setOpen(true);
  };

  return (
    <main className="marketing-shell">
      <Panel title="Sign in" description="Connect your wallet or sign in with Particle to open Moeazi." tone="sky">
        <EmptyState
          title="Sign in to Moeazi."
          body={mounted ? `Status: ${accountStatus}` : "Status: loading..."}
          action={
            <button className="primary-button" type="button" disabled={busy} onClick={openConnectModal}>
              {busy ? "Signing in..." : "Continue with Particle"}
            </button>
          }
        />
        {error ? <p className="muted-copy">{error}</p> : null}
      </Panel>
    </main>
  );
}
