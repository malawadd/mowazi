import { NextResponse } from "next/server";
import { PARTICLE_NONCE_COOKIE, PARTICLE_SESSION_COOKIE } from "@/lib/particleAuthConstants";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: PARTICLE_SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  response.cookies.set({ name: PARTICLE_NONCE_COOKIE, value: "", path: "/", maxAge: 0 });
  return response;
}
