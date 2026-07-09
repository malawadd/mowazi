"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useModal, useParticleAuth, useWallets } from "@particle-network/connectkit";
import { EmptyState, Panel } from "@/components/strategy-ui";
import { useParticleSession } from "@/components/ParticleConnectKitProvider";
import { useMagicWallet } from "@/components/MagicWalletProvider";
import { shouldStartParticleSignIn } from "@/lib/signInFlow";

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
  const magicWallet = useMagicWallet();
  const { refreshSession, session, status: sessionStatus } = useParticleSession();
  const [busy, setBusy] = useState(false);
  const [magicBusy, setMagicBusy] = useState(false);
  const [magicEmail, setMagicEmail] = useState("");
  const [particleRequested, setParticleRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const signingRef = useRef(false);
  const completedRef = useRef(false);
  const autoAttemptedAddressRef = useRef<string | null>(null);
  const activeAddressRef = useRef<string | null>(null);
  const normalizedAddress = address?.toLowerCase() ?? null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isConnected || !normalizedAddress) {
      activeAddressRef.current = null;
      autoAttemptedAddressRef.current = null;
      completedRef.current = false;
      setParticleRequested(false);
      return;
    }

    if (activeAddressRef.current !== normalizedAddress) {
      activeAddressRef.current = normalizedAddress;
      autoAttemptedAddressRef.current = null;
      completedRef.current = false;
      setParticleRequested(false);
      setError(null);
    }
  }, [isConnected, normalizedAddress]);

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
    if (
      signingRef.current ||
      !normalizedAddress ||
      completedRef.current ||
      sessionStatus !== "unauthenticated" ||
      session
    ) {
      return;
    }

    const walletAddress = normalizedAddress;
    autoAttemptedAddressRef.current = walletAddress;
    signingRef.current = true;
    setBusy(true);
    setError(null);

    try {
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

      completedRef.current = true;
      await refreshSession();
      router.replace(getRedirectPath());
    } catch (nextError) {
      completedRef.current = false;
      setParticleRequested(false);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      if (!completedRef.current) {
        setBusy(false);
        signingRef.current = false;
      }
    }
  }, [getUserInfo, normalizedAddress, refreshSession, router, session, sessionStatus, signMessage]);

  const completeMagicSignIn = useCallback(async () => {
    if (magicBusy || sessionStatus !== "unauthenticated" || session) return;
    const email = magicEmail.trim();
    if (!email) {
      setError("Enter the email address for your Magic 7702 wallet.");
      return;
    }

    setMagicBusy(true);
    setError(null);
    try {
      const login = await magicWallet.loginWithEmail(email);
      const nonceResponse = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ address: login.address }),
      });
      const nonceData = await safeResponseJson<{ message?: string; error?: string }>(nonceResponse);
      if (!nonceResponse.ok || !nonceData?.message) {
        throw new Error(nonceData?.error ?? "Could not create Magic sign-in challenge.");
      }

      const signature = await magicWallet.signMessage(nonceData.message);
      const sessionResponse = await fetch("/api/auth/wallet-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          address: login.address,
          authProvider: "magic",
          email: login.email,
          signature,
        }),
      });
      const sessionData = await safeResponseJson<{ error?: string }>(sessionResponse);
      if (!sessionResponse.ok) {
        throw new Error(sessionData?.error ?? "Could not verify Magic sign-in.");
      }

      await refreshSession();
      router.replace(getRedirectPath());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setMagicBusy(false);
    }
  }, [magicBusy, magicEmail, magicWallet, refreshSession, router, session, sessionStatus]);

  // Watch for connection — trigger sign-in when user connects in the modal
  useEffect(() => {
    const canAutoStart = shouldStartParticleSignIn({
      isConnected,
      address: normalizedAddress,
      autoAttemptedAddress: autoAttemptedAddressRef.current,
      sessionStatus,
      hasSession: Boolean(session),
      busy,
      signing: signingRef.current,
      completed: completedRef.current,
    });

    if (particleRequested && canAutoStart) {
      void completeSignIn();
    }
  }, [isConnected, normalizedAddress, session, sessionStatus, completeSignIn, busy, particleRequested]);

  const openConnectModal = () => {
    setError(null);
    setParticleRequested(true);
    if (
      isConnected &&
      normalizedAddress &&
      sessionStatus === "unauthenticated" &&
      !session &&
      !busy &&
      !signingRef.current
    ) {
      void completeSignIn();
      return;
    }
    setOpen(true);
  };

  return (
    <main className="marketing-shell">
      <Panel title="Sign in" description="Choose how Moeazi should create your account wallet." tone="sky">
        <div className="two-column-grid">
          <EmptyState
            title="Particle Connect"
            body={
              mounted
                ? `Broad wallet support. Status: ${accountStatus}`
                : "Broad wallet support. Status: loading..."
            }
            action={
              <button className="primary-button" type="button" disabled={busy || magicBusy} onClick={openConnectModal}>
                {busy ? "Signing in..." : "Continue with Particle"}
              </button>
            }
          />
          <div className="list-card">
            <div className="list-card-head">
              <div>
                <h4>Magic 7702 Wallet</h4>
                <p>Use an embedded EOA that can become your Universal Account in-place.</p>
              </div>
            </div>
            <label className="field-label">
              Email
              <input
                className="field-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={magicEmail}
                onChange={(event) => setMagicEmail(event.target.value)}
              />
            </label>
            <div className="inline-actions">
              <button
                className="primary-button"
                type="button"
                disabled={!magicWallet.isConfigured || busy || magicBusy}
                onClick={completeMagicSignIn}
              >
                {magicBusy ? "Signing in..." : "Continue with Magic"}
              </button>
            </div>
            {!magicWallet.isConfigured ? (
              <p className="muted-copy">Magic is not configured for this environment.</p>
            ) : null}
          </div>
        </div>
        {error ? <p className="muted-copy">{error}</p> : null}
      </Panel>
    </main>
  );
}
