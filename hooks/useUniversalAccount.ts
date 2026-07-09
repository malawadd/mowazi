"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useWallets } from "@particle-network/connectkit";
import {
  UniversalAccount,
  type EIP7702Authorization,
  type IAssetsResponse,
  type ITransaction,
} from "@particle-network/universal-account-sdk";
import { useMagicWallet } from "@/components/MagicWalletProvider";
import { useParticleSession } from "@/components/ParticleConnectKitProvider";
import {
  detectEip7702Capability,
  extractEip7702DelegatedChainIds,
  getEip7702Status,
  getEvmDepositAddress,
  type AccountWalletMode,
  type AccountWalletProvider,
  type Eip7702Status,
  type UniversalAccountMode,
} from "@/lib/eip7702";
import { buildUniversalAccountConfig } from "@/lib/universalAccountConfig";
import { buildArbitrumUsdcSettlementTransaction } from "@/lib/universalAccountSettlement";
import {
  firstEip7702Auth,
  isJsonRpcAuthorizationError,
  serializeAuthorizationSignature,
  signParticleEip7702Authorization,
  type SignAuthorizationInput,
} from "@/lib/universalAccount7702";
import { signUniversalAccountRootHash } from "@/lib/universalAccountSigning";

type AccountInfo = {
  accountMode: AccountWalletMode;
  delegatedChainIds: number[];
  eip7702Delegated: boolean;
  evmDepositAddress: string;
  evmSmartAccount: string;
  ownerAddress: string;
  solanaSmartAccount: string;
  walletProvider: AccountWalletProvider;
};

export type UniversalTransferInput = {
  token: { chainId: number; address: string };
  amount: string;
  receiver: string;
};

export type SettledTransferInput = {
  amount: string;
  receiver: string;
};

