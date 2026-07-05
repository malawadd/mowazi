import * as ParticleUa from "@particle-network/universal-account-sdk";

type ParticleToken = {
  assetId?: string;
  type?: string;
  chainId: number;
  address: string;
  symbol?: string;
};

const CHAIN = {
  solana: 101,
  ethereum: 1,
  bsc: 56,
  base: 8453,
  arbitrum: 42161,
  optimism: 10,
  polygon: 137,
  avalanche: 43114,
} as const;

const PRIMARY_TYPES = new Set<string>([
  "eth",
  "usdt",
  "usdc",
  "sol",
  "bnb",
]);

const TOKEN_PRIORITY: Record<string, number> = {
  usdc: 0,
  usdt: 1,
  eth: 2,
  sol: 3,
  bnb: 4,
};

const CHAIN_LABELS: Record<number, string> = {
  [CHAIN.solana]: "Solana",
  [CHAIN.ethereum]: "Ethereum",
  [CHAIN.bsc]: "BNB Chain",
  [CHAIN.base]: "Base",
  [CHAIN.arbitrum]: "Arbitrum",
  [CHAIN.optimism]: "Optimism",
  [CHAIN.polygon]: "Polygon",
  [CHAIN.avalanche]: "Avalanche",
};

export type PaymentTokenOption = {
  id: string;
  label: string;
  token: {
    chainId: number;
    address: string;
    symbol: string;
  };
  receiverKind: "evm" | "solana";
};

export function isSolanaChain(chainId: number) {
  return chainId === CHAIN.solana;
}

export function chainLabel(chainId: number) {
  return CHAIN_LABELS[chainId] ?? `Chain ${chainId}`;
}

export function getReceiverForPaymentToken(
  token: { chainId: number },
  addresses: { evmUaAddress?: string | null; solanaUaAddress?: string | null },
) {
  if (isSolanaChain(token.chainId)) {
    if (!addresses.solanaUaAddress) {
      throw new Error("Recipient Solana Universal Account address is missing.");
    }
    return { receiver: addresses.solanaUaAddress, receiverKind: "solana" as const };
  }

  if (!addresses.evmUaAddress) {
    throw new Error("Recipient EVM Universal Account address is missing.");
  }
  return { receiver: addresses.evmUaAddress, receiverKind: "evm" as const };
}

function tokenSymbol(token: ParticleToken) {
  return String(token.symbol ?? token.type ?? token.assetId ?? "TOKEN").toUpperCase();
}

function optionId(token: ParticleToken) {
  return `${token.chainId}:${token.address}`;
}

export function getPaymentTokenOptions(): PaymentTokenOption[] {
  const seen = new Set<string>();
  const options: PaymentTokenOption[] = [];
  const particleMetadata = ParticleUa as unknown as {
    SUPPORTED_TARGET_TOKENS?: ParticleToken[];
  };
  const supportedTargetTokens = particleMetadata.SUPPORTED_TARGET_TOKENS ?? [];

  for (const token of supportedTargetTokens) {
    const type = String(token.type ?? token.assetId ?? "").toLowerCase();
    if (!PRIMARY_TYPES.has(type)) continue;

    const id = optionId(token);
    if (seen.has(id)) continue;
    seen.add(id);

    const symbol = tokenSymbol(token);
    options.push({
      id,
      label: `${symbol} on ${chainLabel(token.chainId)}`,
      receiverKind: isSolanaChain(token.chainId) ? "solana" : "evm",
      token: {
        chainId: token.chainId,
        address: token.address,
        symbol,
      },
    });
  }

  return options.sort((a, b) => {
    const tokenRank = (TOKEN_PRIORITY[a.token.symbol.toLowerCase()] ?? 99) -
      (TOKEN_PRIORITY[b.token.symbol.toLowerCase()] ?? 99);
    if (tokenRank !== 0) return tokenRank;
    return a.label.localeCompare(b.label);
  });
}
