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
import {
  ConnectKitProvider,
  useAccount,
  useDisconnect,
} from "@particle-network/connectkit";
import { shouldClearSessionForWalletDisconnect } from "@/lib/headerWallet";
import {
  ParticleWalletWidgetPreferenceContext,
  useParticleWalletWidgetPreference,
  useParticleWalletWidgetPreferenceState,
} from "@/components/ParticleWalletWidgetPreference";
import {
  applyParticleWalletWidgetVisibility,
  particleConnectKitConfig,
} from "@/lib/particleConnectKitConfig";

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
  const [status, setStatus] =
    useState<ParticleSessionState["status"]>("loading");
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
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      }).catch(() => undefined);
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

  return (
    <ParticleSessionContext.Provider value={value}>
      {children}
    </ParticleSessionContext.Provider>
  );
}

function ParticleWalletWidgetPluginController() {
  const { walletWidgetVisible } = useParticleWalletWidgetPreference();
  const { status: walletStatus } = useAccount();

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | undefined;

    const applyVisibility = (attempt = 0) => {
      try {
        applyParticleWalletWidgetVisibility(walletWidgetVisible);
      } catch {
        if (attempt >= 20 || cancelled) return;
        timeoutId = window.setTimeout(() => applyVisibility(attempt + 1), 100);
      }
    };

    applyVisibility();

    return () => {
      cancelled = true;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [walletStatus, walletWidgetVisible]);

  return null;
}

// ---- Public API (unchanged) ----
export function ParticleConnectKitProvider({
  children,
}: {
  children: ReactNode;
}) {
  const walletWidgetPreference = useParticleWalletWidgetPreferenceState();

  return (
    <ParticleWalletWidgetPreferenceContext.Provider
      value={walletWidgetPreference}
    >
      <ConnectKitProvider config={particleConnectKitConfig}>
        <ParticleWalletWidgetPluginController />
        <ParticleSessionStateProvider>{children}</ParticleSessionStateProvider>
      </ConnectKitProvider>
    </ParticleWalletWidgetPreferenceContext.Provider>
  );
}

export function useParticleSession() {
  const context = useContext(ParticleSessionContext);
  if (!context) {
    throw new Error(
      "useParticleSession must be used inside ParticleConnectKitProvider.",
    );
  }
  return context;
}

export function useParticleConvexAuth() {
  const { status, refreshSession } = useParticleSession();

  const fetchAccessToken = useCallback(async () => {
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
  }, [refreshSession]);

  return useMemo(
    () => ({
      isLoading: status === "loading",
      isAuthenticated: status === "authenticated",
      fetchAccessToken,
    }),
    [status, fetchAccessToken],
  );
}
