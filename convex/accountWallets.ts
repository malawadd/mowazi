import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  createPaymentLinkSlug,
  normalizeDepositPolicy,
  PAYMENT_LINK_DEPOSIT_POLICY,
  PAYMENT_LINK_STATUS,
} from "./helpers/paymentLinks";
import { getStrategyAccountByUserId, getUserByAuthSubject } from "./model";

function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

async function getViewerIdentity(ctx: { auth: any }) {
  return await ctx.auth.getUserIdentity();
}

async function getViewerUser(ctx: { auth: any; db: any }) {
  const identity = await getViewerIdentity(ctx);
  if (!identity) return null;
  return await getUserByAuthSubject(ctx, identity.subject);
}

async function requireViewerUser(ctx: { auth: any; db: any }) {
  const identity = await getViewerIdentity(ctx);
  if (!identity) throw new Error("Unauthorized");

  const now = Date.now();
  const existing = await getUserByAuthSubject(ctx, identity.subject);
  if (existing) {
    return { identity, user: existing };
  }

  const userId = await ctx.db.insert("users", {
    authSubject: identity.subject,
    authProvider: String(identity.authProvider ?? "particle"),
    particleWalletAddress:
      typeof identity.particleWalletAddress === "string" ? identity.particleWalletAddress : undefined,
    particleUuid: typeof identity.particleUuid === "string" ? identity.particleUuid : undefined,
    email: typeof identity.email === "string" ? identity.email : undefined,
    displayName:
      identity.name ??
      [identity.givenName, identity.familyName].filter(Boolean).join(" ") ??
      identity.nickname,
    createdAt: now,
    updatedAt: now,
  });
  return { identity, user: await ctx.db.get(userId) };
}

async function getAccountWalletByUserId(ctx: { db: any }, userId: any) {
  return await ctx.db
    .query("accountWallets")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .first();
}

async function getActivePaymentLinkByUserId(ctx: { db: any }, userId: any) {
  return await ctx.db
    .query("paymentLinks")
    .withIndex("by_userId_status", (q: any) =>
      q.eq("userId", userId).eq("status", PAYMENT_LINK_STATUS.active),
    )
    .first();
}

const depositPolicyValidator = v.union(
  v.literal(PAYMENT_LINK_DEPOSIT_POLICY.uaSettlementOnly),
  v.literal(PAYMENT_LINK_DEPOSIT_POLICY.uaSettlementPlusEoaDirect),
);

