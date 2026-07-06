import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyMessage } from "ethers";
import { PARTICLE_NONCE_COOKIE, PARTICLE_SESSION_COOKIE } from "@/lib/particleAuthConstants";
import { decodeParticleNonce } from "@/lib/particleNonce";
import {
  createParticleSessionToken,
  getSessionMaxAgeSeconds,
} from "@/lib/particleSession";

export const runtime = "nodejs";

type WalletSessionBody = {
  address?: string;
  signature?: string;
};

function clearNonce(response: NextResponse) {
  response.cookies.set({
    name: PARTICLE_NONCE_COOKIE,
    value: "",
    path: "/",
    maxAge: 0,
  });
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

    const token = await createParticleSessionToken({
      subject: `wallet:${address}`,
      walletAddress: address,
    });
    const response = NextResponse.json({
      session: {
        subject: `wallet:${address}`,
        walletAddress: address,
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
