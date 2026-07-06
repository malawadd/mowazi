"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  DEFAULT_PARTICLE_WALLET_WIDGET_VISIBLE,
  PARTICLE_WALLET_WIDGET_STORAGE_KEY,
  parseParticleWalletWidgetPreference,
} from "@/lib/particleWalletPlugin";

type ParticleWalletWidgetPreferenceState = {
  walletWidgetVisible: boolean;
  setWalletWidgetVisible: (visible: boolean) => void;
  toggleWalletWidgetVisible: () => void;
};

export const ParticleWalletWidgetPreferenceContext =
  createContext<ParticleWalletWidgetPreferenceState | null>(null);

export function useParticleWalletWidgetPreferenceState() {
  const [walletWidgetVisible, setWalletWidgetVisibleState] = useState(
    DEFAULT_PARTICLE_WALLET_WIDGET_VISIBLE,
  );

  useEffect(() => {
    try {
      setWalletWidgetVisibleState(
        parseParticleWalletWidgetPreference(
          window.localStorage.getItem(PARTICLE_WALLET_WIDGET_STORAGE_KEY),
        ),
      );
    } catch {
      setWalletWidgetVisibleState(DEFAULT_PARTICLE_WALLET_WIDGET_VISIBLE);
    }
  }, []);

  const setWalletWidgetVisible = useCallback((visible: boolean) => {
    setWalletWidgetVisibleState(visible);
    try {
      window.localStorage.setItem(
        PARTICLE_WALLET_WIDGET_STORAGE_KEY,
        String(visible),
      );
    } catch {
      // localStorage can fail in private browsing modes; keep the in-memory preference.
    }
  }, []);

  const toggleWalletWidgetVisible = useCallback(() => {
    setWalletWidgetVisibleState((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(
          PARTICLE_WALLET_WIDGET_STORAGE_KEY,
          String(next),
        );
      } catch {
        // Keep the in-memory preference when persistence is unavailable.
      }
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      walletWidgetVisible,
      setWalletWidgetVisible,
      toggleWalletWidgetVisible,
    }),
    [setWalletWidgetVisible, toggleWalletWidgetVisible, walletWidgetVisible],
  );
}

export function useParticleWalletWidgetPreference() {
  const context = useContext(ParticleWalletWidgetPreferenceContext);
  if (!context) {
    throw new Error(
      "useParticleWalletWidgetPreference must be used inside ParticleConnectKitProvider.",
    );
  }
  return context;
}
