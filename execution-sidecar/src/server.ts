import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { GmxApiSdk } from "@gmx-io/sdk/v2";
import { createPublicClient, defineChain, http } from "viem";
import { allowedTargets, assertFresh, prepareSwapRequest, routingOf, validateTransaction } from "./uniswap.js";

const port = Number(process.env.PORT ?? 8300);
const sharedSecret = process.env.WORKER_SHARED_SECRET ?? "";
const liveExecution = process.env.LIVE_EXECUTION_ENABLED === "true";
const certified = new Set((process.env.CERTIFIED_VENUES ?? "").split(",").filter(Boolean));
const uniswapApiKey = process.env.UNISWAP_API_KEY ?? "";
const uniswapApiUrl = process.env.UNISWAP_API_URL ?? "https://trade-api.gateway.uniswap.org/v1";
const mainnetSetup = process.env.MAINNET_VENUE_SETUP_ENABLED === "true";
const arbitrumRpcUrl = process.env.ARBITRUM_RPC_URL ?? "";
const swapTargets = allowedTargets(process.env.UNISWAP_ARBITRUM_TARGETS);
const arbitrum = defineChain({ id: 42161, name: "Arbitrum One",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [arbitrumRpcUrl || "http://127.0.0.1"] } } });
const arbitrumClient = arbitrumRpcUrl ? createPublicClient({ chain: arbitrum, transport: http(arbitrumRpcUrl) }) : null;
const gmx = new GmxApiSdk({ chainId: 42161 });

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value, (_key, item) => typeof item === "bigint" ? item.toString() : item));
}

function authorized(req: IncomingMessage) {
  return Boolean(sharedSecret) && req.headers.authorization === `Bearer ${sharedSecret}`;
}

async function body(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function uniswap(path: string, payload: unknown) {
  if (!uniswapApiKey) throw new Error("UNISWAP_API_KEY is not configured");
  const response = await fetch(`${uniswapApiUrl}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": uniswapApiKey,
      "x-universal-router-version": "2.0",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) {
    const detail = result && typeof result === "object" && "detail" in result ? result.detail : response.statusText;
    throw new Error(`Uniswap ${path} failed: ${String(detail)}`);
  }
  return result;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, {
        status: "ok",
        gmx: { sdk: "@gmx-io/sdk/v2", live: liveExecution && certified.has("gmx") },
        uniswap: { chainId: 42161, setup: mainnetSetup, live: liveExecution && certified.has("uniswap") },
      });
    }
    if (!authorized(req)) return json(res, 401, { error: "Unauthorized" });
    if (req.method === "GET" && req.url === "/internal/gmx/markets") {
      return json(res, 200, { markets: await gmx.fetchMarkets() });
    }
    if (req.method === "GET" && req.url?.startsWith("/internal/gmx/snapshots")) {
      const requested = new URL(req.url, "http://sidecar").searchParams.get("symbol")?.toUpperCase();
      const [markets, tickers] = await Promise.all([
        gmx.fetchMarkets(),
        gmx.fetchMarketsTickers(),
      ]);
      const listed = new Map(markets.filter((market) => market.isListed && !market.isSpotOnly).map((market) => [market.symbol, market]));
      return json(res, 200, {
        snapshots: tickers.filter((ticker) => listed.has(ticker.symbol)
          && (!requested || ticker.symbol.split("/")[0].toUpperCase() === requested)).map((ticker) => ({
          ...ticker,
          minPositionSizeUsd: listed.get(ticker.symbol)?.minPositionSizeUsd,
          maxLeverage: listed.get(ticker.symbol)?.leverageTiers?.[0]?.maxLeverage,
        })),
      });
    }
    if (req.method === "POST" && req.url === "/internal/uniswap/check-approval") {
      return json(res, 200, await uniswap("check_approval", await body(req)));
    }
    if (req.method === "POST" && req.url === "/internal/uniswap/quote") {
      return json(res, 200, await uniswap("quote", await body(req)));
    }
    if (req.method === "POST" && req.url === "/internal/uniswap/swap") {
      const request = await body(req);
      const quoteResponse = request.quoteResponse ?? request;
      const quotedAt = Number(request.quotedAt ?? request.moeazi?.quotedAt);
      const expectedSender = String(request.expectedSender ?? request.swapper ?? "");
      assertFresh(quotedAt);
      const result = await uniswap("swap", prepareSwapRequest(quoteResponse, request.signature));
      const transaction = validateTransaction({ result, expectedSender, allowedTargets: swapTargets });
      let simulation = { success: false, reason: "ARBITRUM_RPC_URL is not configured" };
      if (arbitrumClient) {
        try {
          await arbitrumClient.call({ account: transaction.from, to: transaction.to, data: transaction.data, value: transaction.value });
          simulation = { success: true, reason: "eth_call succeeded" };
        } catch (error) {
          simulation = { success: false, reason: error instanceof Error ? error.message.slice(0, 300) : String(error) };
        }
      }
      return json(res, 200, { ...result, routing: routingOf(quoteResponse), transaction,
        simulation, broadcastAllowed: liveExecution && certified.has("uniswap") && simulation.success });
    }
    if (req.method === "POST" && req.url === "/internal/uniswap/broadcast") {
      await body(req);
      if (!liveExecution || !certified.has("uniswap")) {
        return json(res, 423, { error: "Uniswap live execution certification gate is closed" });
      }
      return json(res, 501, { error: "KMS-backed in-memory signer is not configured" });
    }
    if (req.method === "POST" && req.url === "/internal/uniswap/cancel") {
      return json(res, 409, { error: "A broadcast AMM swap cannot be cancelled; reconcile its receipt instead" });
    }
    if (req.method === "POST" && req.url?.startsWith("/internal/execute")) {
      await body(req);
      if (!liveExecution) return json(res, 423, { error: "Live execution circuit breaker is open" });
      return json(res, 501, {
        error: "Signing endpoint intentionally unavailable until the venue canary suite certifies it",
      });
    }
    return json(res, 404, { error: "Not found" });
  } catch (error) {
    return json(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, "0.0.0.0");
