import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { GmxApiSdk } from "@gmx-io/sdk/v2";

const port = Number(process.env.PORT ?? 8300);
const sharedSecret = process.env.WORKER_SHARED_SECRET ?? "";
const liveExecution = process.env.LIVE_EXECUTION_ENABLED === "true";
const certified = new Set((process.env.CERTIFIED_VENUES ?? "").split(",").filter(Boolean));
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
