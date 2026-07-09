import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyMessage } from "ethers";
import { PARTICLE_NONCE_COOKIE, PARTICLE_SESSION_COOKIE } from "@/lib/particleAuthConstants";
import { decodeParticleNonce } from "@/lib/particleNonce";
import { getEvmWalletAddress, getParticleUserInfo, isParticleProjectUser } from "@/lib/particleServer";
import {
  createParticleSessionToken,
  getSessionMaxAgeSeconds,
} from "@/lib/particleSession";

export const runtime = "nodejs";

type SessionRequestBody = {
  address?: string;
  signature?: string;
  particleUuid?: string;
  particleToken?: string;
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
    const body = (await request.json().catch(() => ({}))) as SessionRequestBody;
    const address = body.address?.toLowerCase();

    if (!nonceCookie || !address || !body.signature || !body.particleUuid || !body.particleToken) {
      return NextResponse.json({ error: "Missing Particle sign-in proof." }, { status: 400 });
    }

    let noncePayload;
    try {
      noncePayload = decodeParticleNonce(nonceCookie);
    } catch {
      return NextResponse.json({ error: "Particle sign-in nonce is invalid." }, { status: 400 });
    }

    if (noncePayload.address !== address) {
      return NextResponse.json({ error: "Particle sign-in nonce does not match this wallet." }, { status: 400 });
    }

    let signedAddress;
    try {
      signedAddress = verifyMessage(noncePayload.message, body.signature).toLowerCase();
    } catch {
      return NextResponse.json({ error: "Particle sign-in signature is invalid." }, { status: 401 });
    }

    if (signedAddress !== address) {
      return NextResponse.json({ error: "Particle sign-in signature is invalid." }, { status: 401 });
    }

    const [userInfo, isProjectUser] = await Promise.all([
      getParticleUserInfo(body.particleUuid, body.particleToken),
      isParticleProjectUser(address),
    ]);

    const evmWallet = getEvmWalletAddress(userInfo)?.toLowerCase();

    if (!userInfo || !evmWallet) {
      return NextResponse.json(
        { error: "Could not fetch Particle user info or no EVM wallet found." },
        { status: 502 },
      );
    }

    if (!isProjectUser || evmWallet !== address) {
      return NextResponse.json({ error: "Wallet is not a verified Particle project user." }, { status: 401 });
    }

    const token = await createParticleSessionToken({
      subject: `particle:${address}`,
      authProvider: "particle",
      walletAddress: address,
      particleUuid: userInfo.uuid,
      email: userInfo.email,
      name: userInfo.name,
    });
    const response = NextResponse.json({
      session: {
        subject: `particle:${address}`,
        authProvider: "particle",
        walletAddress: address,
        particleUuid: userInfo.uuid,
        email: userInfo.email ?? null,
        name: userInfo.name ?? null,
      },
    });

    response.cookies.set({
      name: PARTICLE_SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getSessionMaxAgeSeconds(),
    });
    clearNonce(response);

    return response;
  } catch (error) {
    console.error("Session POST unexpected error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error during sign-in.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