export function useUniversalAccount(mode: UniversalAccountMode = "smart") {
  const { address: particleAddress } = useAccount();
  const [primaryWallet] = useWallets();
  const { session } = useParticleSession();
  const magicWallet = useMagicWallet();
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [primaryAssets, setPrimaryAssets] = useState<IAssetsResponse | null>(null);
  const [eip7702Status, setEip7702Status] = useState<Eip7702Status>(() =>
    getEip7702Status("smart", detectEip7702Capability(null)),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMagicSession = session?.authProvider === "magic";
  const ownerAddress = isMagicSession ? magicWallet.address : particleAddress;
  const walletProvider: AccountWalletProvider = isMagicSession
    ? "magic"
    : session?.authProvider === "wallet"
      ? "wallet"
      : "particle";
  const walletClient = useMemo(() => primaryWallet?.getWalletClient(), [primaryWallet]);
  const particleCapability = useMemo(() => detectEip7702Capability(walletClient), [walletClient]);
  const eip7702Capability = useMemo(() => {
    if (isMagicSession) {
      return {
        supported: Boolean(magicWallet.address),
        method: "magic.wallet.sign7702Authorization" as const,
        reason: "Magic supports EIP-7702 authorization.",
      };
    }
    return particleCapability;
  }, [isMagicSession, magicWallet.address, particleCapability]);
  const useEIP7702 = mode === "eip7702-if-supported" && eip7702Capability.supported;
  const accountMode: AccountWalletMode = useEIP7702 ? "eip7702" : "smart_account";

  const universalAccount = useMemo(() => {
    if (!ownerAddress) return null;
    return new UniversalAccount(buildUniversalAccountConfig({ ownerAddress, useEIP7702 }));
  }, [ownerAddress, useEIP7702]);

  const refresh = useCallback(async () => {
    if (!universalAccount || !ownerAddress) return null;

    setLoading(true);
    setError(null);
    try {
      const [smartAccountOptions, assets, deployments] = await Promise.all([
        universalAccount.getSmartAccountOptions(),
        universalAccount.getPrimaryAssets(),
        mode === "eip7702-if-supported"
          ? universalAccount.getEIP7702Deployments().catch(() => undefined)
          : Promise.resolve(undefined),
      ]);
      const delegatedChainIds = extractEip7702DelegatedChainIds(deployments);
      const status = getEip7702Status(mode, eip7702Capability, deployments);
      setEip7702Status(status);
      const smartAccountAddress = smartAccountOptions.smartAccountAddress ?? "";
      const resolvedOwner = smartAccountOptions.ownerAddress ?? ownerAddress;
      const evmDepositAddress =
        getEvmDepositAddress({
          accountMode,
          evmUaAddress: smartAccountAddress,
          ownerAddress: resolvedOwner,
        }) ?? "";
      const nextAccountInfo = {
        accountMode,
        delegatedChainIds,
        eip7702Delegated:
          accountMode === "eip7702" && delegatedChainIds.includes(magicWallet.chainId),
        evmDepositAddress,
        evmSmartAccount: accountMode === "eip7702" ? resolvedOwner : smartAccountAddress,
        ownerAddress: resolvedOwner,
        solanaSmartAccount: smartAccountOptions.solanaSmartAccountAddress ?? "",
        walletProvider,
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
  }, [
    accountMode,
    eip7702Capability,
    magicWallet.chainId,
    mode,
    ownerAddress,
    universalAccount,
    walletProvider,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createTransfer = useCallback(
    async (input: UniversalTransferInput) => {
      if (!universalAccount) throw new Error("Universal Account is not ready.");
      return await universalAccount.createTransferTransaction(input);
    },
    [universalAccount],
  );

  const createSettledTransfer = useCallback(
    async (input: SettledTransferInput) => {
      if (!universalAccount) throw new Error("Universal Account is not ready.");
      return await universalAccount.createUniversalTransaction(
        buildArbitrumUsdcSettlementTransaction(input),
      );
    },
    [universalAccount],
  );

  const signAuthorization = useCallback(
    async (auth: SignAuthorizationInput) => {
      if (isMagicSession) {
        return serializeAuthorizationSignature(
          await magicWallet.sign7702Authorization({
            chainId: auth.chainId,
            contractAddress: auth.address,
            nonce: auth.nonce,
          }),
        );
      }
      try {
        return await signParticleEip7702Authorization(walletClient, auth);
      } catch (nextError) {
        if (isJsonRpcAuthorizationError(nextError)) {
          throw new Error(
            "This wallet cannot sign EIP-7702 authorizations. Reconnect with Magic or use Smart Account mode.",
          );
        }
        throw nextError;
      }
    },
    [isMagicSession, magicWallet, walletClient],
  );

  const signAndSend = useCallback(
    async (transaction: ITransaction) => {
      if (!universalAccount) throw new Error("Universal Account is not ready.");
      const particleProvider = (window as unknown as Record<string, unknown>).particle as
        | { ethereum?: { request: (args: { method: "personal_sign"; params: unknown[] }) => Promise<string> } }
        | undefined;
      const signature = isMagicSession
        ? await magicWallet.signRootHash(transaction.rootHash)
        : await signUniversalAccountRootHash({
            account: ownerAddress,
            rootHash: transaction.rootHash,
            walletClient,
            personalSignProvider: particleProvider?.ethereum,
          });
      const authorizations: EIP7702Authorization[] = [];
      const nonceMap = new Map<string, string>();
      if (useEIP7702) {
        for (const userOp of transaction.userOps ?? []) {
          if (!userOp.eip7702Auth || userOp.eip7702Delegated) continue;
          const nonceKey = `${userOp.eip7702Auth.chainId}:${userOp.eip7702Auth.nonce}`;
          let authSignature = nonceMap.get(nonceKey);
          if (!authSignature) {
            authSignature = await signAuthorization(userOp.eip7702Auth);
            nonceMap.set(nonceKey, authSignature);
          }
          authorizations.push({ userOpHash: userOp.userOpHash, signature: authSignature });
        }
      }
      return await universalAccount.sendTransaction(
        transaction,
        signature,
        authorizations.length > 0 ? authorizations : undefined,
      );
    },
    [
      isMagicSession,
      magicWallet,
      ownerAddress,
      signAuthorization,
      universalAccount,
      useEIP7702,
      walletClient,
    ],
  );

  const ensureEip7702Delegated = useCallback(async () => {
    if (!isMagicSession || !universalAccount || !ownerAddress) {
      throw new Error("Magic 7702 wallet is not active.");
    }
    await magicWallet.switchChain(magicWallet.chainId);
    const auth = firstEip7702Auth(await universalAccount.getEIP7702Auth([magicWallet.chainId]));
    if (!auth?.address) throw new Error("Particle did not return a 7702 authorization target.");
    const authorization = await magicWallet.sign7702Authorization({
      chainId: magicWallet.chainId,
      contractAddress: auth.address,
      nonce: auth.nonce !== undefined ? auth.nonce + 1 : undefined,
    });
    await magicWallet.send7702Transaction({
      authorizationList: [authorization],
      data: "0x",
      to: ownerAddress,
    });
    return await refresh();
  }, [isMagicSession, magicWallet, ownerAddress, refresh, universalAccount]);

  return {
    ownerAddress,
    accountInfo,
    primaryAssets,
    universalAccount,
    eip7702Status,
    loading,
    error,
    refresh,
    createTransfer,
    createSettledTransfer,
    ensureEip7702Delegated,
    signAndSend,
  };
}
