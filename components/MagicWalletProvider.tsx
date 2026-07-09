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
import { EVMExtension } from "@magic-ext/evm";
import { Magic, type Magic as MagicInstance } from "magic-sdk";
import type {
  Sign7702AuthorizationRequest,
  Sign7702AuthorizationResponse,
  Send7702TransactionRequest,
  Send7702TransactionResponse,
} from "@magic-sdk/types";
import { BrowserProvider, getBytes } from "ethers";

type MagicClient = MagicInstance<[EVMExtension]> & { evm: EVMExtension };

type MagicWalletState = {
  address: string | null;
  chainId: number;
  email: string | null;
  isConfigured: boolean;
  magic: MagicClient | null;
  status: "loading" | "connected" | "disconnected";
  loginWithEmail: (email: string) => Promise<{ address: string; email: string | null }>;
  logout: () => Promise<void>;
  refresh: () => Promise<string | null>;
  send7702Transaction: (input: Send7702TransactionRequest) => Promise<Send7702TransactionResponse>;
  showWallet: () => Promise<void>;
  sign7702Authorization: (
    input: Sign7702AuthorizationRequest,
  ) => Promise<Sign7702AuthorizationResponse>;
  signMessage: (message: string) => Promise<string>;
  signRootHash: (rootHash: string) => Promise<string>;
  switchChain: (chainId: number) => Promise<void>;
};

const MagicWalletContext = createContext<MagicWalletState | null>(null);

const DEFAULT_ARBITRUM_RPC = "https://arb1.arbitrum.io/rpc";

function configuredChainId() {
  const parsed = Number(process.env.NEXT_PUBLIC_MAGIC_DELEGATION_CHAIN_ID);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 42161;
}

function configuredRpcUrl() {
  return (
    process.env.NEXT_PUBLIC_MAGIC_RPC_URL ||
    process.env.NEXT_PUBLIC_ARB_RPC_URL ||
    DEFAULT_ARBITRUM_RPC
  );
}

function getMagicAddress(metadata: Awaited<ReturnType<MagicClient["user"]["getInfo"]>>) {
  return metadata.wallets.ethereum?.publicAddress ?? null;
}

async function getSigner(magic: MagicClient) {
  const provider = new BrowserProvider(magic.rpcProvider);
  return await provider.getSigner();
}

export function MagicWalletProvider({ children }: { children: ReactNode }) {
  const chainId = configuredChainId();
  const apiKey = process.env.NEXT_PUBLIC_MAGIC_API_KEY;
  const magic = useMemo<MagicClient | null>(() => {
    if (!apiKey || typeof window === "undefined") return null;
    return new Magic(apiKey, {
      extensions: [
        new EVMExtension([
          {
            chainId,
            default: true,
            rpcUrl: configuredRpcUrl(),
          },
        ]),
      ],
    }) as MagicClient;
  }, [apiKey, chainId]);
  const [status, setStatus] = useState<MagicWalletState["status"]>(
    magic ? "loading" : "disconnected",
  );
  const [address, setAddress] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!magic) {
      setStatus("disconnected");
      setAddress(null);
      setEmail(null);
      return null;
    }
    setStatus((current) => (current === "connected" ? current : "loading"));
    const loggedIn = await magic.user.isLoggedIn();
    if (!loggedIn) {
      setStatus("disconnected");
      setAddress(null);
      setEmail(null);
      return null;
    }
    const metadata = await magic.user.getInfo();
    const nextAddress = getMagicAddress(metadata)?.toLowerCase() ?? null;
    setAddress(nextAddress);
    setEmail(metadata.email ?? null);
    setStatus(nextAddress ? "connected" : "disconnected");
    return nextAddress;
  }, [magic]);

  useEffect(() => {
    void refresh().catch(() => {
      setStatus("disconnected");
      setAddress(null);
      setEmail(null);
    });
  }, [refresh]);

  const loginWithEmail = useCallback(
    async (nextEmail: string) => {
      if (!magic) throw new Error("Magic is not configured.");
      await magic.auth.loginWithEmailOTP({ email: nextEmail, showUI: true });
      const nextAddress = await refresh();
      if (!nextAddress) throw new Error("Magic did not return an EVM wallet address.");
      return { address: nextAddress, email: nextEmail };
    },
    [magic, refresh],
  );

  const logout = useCallback(async () => {
    if (magic) await magic.user.logout().catch(() => false);
    setAddress(null);
    setEmail(null);
    setStatus("disconnected");
  }, [magic]);

  const signMessage = useCallback(
    async (message: string) => {
      if (!magic) throw new Error("Magic is not configured.");
      return await (await getSigner(magic)).signMessage(message);
    },
    [magic],
  );

  const signRootHash = useCallback(
    async (rootHash: string) => {
      if (!magic) throw new Error("Magic is not configured.");
      return await (await getSigner(magic)).signMessage(getBytes(rootHash));
    },
    [magic],
  );

  const sign7702Authorization = useCallback(
    async (input: Sign7702AuthorizationRequest) => {
      if (!magic) throw new Error("Magic is not configured.");
      return await magic.wallet.sign7702Authorization(input);
    },
    [magic],
  );

  const send7702Transaction = useCallback(
    async (input: Send7702TransactionRequest) => {
      if (!magic) throw new Error("Magic is not configured.");
      return await magic.wallet.send7702Transaction(input);
    },
    [magic],
  );

  const switchChain = useCallback(
    async (nextChainId: number) => {
      if (!magic) throw new Error("Magic is not configured.");
      await magic.evm.switchChain(nextChainId);
    },
    [magic],
  );

  const showWallet = useCallback(async () => {
    if (!magic) throw new Error("Magic is not configured.");
    await magic.wallet.showUI();
  }, [magic]);

  const value = useMemo(
    () => ({
      address,
      chainId,
      email,
      isConfigured: Boolean(magic),
      magic,
      status,
      loginWithEmail,
      logout,
      refresh,
      send7702Transaction,
      showWallet,
      sign7702Authorization,
      signMessage,
      signRootHash,
      switchChain,
    }),
    [
      address,
      chainId,
      email,
      loginWithEmail,
      logout,
      magic,
      refresh,
      send7702Transaction,
      showWallet,
      sign7702Authorization,
      signMessage,
      signRootHash,
      status,
      switchChain,
    ],
  );

  return <MagicWalletContext.Provider value={value}>{children}</MagicWalletContext.Provider>;
}

export function useMagicWallet() {
  const context = useContext(MagicWalletContext);
  if (!context) {
    throw new Error("useMagicWallet must be used inside MagicWalletProvider.");
  }
  return context;
}
