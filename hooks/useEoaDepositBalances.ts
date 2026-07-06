"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useModal, useSwitchChain, useWallets } from "@particle-network/connectkit";
import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  http,
  parseUnits,
  zeroAddress,
  type Address,
} from "viem";
import { getParticleEvmChain } from "@/lib/particleEvmChains";
import {
  getEvmPrimaryDepositTokenOptions,
  type EvmPrimaryDepositTokenOption,
} from "@/lib/particlePaymentTokens";

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;

export type EoaDepositBalance = EvmPrimaryDepositTokenOption & {
  rawBalance: bigint;
  formattedBalance: string;
  hasBalance: boolean;
  scanError?: string;
};

export type EoaDepositPreview = {
  token: EoaDepositBalance;
  receiver: string;
  amount: string;
  amountRaw: string;
  gasEstimate: string;
};

function publicClientFor(chainId: number) {
  const chain = getParticleEvmChain(chainId);
  if (!chain) throw new Error(`Unsupported EVM chain ${chainId}.`);
  return createPublicClient({ chain, transport: http() });
}

function trimTokenAmount(value: string) {
  if (!value.includes(".")) return value;
  return value.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

function formatBalance(raw: bigint, decimals: number) {
  return trimTokenAmount(formatUnits(raw, decimals));
}

function amountToRaw(amount: string, decimals: number) {
  const normalized = amount.trim();
  if (!normalized || Number(normalized) <= 0 || !Number.isFinite(Number(normalized))) {
    throw new Error("Enter an amount greater than zero.");
  }
  return parseUnits(normalized, decimals);
}

function transferCallData(receiver: string, amountRaw: bigint) {
  return encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: "transfer",
    args: [receiver as Address, amountRaw],
  });
}

async function readTokenBalance(owner: string, token: EvmPrimaryDepositTokenOption) {
  const client = publicClientFor(token.chainId);
  if (token.isNative) {
    return await client.getBalance({ address: owner as Address });
  }
  return await client.readContract({
    address: token.address as Address,
    abi: [
      {
        type: "function",
        name: "balanceOf",
        stateMutability: "view",
        inputs: [{ name: "account", type: "address" }],
        outputs: [{ name: "balance", type: "uint256" }],
      },
    ],
    functionName: "balanceOf",
    args: [owner as Address],
  });
}

export function useEoaDepositBalances() {
  const { address, chainId, connector, isConnected } = useAccount();
  const { setOpen } = useModal();
  const { switchChainAsync } = useSwitchChain();
  const [primaryWallet] = useWallets();
  const tokenOptions = useMemo(() => getEvmPrimaryDepositTokenOptions(), []);
  const [balances, setBalances] = useState<EoaDepositBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    setError(null);
    setOpen(true);
  }, [setOpen]);

  const refresh = useCallback(async () => {
    if (!address) {
      setBalances([]);
      return [];
    }

    setLoading(true);
    setError(null);
    try {
      const next = await Promise.all(
        tokenOptions.map(async (token): Promise<EoaDepositBalance> => {
          try {
            const rawBalance = await readTokenBalance(address, token);
            return {
              ...token,
              rawBalance,
              formattedBalance: formatBalance(rawBalance, token.realDecimals),
              hasBalance: rawBalance > 0n,
            };
          } catch (nextError) {
            return {
              ...token,
              rawBalance: 0n,
              formattedBalance: "0",
              hasBalance: false,
              scanError: nextError instanceof Error ? nextError.message : String(nextError),
            };
          }
        }),
      );
      setBalances(next);
      return next;
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [address, tokenOptions]);

  useEffect(() => {
    if (isConnected && address) {
      void refresh();
    }
  }, [address, isConnected, refresh]);

  const previewDeposit = useCallback(
    async (token: EoaDepositBalance, amount: string, receiver: string): Promise<EoaDepositPreview> => {
      if (!address) throw new Error("Connect a wallet first.");
      const chain = getParticleEvmChain(token.chainId);
      if (!chain) throw new Error(`Unsupported EVM chain ${token.chainId}.`);
      const amountRaw = amountToRaw(amount, token.realDecimals);
      if (amountRaw > token.rawBalance) {
        throw new Error(`Insufficient ${token.symbol} balance on ${token.chainName}.`);
      }

      const client = publicClientFor(token.chainId);
      const gas = token.isNative
        ? await client.estimateGas({
            account: address as Address,
            to: receiver as Address,
            value: amountRaw,
          })
        : await client.estimateGas({
            account: address as Address,
            to: token.address as Address,
            data: transferCallData(receiver, amountRaw),
          });

      return {
        token,
        receiver,
        amount,
        amountRaw: amountRaw.toString(),
        gasEstimate: gas.toString(),
      };
    },
    [address],
  );

  const sendDeposit = useCallback(
    async (preview: EoaDepositPreview) => {
      if (!address) throw new Error("Connect a wallet first.");
      const walletClient = primaryWallet?.getWalletClient() as any;
      if (!walletClient) throw new Error("Connected wallet is not ready.");
      if (chainId !== preview.token.chainId) {
        await switchChainAsync({ connector, chainId: preview.token.chainId });
      }

      const amountRaw = BigInt(preview.amountRaw);
      const txHash = preview.token.isNative
        ? await walletClient.sendTransaction({
            account: address as Address,
            to: preview.receiver as Address,
            value: amountRaw,
          })
        : await walletClient.sendTransaction({
            account: address as Address,
            to: preview.token.address as Address,
            data: transferCallData(preview.receiver, amountRaw),
            value: 0n,
          });
      await refresh();
      return txHash as string;
    },
    [address, chainId, connector, primaryWallet, refresh, switchChainAsync],
  );

  return {
    address,
    isConnected,
    currentChainId: chainId,
    tokenOptions,
    balances,
    depositableBalances: balances.filter((balance) => balance.hasBalance),
    scannedCount: balances.length,
    loading,
    error,
    connect,
    refresh,
    previewDeposit,
    sendDeposit,
    zeroAddress,
  };
}
