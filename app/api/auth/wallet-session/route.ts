import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyMessage } from "ethers";
import { PARTICLE_NONCE_COOKIE, PARTICLE_SESSION_COOKIE } from "@/lib/particleAuthConstants";
import { decodeParticleNonce } from "@/lib/particleNonce";
import {
  type AppAuthProvider,
  createParticleSessionToken,
  getSessionMaxAgeSeconds,
} from "@/lib/particleSession";

export const runtime = "nodejs";

type WalletSessionBody = {
  address?: string;
  signature?: string;
  authProvider?: AppAuthProvider;
  email?: string | null;
  name?: string | null;
};

function clearNonce(response: NextResponse) {
  response.cookies.set({
    name: PARTICLE_NONCE_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
  });
}

function normalizeAuthProvider(value: unknown): AppAuthProvider {
  return value === "magic" ? "magic" : "wallet";
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const nonceCookie = cookieStore.get(PARTICLE_NONCE_COOKIE)?.value;
    const body = (await request.json().catch(() => ({}))) as WalletSessionBody;
    const address = body.address?.toLowerCase();

    if (!nonceCookie || !address || !body.signature) {
      return NextResponse.json({ error: "Missing wallet sign-in proof." }, { status: 400 });
    }

    let noncePayload;
    try {
      noncePayload = decodeParticleNonce(nonceCookie);
    } catch {
      return NextResponse.json({ error: "Sign-in nonce is invalid." }, { status: 400 });
    }

    if (noncePayload.address !== address) {
      return NextResponse.json({ error: "Nonce does not match this wallet." }, { status: 400 });
    }

    let signedAddress;
    try {
      signedAddress = verifyMessage(noncePayload.message, body.signature).toLowerCase();
    } catch {
      return NextResponse.json({ error: "Wallet signature is invalid." }, { status: 401 });
    }

    if (signedAddress !== address) {
      return NextResponse.json({ error: "Wallet signature is invalid." }, { status: 401 });
    }

    const authProvider = normalizeAuthProvider(body.authProvider);
    const subject = `${authProvider}:${address}`;
    const token = await createParticleSessionToken({
      subject,
      authProvider,
      walletAddress: address,
      email: body.email ?? undefined,
      name: body.name ?? undefined,
    });
    const response = NextResponse.json({
      session: {
        subject,
        authProvider,
        walletAddress: address,
        email: body.email ?? null,
        name: body.name ?? null,
      },
    });

    clearNonce(response);
    response.cookies.set({
      name: PARTICLE_SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getSessionMaxAgeSeconds(),
    });

    return response;
  } catch (err) {
    if (err instanceof Error && err.message) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    return NextResponse.json({ error: "Could not complete wallet sign-in." }, { status: 500 });
  }
}
