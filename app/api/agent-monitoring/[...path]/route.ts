import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { PARTICLE_SESSION_COOKIE } from "@/lib/particleAuthConstants";
import { verifyParticleSessionToken } from "@/lib/particleSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const backendUrl = process.env.AGENT_API_URL ?? "http://127.0.0.1:8100";

function allowed(path: string) {
  return path === "runs" || path === "usage" || path === "stream" || /^runs\/[A-Za-z0-9-]{16,80}$/.test(path);
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await context.params;
  const path = parts.join("/");
  if (!allowed(path)) return NextResponse.json({ error: "Unsupported monitoring route." }, { status: 404 });
  const token = (await cookies()).get(PARTICLE_SESSION_COOKIE)?.value;
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
  if (!secret) return NextResponse.json({ error: "Monitoring service is unavailable." }, { status: 503 });
  const target = new URL(`${backendUrl}/v1/monitoring/${path}`);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  try {
    const response = await fetch(target, {
      headers: {
        Accept: path === "stream" ? "text/event-stream" : "application/json",
        Authorization: `Bearer ${secret}`, "X-Moeazi-Subject": subject,
        "X-Request-Id": crypto.randomUUID(),
      },
      cache: "no-store",
      signal: path === "stream" ? request.signal : AbortSignal.timeout(30_000),
    });
    if (path === "stream" && response.body) {
      return new NextResponse(response.body, {
        status: response.status,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
      });
    }
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json({ error: "Monitoring service is unavailable." }, { status: 502 });
  }
}
