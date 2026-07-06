"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Buffer } from "buffer";
import { ConnectKitProvider, createConfig, useDisconnect } from "@particle-network/connectkit";
import { authWalletConnectors } from "@particle-network/connectkit/auth";
import { evmWalletConnectors } from "@particle-network/connectkit/evm";
import { PARTICLE_EVM_CHAINS } from "@/lib/particleEvmChains";

// ---- Buffer polyfill (required by Particle) ----
const globalWithBuffer = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
if (!globalWithBuffer.Buffer) {
  globalWithBuffer.Buffer = Buffer;
}

// ---- Constants ----
const PARTICLE_PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID || "missing-particle-project-id";
const PARTICLE_CLIENT_KEY = process.env.NEXT_PUBLIC_CLIENT_KEY || "missing-particle-client-key";
const PARTICLE_APP_ID = process.env.NEXT_PUBLIC_APP_ID || "missing-particle-app-id";

// ---- ConnectKit config (created once at module level) ----
const connectKitConfig = createConfig({
  projectId: PARTICLE_PROJECT_ID,
  clientKey: PARTICLE_CLIENT_KEY,
  appId: PARTICLE_APP_ID,
  chains: PARTICLE_EVM_CHAINS,
  appearance: {
    mode: "dark",
    collapseWalletList: true,
  },
  walletConnectors: [
    evmWalletConnectors({
      metadata: {
        name: "Moeazi",
        description: "Moeazi manages LINK/USDC delta-neutral strategy accounts.",
        url: "",
      },
    }),
    authWalletConnectors(),
  ],
});

// ---- Session types (unchanged) ----
type ParticleSession = {
  subject: string;
  walletAddress: string;
  particleUuid?: string | null;
  email?: string | null;
  name?: string | null;
};

type ParticleSessionState = {
  status: "loading" | "authenticated" | "unauthenticated";
  session: ParticleSession | null;
  refreshSession: () => Promise<ParticleSession | null>;
  signOut: () => Promise<void>;
};

// ---- Session context ----
const ParticleSessionContext = createContext<ParticleSessionState | null>(null);

async function readTokenSession() {
  const response = await fetch("/api/auth/token", {
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    return null;
  }

  let data: { session?: ParticleSession };
  try {
    data = (await response.json()) as { session?: ParticleSession };
  } catch {
    return null;
  }
  return data.session ?? null;
}

function ParticleSessionStateProvider({ children }: { children: ReactNode }) {
  const { disconnectAsync } = useDisconnect();
  const [status, setStatus] = useState<ParticleSessionState["status"]>("loading");
  const [session, setSession] = useState<ParticleSession | null>(null);

  const refreshSession = useCallback(async () => {
    const nextSession = await readTokenSession();
    setSession(nextSession);
    setStatus(nextSession ? "authenticated" : "unauthenticated");
    return nextSession;
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    await disconnectAsync().catch(() => undefined);
    setSession(null);
    setStatus("unauthenticated");
  }, [disconnectAsync]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const value = useMemo(
    () => ({ status, session, refreshSession, signOut }),
    [refreshSession, session, signOut, status],
  );

  return <ParticleSessionContext.Provider value={value}>{children}</ParticleSessionContext.Provider>;
}

// ---- Public API (unchanged) ----
export function ParticleConnectKitProvider({ children }: { children: ReactNode }) {
  return (
    <ConnectKitProvider config={connectKitConfig}>
      <ParticleSessionStateProvider>{children}</ParticleSessionStateProvider>
    </ConnectKitProvider>
  );
}

export function useParticleSession() {
  const context = useContext(ParticleSessionContext);
  if (!context) {
    throw new Error("useParticleSession must be used inside ParticleConnectKitProvider.");
  }
  return context;
}

export function useParticleConvexAuth() {
  const { status, refreshSession } = useParticleSession();

  const fetchAccessToken = useCallback(
    async () => {
      const response = await fetch("/api/auth/token", {
        cache: "no-store",
        credentials: "include",
      });
      if (!response.ok) {
        await refreshSession();
        return null;
      }

      let data: { token?: string };
      try {
        data = (await response.json()) as { token?: string };
      } catch {
        await refreshSession();
        return null;
      }
      return data.token ?? null;
    },
    [refreshSession],
  );

  return useMemo(
    () => ({
      isLoading: status === "loading",
      isAuthenticated: status === "authenticated",
      fetchAccessToken,
    }),
    [status, fetchAccessToken],
  );
}
