"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useWallets } from "@particle-network/connectkit";
import { Signature } from "ethers";
import {
  UniversalAccount,
  UNIVERSAL_ACCOUNT_VERSION,
  type EIP7702Authorization,
  type IAssetsResponse,
  type ITransaction,
} from "@particle-network/universal-account-sdk";
import {
  detectEip7702Capability,
  getEip7702Status,
  type Eip7702Status,
  type UniversalAccountMode,
} from "@/lib/eip7702";
import { buildArbitrumUsdcSettlementTransaction } from "@/lib/universalAccountSettlement";
import { signUniversalAccountRootHash } from "@/lib/universalAccountSigning";

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

export type SettledTransferInput = {
  /** Amount of Arbitrum USDC to deliver to the receiver. */
  amount: string;
  receiver: string;
};

type SignAuthorizationInput = {
  address: string;
  chainId: number;
  nonce: number;
};

function serializeAuthorizationSignature(value: unknown) {
  if (typeof value === "string") return value;
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const signature = record.signature;
  if (typeof signature === "string") return signature;
  if (signature && typeof signature === "object") {
    const nested = signature as Record<string, unknown>;
    if (typeof nested.serialized === "string") return nested.serialized;
  }
  if (typeof record.serialized === "string") return record.serialized;
  if (record.r && record.s && record.yParity !== undefined) {
    return Signature.from(record as any).serialized;
  }
  throw new Error("Wallet returned an unsupported EIP-7702 authorization signature.");
}

async function signEip7702Authorization(walletClient: unknown, auth: SignAuthorizationInput) {
  const client = walletClient as Record<string, any> | null | undefined;
  if (typeof client?.signAuthorization === "function") {
    return serializeAuthorizationSignature(await client.signAuthorization(auth));
  }
  if (typeof client?.authorizeSync === "function") {
    return serializeAuthorizationSignature(client.authorizeSync(auth));
  }
  if (typeof client?.sign7702Authorization === "function") {
    return serializeAuthorizationSignature(await client.sign7702Authorization(auth));
  }
  if (typeof client?.wallet?.sign7702Authorization === "function") {
    return serializeAuthorizationSignature(await client.wallet.sign7702Authorization(auth));
  }
  throw new Error("Connected wallet does not support EIP-7702 authorization.");
}

function isJsonRpcAuthorizationError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value);
  return message.includes('Account type "json-rpc"') || message.includes("does not support JSON-RPC Accounts");
}

export function useUniversalAccount(mode: UniversalAccountMode = "smart") {
  const { address } = useAccount();
  const [primaryWallet] = useWallets();
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [primaryAssets, setPrimaryAssets] = useState<IAssetsResponse | null>(null);
  const [eip7702Status, setEip7702Status] = useState<Eip7702Status>(() =>
    getEip7702Status("smart", detectEip7702Capability(null)),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walletClient = useMemo(() => primaryWallet?.getWalletClient(), [primaryWallet]);
  const eip7702Capability = useMemo(() => detectEip7702Capability(walletClient), [walletClient]);
  const useEIP7702 = mode === "eip7702-if-supported" && eip7702Capability.supported;

  const universalAccount = useMemo(() => {
    if (!address) return null;

    return new UniversalAccount({
      projectId: process.env.NEXT_PUBLIC_PROJECT_ID ?? "",
      projectClientKey: process.env.NEXT_PUBLIC_CLIENT_KEY ?? "",
      projectAppUuid: process.env.NEXT_PUBLIC_APP_ID ?? "",
      smartAccountOptions: {
        useEIP7702,
        name: "UNIVERSAL",
        version: UNIVERSAL_ACCOUNT_VERSION,
        ownerAddress: address,
      },
      tradeConfig: {
        slippageBps: 100,
        universalGas: true,
      },
    });
  }, [address, useEIP7702]);

  const refresh = useCallback(async () => {
    if (!universalAccount || !address) return null;

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
      setEip7702Status(getEip7702Status(mode, eip7702Capability, deployments));
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
  }, [address, eip7702Capability, mode, universalAccount]);

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

  /** Convert supported UA assets into Arbitrum USDC and transfer it to the receiver. */
  const createSettledTransfer = useCallback(
    async (input: SettledTransferInput) => {
      if (!universalAccount) {
        throw new Error("Universal Account is not ready.");
      }
      return await universalAccount.createUniversalTransaction(
        buildArbitrumUsdcSettlementTransaction(input),
      );
    },
    [universalAccount],
  );

  const signAndSend = useCallback(
    async (transaction: ITransaction) => {
      if (!universalAccount) {
        throw new Error("Universal Account is not ready.");
      }
      const particleProvider = (window as unknown as Record<string, unknown>).particle as
        | { ethereum?: { request: (args: { method: "personal_sign"; params: unknown[] }) => Promise<string> } }
        | undefined;
      const signature = await signUniversalAccountRootHash({
        account: address,
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
            try {
              authSignature = await signEip7702Authorization(walletClient, userOp.eip7702Auth);
            } catch (nextError) {
              if (isJsonRpcAuthorizationError(nextError)) {
                throw new Error(
                  "This wallet cannot sign EIP-7702 authorizations. Reconnect with a 7702-capable embedded wallet or use Smart Account mode.",
                );
              }
              throw nextError;
            }
            nonceMap.set(nonceKey, authSignature);
          }
          authorizations.push({
            userOpHash: userOp.userOpHash,
            signature: authSignature,
          });
        }
      }
      return await universalAccount.sendTransaction(
        transaction,
        signature,
        authorizations.length > 0 ? authorizations : undefined,
      );
    },
    [address, universalAccount, useEIP7702, walletClient],
  );

  return {
    ownerAddress: address,
    accountInfo,
    primaryAssets,
    universalAccount,
    eip7702Status,
    loading,
    error,
    refresh,
    createTransfer,
    createSettledTransfer,
    signAndSend,
  };
}
