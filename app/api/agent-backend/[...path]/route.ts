import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const backendUrl = process.env.AGENT_API_URL ?? "http://127.0.0.1:8100";

function isAllowed(path: string) {
  return path === "health" || path.startsWith("v1/tiers/") || path === "v1/jobs/dispatch" || path === "internal/evidence" || path.startsWith("internal/workflows");
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;
  const path = segments.join("/");
  if (!isAllowed(path)) return NextResponse.json({ error: "Unsupported agent backend route." }, { status: 404 });
  if (path.startsWith("internal/") && process.env.AGENT_LAB_ENABLED !== "true") {
    return NextResponse.json({ error: "Agent Lab is disabled." }, { status: 404 });
  }

  const headers = new Headers({ Accept: "application/json" });
  if (path.startsWith("internal/") || path === "v1/jobs/dispatch") {
    const secret = process.env.WORKER_SHARED_SECRET;
    if (!secret) return NextResponse.json({ error: "Worker secret is not configured." }, { status: 503 });
    headers.set("Authorization", `Bearer ${secret}`);
  }
  let body: string | undefined;
  if (request.method !== "GET" && request.method !== "HEAD") {
    body = await request.text();
    headers.set("Content-Type", request.headers.get("content-type") ?? "application/json");
  }
  try {
    const response = await fetch(`${backendUrl}/${path}`, {
      method: request.method, headers, body, cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Agent backend is unavailable." },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
