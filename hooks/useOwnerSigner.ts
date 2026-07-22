"use client";

import { useCallback, useMemo } from "react";
import type { IUniversalTransaction } from "@particle-network/universal-account-sdk";
import { useUniversalAccount } from "@/hooks/useUniversalAccount";
import { ownerCapabilities, type OwnerSigner } from "@/lib/ownerSigner";

export function useOwnerSigner(): OwnerSigner & { loading: boolean; error: string | null } {
  const account = useUniversalAccount("eip7702-if-supported");
  const createCall = useCallback(async (request: IUniversalTransaction) => {
    if (!account.universalAccount) throw new Error("Universal Account is not ready.");
    if (request.chainId !== 42161) throw new Error("Strategy calls must execute on Arbitrum (42161).");
    return await account.universalAccount.createUniversalTransaction(request);
  }, [account.universalAccount]);
  const capabilities = useMemo(() => ownerCapabilities({
    eip7702Supported: account.eip7702Status.supported,
    delegatedChainIds: account.accountInfo?.delegatedChainIds ?? [],
  }), [account.accountInfo?.delegatedChainIds, account.eip7702Status.supported]);

  return {
    provider: account.accountInfo?.walletProvider ?? "particle",
    ownerAddress: account.ownerAddress ?? null,
    uaAddress: account.accountInfo?.evmSmartAccount ?? null,
    capabilities,
    createCall,
    send: account.signAndSend,
    signTypedData: account.signTypedData,
    enableArbitrumDelegation: account.ensureEip7702Delegated,
    loading: account.loading,
    error: account.error,
  };
}
