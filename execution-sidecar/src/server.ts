import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { GmxApiSdk } from "@gmx-io/sdk/v2";

const port = Number(process.env.PORT ?? 8300);
const sharedSecret = process.env.WORKER_SHARED_SECRET ?? "";
const liveExecution = process.env.LIVE_EXECUTION_ENABLED === "true";
const certified = new Set((process.env.CERTIFIED_VENUES ?? "").split(",").filter(Boolean));
const uniswapApiKey = process.env.UNISWAP_API_KEY ?? "";
const uniswapApiUrl = process.env.UNISWAP_API_URL ?? "https://trade-api.gateway.uniswap.org/v1";
const gmx = new GmxApiSdk({ chainId: 42161 });

function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(value));
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

function validatedSwap(result: any, expectedChainId?: number) {
  const transaction = result?.swap ?? result?.transaction ?? result;
  if (!transaction || typeof transaction !== "object") throw new Error("Missing swap transaction");
  if (typeof transaction.to !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(transaction.to)) {
    throw new Error("Invalid swap transaction target");
  }
  if (typeof transaction.data !== "string" || !/^0x[0-9a-fA-F]+$/.test(transaction.data) || transaction.data === "0x") {
    throw new Error("Invalid swap transaction calldata");
  }
  if (expectedChainId && transaction.chainId && Number(transaction.chainId) !== expectedChainId) {
    throw new Error("Swap transaction chain does not match the request");
  }
  if (!["string", "number", "bigint"].includes(typeof transaction.value)) {
    throw new Error("Invalid swap transaction value");
  }
  return transaction;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, {
        status: "ok",
        gmx: { sdk: "@gmx-io/sdk/v2", live: liveExecution && certified.has("gmx") },
        uniswap: { live: liveExecution && certified.has("uniswap") },
      });
    }
    if (!authorized(req)) return json(res, 401, { error: "Unauthorized" });
    if (req.method === "GET" && req.url === "/internal/gmx/markets") {
      return json(res, 200, { markets: await gmx.fetchMarkets() });
    }
    if (req.method === "POST" && req.url === "/internal/uniswap/check-approval") {
      return json(res, 200, await uniswap("check_approval", await body(req)));
    }
    if (req.method === "POST" && req.url === "/internal/uniswap/quote") {
      return json(res, 200, await uniswap("quote", await body(req)));
    }
    if (req.method === "POST" && req.url === "/internal/uniswap/swap") {
      const request = await body(req);
      const result = await uniswap("swap", request);
      validatedSwap(result, request.chainId ? Number(request.chainId) : undefined);
      return json(res, 200, result);
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
