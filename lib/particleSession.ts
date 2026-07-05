import { exportJWK, importPKCS8, importSPKI, jwtVerify, SignJWT, type JWTPayload } from "jose";

const CONVEX_AUDIENCE = "convex";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type ParticleSessionPayload = JWTPayload & {
  sub: string;
  authProvider: "particle";
  particleWalletAddress: string;
  particleUuid?: string;
  email?: string;
  name?: string;
};

export type ParticleSessionInput = {
  subject: string;
  walletAddress: string;
  particleUuid?: string;
  email?: string;
  name?: string;
};

function normalizePem(value: string | undefined) {
  return value?.replace(/\\n/g, "\n").trim();
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for Particle Convex auth.`);
  }
  return value;
}

function issuer() {
  return requiredEnv("PARTICLE_CONVEX_JWT_ISSUER");
}

function keyId() {
  return process.env.PARTICLE_CONVEX_JWT_KID || "particle-convex";
}

async function privateKey() {
  return await importPKCS8(
    normalizePem(requiredEnv("PARTICLE_CONVEX_JWT_PRIVATE_KEY_PEM"))!,
    "RS256",
  );
}

async function publicKey() {
  return await importSPKI(
    normalizePem(requiredEnv("PARTICLE_CONVEX_JWT_PUBLIC_KEY_PEM"))!,
    "RS256",
  );
}

export async function createParticleSessionToken(input: ParticleSessionInput) {
  const normalizedAddress = input.walletAddress.toLowerCase();

  return await new SignJWT({
    authProvider: "particle",
    particleWalletAddress: normalizedAddress,
    particleUuid: input.particleUuid,
    email: input.email,
    name: input.name,
  })
    .setProtectedHeader({ alg: "RS256", kid: keyId() })
    .setIssuer(issuer())
    .setAudience(CONVEX_AUDIENCE)
    .setSubject(input.subject)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(await privateKey());
}

export async function verifyParticleSessionToken(token: string) {
  const verified = await jwtVerify(token, await publicKey(), {
    issuer: issuer(),
    audience: CONVEX_AUDIENCE,
  });
  return verified.payload as ParticleSessionPayload;
}

export async function getParticleJwks() {
  const jwk = await exportJWK(await publicKey());
  return {
    keys: [
      {
        ...jwk,
        kid: keyId(),
        alg: "RS256",
        use: "sig",
      },
    ],
  };
}

export function getSessionMaxAgeSeconds() {
  return SESSION_TTL_SECONDS;
}
