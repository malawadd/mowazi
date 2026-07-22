import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { PARTICLE_SESSION_COOKIE } from "@/lib/particleAuthConstants";
import { verifyParticleSessionToken } from "@/lib/particleSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const backendUrl = process.env.AGENT_API_URL ?? "http://127.0.0.1:8100";

function allowed(path: string) {
  return path === "connections"
    || /^connections\/[^/]+(?:\/(?:models|probe))?$/.test(path);
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) return origin === request.nextUrl.origin;
  return request.headers.get("sec-fetch-site") === "same-origin";
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await context.params;
  const path = parts.join("/");
  if (!allowed(path)) return NextResponse.json({ error: "Unsupported provider route." }, { status: 404 });
  if (!["GET", "HEAD"].includes(request.method) && !sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin provider mutation rejected." }, { status: 403 });
  }
  const cookieStore = await cookies();
  const token = cookieStore.get(PARTICLE_SESSION_COOKIE)?.value;
  if (!token) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  let subject: string;
  try {
    const session = await verifyParticleSessionToken(token);
    if (!session.sub) throw new Error("Missing subject");
    subject = session.sub;
  } catch {
    return NextResponse.json({ error: "Session expired." }, { status: 401 });
  }
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!secret) return NextResponse.json({ error: "Provider service is unavailable." }, { status: 503 });
  const headers = new Headers({
    Accept: "application/json",
    Authorization: `Bearer ${secret}`,
    "X-Moeazi-Subject": subject,
    "X-Request-Id": crypto.randomUUID(),
  });
  const body = ["GET", "HEAD"].includes(request.method) ? undefined : await request.text();
  if (body !== undefined) headers.set("Content-Type", request.headers.get("content-type") ?? "application/json");
  try {
    const response = await fetch(`${backendUrl}/v1/providers/${path}`, {
      method: request.method, headers, body, cache: "no-store", signal: AbortSignal.timeout(60_000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Provider service is unavailable." }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
