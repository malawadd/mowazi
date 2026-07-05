import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { PARTICLE_NONCE_COOKIE } from "@/lib/particleAuthConstants";
import { createParticleSignInMessage, encodeParticleNonce } from "@/lib/particleNonce";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { address?: string };
  const address = body.address?.toLowerCase();

  if (!address || !/^0x[a-f0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "A valid EVM wallet address is required." }, { status: 400 });
  }

  const nonce = randomUUID();
  const issuedAt = new Date().toISOString();
  const message = createParticleSignInMessage(address, nonce, issuedAt);
  const response = NextResponse.json({ message });

  response.cookies.set({
    name: PARTICLE_NONCE_COOKIE,
    value: encodeParticleNonce({ address, nonce, issuedAt, message }),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 5 * 60,
  });

  return response;
}
