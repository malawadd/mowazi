import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, defineChain, http, parseAbi } from "viem";
import {
  ARBITRUM_TOKEN_REGISTRY_VERSION,
  ARBITRUM_TOKENS,
  type ArbitrumTokenSymbol,
} from "@/lib/trade/arbitrumRegistry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ERC20_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

type Verification = { verified: boolean; checkedAt: number; error?: string };
const cache = new Map<string, Verification>();

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.toUpperCase() as ArbitrumTokenSymbol;
  const token = ARBITRUM_TOKENS[symbol];
  if (!token) return NextResponse.json({ error: "Token is not in the Arbitrum registry." }, { status: 404 });

  const recent = cache.get(symbol);
  if (recent && Date.now() - recent.checkedAt < 300_000) {
    return NextResponse.json({ version: ARBITRUM_TOKEN_REGISTRY_VERSION, token, ...recent });
  }

  const rpcUrl = process.env.ARBITRUM_RPC_URL ?? process.env.NEXT_PUBLIC_ARB_RPC_URL;
  if (!rpcUrl) return NextResponse.json({ error: "ARBITRUM_RPC_URL is not configured." }, { status: 503 });
  try {
    const chain = defineChain({
      id: 42161,
      name: "Arbitrum One",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    });
    const client = createPublicClient({ chain, transport: http(rpcUrl) });
    const [chainId, code, onchainSymbol, decimals] = await Promise.all([
      client.getChainId(),
      client.getCode({ address: token.address }),
      client.readContract({ address: token.address, abi: ERC20_ABI, functionName: "symbol" }),
      client.readContract({ address: token.address, abi: ERC20_ABI, functionName: "decimals" }),
    ]);
    const verified = chainId === token.chainId && Boolean(code && code !== "0x")
      && onchainSymbol.toUpperCase() === token.symbol && Number(decimals) === token.decimals;
    const result = { verified, checkedAt: Date.now(), error: verified ? undefined : "On-chain metadata did not match the registry." };
    cache.set(symbol, result);
    return NextResponse.json({ version: ARBITRUM_TOKEN_REGISTRY_VERSION, token, chainId, onchainSymbol, decimals, ...result }, { status: verified ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
