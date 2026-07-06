"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useWallets } from "@particle-network/connectkit";
import {
  UniversalAccount,
  UNIVERSAL_ACCOUNT_VERSION,
  type IAssetsResponse,
  type ITransaction,
} from "@particle-network/universal-account-sdk";

type AccountInfo = {
  ownerAddress: string;
  evmSmartAccount: string;
  solanaSmartAccount: string;
};

export type UniversalTransferInput = {
  token: {
    chainId: number;
    address: string;
  };
  amount: string;
  receiver: string;
};

export function useUniversalAccount() {
  const { address } = useAccount();
  const [primaryWallet] = useWallets();
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [primaryAssets, setPrimaryAssets] = useState<IAssetsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const particleProvider = (window as Record<string, unknown>).particle as
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

  const universalAccount = useMemo(() => {
    if (!address) return null;

    return new UniversalAccount({
      projectId: process.env.NEXT_PUBLIC_PROJECT_ID ?? "",
      projectClientKey: process.env.NEXT_PUBLIC_CLIENT_KEY ?? "",
      projectAppUuid: process.env.NEXT_PUBLIC_APP_ID ?? "",
      smartAccountOptions: {
        useEIP7702: false,
        name: "UNIVERSAL",
        version: UNIVERSAL_ACCOUNT_VERSION,
        ownerAddress: address,
      },
      tradeConfig: {
        slippageBps: 100,
        universalGas: true,
      },
    });
  }, [address]);

  const refresh = useCallback(async () => {
    if (!universalAccount || !address) return null;

    setLoading(true);
    setError(null);
    try {
      const [smartAccountOptions, assets] = await Promise.all([
        universalAccount.getSmartAccountOptions(),
        universalAccount.getPrimaryAssets(),
      ]);
      const nextAccountInfo = {
        ownerAddress: smartAccountOptions.ownerAddress ?? address,
        evmSmartAccount: smartAccountOptions.smartAccountAddress ?? "",
        solanaSmartAccount: smartAccountOptions.solanaSmartAccountAddress ?? "",
      };
      setAccountInfo(nextAccountInfo);
      setPrimaryAssets(assets);
      return { accountInfo: nextAccountInfo, primaryAssets: assets };
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError));
      return null;
    } finally {
      setLoading(false);
    }
  }, [address, universalAccount]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createTransfer = useCallback(
    async (input: UniversalTransferInput) => {
      if (!universalAccount) {
        throw new Error("Universal Account is not ready.");
      }
      return await universalAccount.createTransferTransaction(input);
    },
    [universalAccount],
  );

  const signAndSend = useCallback(
    async (transaction: ITransaction) => {
      if (!universalAccount) {
        throw new Error("Universal Account is not ready.");
      }
      const signature = await signMessage(transaction.rootHash);
      return await universalAccount.sendTransaction(transaction, signature);
    },
    [signMessage, universalAccount],
  );

  return {
    ownerAddress: address,
    accountInfo,
    primaryAssets,
    universalAccount,
    loading,
    error,
    refresh,
    createTransfer,
    signAndSend,
  };
}