async function createUniquePaymentLink(
  ctx: { db: any },
  args: { userId: any; strategyAccountId?: any; depositPolicy?: string },
) {
  const now = Date.now();
  const depositPolicy = normalizeDepositPolicy(
    args.depositPolicy ?? PAYMENT_LINK_DEPOSIT_POLICY.uaSettlementOnly,
  );
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const randomPart =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${args.userId}:${now}:${attempt}`;
    const slug = createPaymentLinkSlug(`${args.userId}:${randomPart}:${attempt}`);
    const existing = await ctx.db
      .query("paymentLinks")
      .withIndex("by_slug", (q: any) => q.eq("slug", slug))
      .first();
    if (existing) continue;

    const paymentLinkId = await ctx.db.insert("paymentLinks", {
      userId: args.userId,
      strategyAccountId: args.strategyAccountId,
      slug,
      status: PAYMENT_LINK_STATUS.active,
      depositPolicy,
      createdAt: now,
      updatedAt: now,
      disabledAt: undefined,
    });
    return await ctx.db.get(paymentLinkId);
  }
  throw new Error("Could not create a unique payment link.");
}

export const getViewerAccountWallet = query({
  args: {},
  handler: async (ctx) => {
    const user = await getViewerUser(ctx);
    if (!user) return null;
    return await getAccountWalletByUserId(ctx, user._id);
  },
});

export const syncViewerAccountWallet = mutation({
  args: {
    ownerAddress: v.string(),
    evmUaAddress: v.string(),
    solanaUaAddress: v.string(),
    unifiedBalanceUsd: v.number(),
    assetsJson: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewerUser(ctx);
    const user = viewer.user;
    if (!user) throw new Error("Could not create user.");
    if (!args.evmUaAddress.trim() || !args.solanaUaAddress.trim()) {
      throw new Error("Universal Account addresses are not ready.");
    }
    if (
      user.particleWalletAddress &&
      normalizeAddress(user.particleWalletAddress) !== normalizeAddress(args.ownerAddress)
    ) {
      throw new Error("Particle owner address does not match the signed-in user.");
    }

    const now = Date.now();
    const strategyAccount = await getStrategyAccountByUserId(ctx, user._id);
    const existing = await getAccountWalletByUserId(ctx, user._id);
    const next = {
      userId: user._id,
      strategyAccountId: strategyAccount?._id,
      ownerAddress: normalizeAddress(args.ownerAddress),
      evmUaAddress: args.evmUaAddress,
      solanaUaAddress: args.solanaUaAddress,
      unifiedBalanceUsd: args.unifiedBalanceUsd,
      assetsJson: args.assetsJson,
      lastRefreshedAt: now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, next);
      return await ctx.db.get(existing._id);
    }

    const walletId = await ctx.db.insert("accountWallets", {
      ...next,
      createdAt: now,
    });
    return await ctx.db.get(walletId);
  },
});

export const getViewerPaymentLink = query({
  args: {},
  handler: async (ctx) => {
    const user = await getViewerUser(ctx);
    if (!user) return null;
    return await getActivePaymentLinkByUserId(ctx, user._id);
  },
});

export const getOrCreateViewerPaymentLink = mutation({
  args: {
    depositPolicy: v.optional(depositPolicyValidator),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewerUser(ctx);
    const user = viewer.user;
    if (!user) throw new Error("Could not create user.");
    const wallet = await getAccountWalletByUserId(ctx, user._id);
    if (!wallet?.evmUaAddress || !wallet?.solanaUaAddress) {
      throw new Error("Sync your Particle account wallet before creating a payment link.");
    }

    const existing = await getActivePaymentLinkByUserId(ctx, user._id);
    const depositPolicy = normalizeDepositPolicy(
      args.depositPolicy ?? PAYMENT_LINK_DEPOSIT_POLICY.uaSettlementOnly,
    );
    if (existing) {
      if (normalizeDepositPolicy(existing.depositPolicy) !== depositPolicy) {
        await ctx.db.patch(existing._id, { depositPolicy, updatedAt: Date.now() });
        return await ctx.db.get(existing._id);
      }
      return existing;
    }
    const strategyAccount = await getStrategyAccountByUserId(ctx, user._id);
    return await createUniquePaymentLink(ctx, {
      userId: user._id,
      strategyAccountId: strategyAccount?._id,
      depositPolicy,
    });
  },
});

export const updateViewerPaymentLinkPolicy = mutation({
  args: {
    depositPolicy: depositPolicyValidator,
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewerUser(ctx);
    const user = viewer.user;
    if (!user) throw new Error("Could not create user.");
    const existing = await getActivePaymentLinkByUserId(ctx, user._id);
    if (!existing) {
      throw new Error("Create a payment link before updating its policy.");
    }
    const depositPolicy = normalizeDepositPolicy(args.depositPolicy);
    await ctx.db.patch(existing._id, { depositPolicy, updatedAt: Date.now() });
    return await ctx.db.get(existing._id);
  },
});

export const disableViewerPaymentLink = mutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireViewerUser(ctx);
    const user = viewer.user;
    if (!user) throw new Error("Could not create user.");
    const existing = await getActivePaymentLinkByUserId(ctx, user._id);
    if (!existing) return null;

    const now = Date.now();
    await ctx.db.patch(existing._id, {
      status: PAYMENT_LINK_STATUS.disabled,
      disabledAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(existing._id);
  },
});

export const rotateViewerPaymentLink = mutation({
  args: {
    depositPolicy: v.optional(depositPolicyValidator),
  },
  handler: async (ctx, args) => {
    const viewer = await requireViewerUser(ctx);
    const user = viewer.user;
    if (!user) throw new Error("Could not create user.");
    const wallet = await getAccountWalletByUserId(ctx, user._id);
    if (!wallet?.evmUaAddress || !wallet?.solanaUaAddress) {
      throw new Error("Sync your Particle account wallet before rotating a payment link.");
    }

    const existing = await getActivePaymentLinkByUserId(ctx, user._id);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: PAYMENT_LINK_STATUS.disabled,
        disabledAt: now,
        updatedAt: now,
      });
    }

    const strategyAccount = await getStrategyAccountByUserId(ctx, user._id);
    return await createUniquePaymentLink(ctx, {
      userId: user._id,
      strategyAccountId: strategyAccount?._id,
      depositPolicy: args.depositPolicy ?? PAYMENT_LINK_DEPOSIT_POLICY.uaSettlementOnly,
    });
  },
});
