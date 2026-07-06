"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Buffer } from "buffer";
import {
  ConnectKitProvider,
  createConfig,
  useAccount,
  useDisconnect,
  type Theme,
} from "@particle-network/connectkit";
import { authWalletConnectors } from "@particle-network/connectkit/auth";
import { evmWalletConnectors } from "@particle-network/connectkit/evm";
import { wallet } from "@particle-network/connectkit/wallet";
import { PARTICLE_EVM_CHAINS } from "@/lib/particleEvmChains";
import { shouldClearSessionForWalletDisconnect } from "@/lib/headerWallet";
import { createParticleWalletPluginOptions } from "@/lib/particleWalletPlugin";

// ---- Buffer polyfill (required by Particle) ----
const globalWithBuffer = globalThis as typeof globalThis & { Buffer?: typeof Buffer };
if (!globalWithBuffer.Buffer) {
  globalWithBuffer.Buffer = Buffer;
}

// ---- Constants ----
const PARTICLE_PROJECT_ID = process.env.NEXT_PUBLIC_PROJECT_ID || "missing-particle-project-id";
const PARTICLE_CLIENT_KEY = process.env.NEXT_PUBLIC_CLIENT_KEY || "missing-particle-client-key";
const PARTICLE_APP_ID = process.env.NEXT_PUBLIC_APP_ID || "missing-particle-app-id";

const moeaziConnectTheme = {
  "--pcm-font-family": "var(--font-plus-jakarta-sans), sans-serif",
  "--pcm-focus-color": "#111111",
  "--pcm-overlay-background": "rgba(17, 17, 17, 0.38)",
  "--pcm-overlay-backdrop-filter": "none",
  "--pcm-modal-box-shadow": "0 0 0 3px #111111, 8px 8px 0 #111111",
  "--pcm-modal-width": "420px",
  "--pcm-modal-max-height": "78vh",
  "--pcm-rounded-sm": "0px",
  "--pcm-rounded-md": "0px",
  "--pcm-rounded-lg": "0px",
  "--pcm-rounded-xl": "0px",
  "--pcm-rounded-full": "0px",
  "--pcm-body-background": "#fffdf5",
  "--pcm-body-background-secondary": "#fff8e9",
  "--pcm-body-background-tertiary": "#eef7ff",
  "--pcm-body-color": "#111111",
  "--pcm-body-color-secondary": "#3f3f46",
  "--pcm-body-color-tertiary": "#71717a",
  "--pcm-body-action-color": "#111111",
  "--pcm-button-border-color": "#111111",
  "--pcm-button-font-weight": "800",
  "--pcm-button-hover-shadow": "3px 3px 0 #111111",
  "--pcm-primary-button-color": "#111111",
  "--pcm-primary-button-bankground": "#ffd23f",
  "--pcm-primary-button-hover-background": "#ffa552",
  "--pcm-secondary-button-color": "#111111",
  "--pcm-secondary-button-bankground": "#fffdf5",
  "--pcm-secondary-button-hover-background": "#fff8e9",
  "--pcm-accent-color": "#74b9ff",
  "--pcm-error-color": "#ff6b6b",
  "--pcm-success-color": "#88d498",
  "--pcm-warning-color": "#ffd23f",
  "--pcm-wallet-lable-color": "#88d498",
} satisfies Theme;

// ---- ConnectKit config (created once at module level) ----
const connectKitConfig = createConfig({
  projectId: PARTICLE_PROJECT_ID,
  clientKey: PARTICLE_CLIENT_KEY,
  appId: PARTICLE_APP_ID,
  chains: PARTICLE_EVM_CHAINS,
  appearance: {
    mode: "light",
    theme: moeaziConnectTheme,
    collapseWalletList: true,
  },
  plugins: [wallet(createParticleWalletPluginOptions())],
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
  const { status: walletStatus } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const [status, setStatus] = useState<ParticleSessionState["status"]>("loading");
  const [session, setSession] = useState<ParticleSession | null>(null);
  const hadConnectedWalletRef = useRef(false);
  const signOutInFlightRef = useRef(false);

  const refreshSession = useCallback(async () => {
    const nextSession = await readTokenSession();
    setSession(nextSession);
    setStatus(nextSession ? "authenticated" : "unauthenticated");
    return nextSession;
  }, []);

  const clearLocalSession = useCallback(() => {
    setSession(null);
    setStatus("unauthenticated");
  }, []);

  const clearAppSession = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    clearLocalSession();
  }, [clearLocalSession]);

  const signOut = useCallback(async () => {
    signOutInFlightRef.current = true;
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => undefined);
      await disconnectAsync().catch(() => undefined);
      clearLocalSession();
    } finally {
      signOutInFlightRef.current = false;
      hadConnectedWalletRef.current = false;
    }
  }, [clearLocalSession, disconnectAsync]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    if (walletStatus === "connected") {
      hadConnectedWalletRef.current = true;
      return;
    }

    if (
      shouldClearSessionForWalletDisconnect({
        hasSession: Boolean(session),
        hadConnectedWallet: hadConnectedWalletRef.current,
        walletStatus,
        signOutInFlight: signOutInFlightRef.current,
      })
    ) {
      hadConnectedWalletRef.current = false;
      void clearAppSession().catch(() => clearLocalSession());
    }
  }, [clearAppSession, clearLocalSession, session, walletStatus]);

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
