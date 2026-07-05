import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PARTICLE_SESSION_COOKIE } from "@/lib/particleAuthConstants";
import { verifyParticleSessionToken } from "@/lib/particleSession";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARTICLE_SESSION_COOKIE)?.value;

  if (!token) {
    return NextResponse.json({ error: "No active Particle session." }, { status: 401 });
  }

  try {
    const payload = await verifyParticleSessionToken(token);
    return NextResponse.json({
      token,
      session: {
        subject: payload.sub,
        walletAddress: payload.particleWalletAddress,
        particleUuid: payload.particleUuid ?? null,
        email: payload.email ?? null,
        name: payload.name ?? null,
      },
    });
  } catch {
    const response = NextResponse.json({ error: "Particle session expired." }, { status: 401 });
    response.cookies.set({ name: PARTICLE_SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
    return response;
  }
}
