import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { createPaymentLinkSlug, PAYMENT_LINK_STATUS } from "./helpers/paymentLinks";
import { requireViewerStrategy } from "./model";

function normalizeAddress(value: string) {
  return value.trim().toLowerCase();
}

async function requireViewerAccount(ctx: { auth: any; db: any }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  const { user, strategyAccount } = await requireViewerStrategy(ctx, identity.subject);
  if (!user || !strategyAccount) {
    throw new Error("Strategy account not provisioned");
  }
  return { user, strategyAccount };
}

async function getOptionalViewerAccount(ctx: { auth: any; db: any }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return null;
  }
  const { user, strategyAccount } = await requireViewerStrategy(ctx, identity.subject);
  if (!user || !strategyAccount) {
    return null;
  }
  return { user, strategyAccount };
}

async function getAccountWallet(ctx: { db: any }, strategyAccountId: any) {
  return await ctx.db
    .query("accountWallets")
    .withIndex("by_strategyAccountId", (q: any) => q.eq("strategyAccountId", strategyAccountId))
    .first();
}

async function getActivePaymentLink(ctx: { db: any }, strategyAccountId: any) {
  return await ctx.db
    .query("paymentLinks")
    .withIndex("by_strategyAccountId_status", (q: any) =>
      q.eq("strategyAccountId", strategyAccountId).eq("status", PAYMENT_LINK_STATUS.active),
    )
    .first();
}

async function createUniquePaymentLink(ctx: { db: any }, args: { userId: any; strategyAccountId: any }) {
  const now = Date.now();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const randomPart =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${args.strategyAccountId}:${now}:${attempt}`;
    const slug = createPaymentLinkSlug(`${args.strategyAccountId}:${randomPart}:${attempt}`);
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
    const viewer = await getOptionalViewerAccount(ctx);
    if (!viewer) return null;
    const { strategyAccount } = viewer;
    return await getAccountWallet(ctx, strategyAccount._id);
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
    const { user, strategyAccount } = await requireViewerAccount(ctx);
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
    const existing = await getAccountWallet(ctx, strategyAccount._id);
    const next = {
      userId: user._id,
      strategyAccountId: strategyAccount._id,
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
    const viewer = await getOptionalViewerAccount(ctx);
    if (!viewer) return null;
    const { strategyAccount } = viewer;
    return await getActivePaymentLink(ctx, strategyAccount._id);
  },
});

export const getOrCreateViewerPaymentLink = mutation({
  args: {},
  handler: async (ctx) => {
    const { user, strategyAccount } = await requireViewerAccount(ctx);
    const wallet = await getAccountWallet(ctx, strategyAccount._id);
    if (!wallet?.evmUaAddress || !wallet?.solanaUaAddress) {
      throw new Error("Sync your Particle account wallet before creating a payment link.");
    }

    const existing = await getActivePaymentLink(ctx, strategyAccount._id);
    if (existing) return existing;
    return await createUniquePaymentLink(ctx, {
      userId: user._id,
      strategyAccountId: strategyAccount._id,
    });
  },
});

export const disableViewerPaymentLink = mutation({
  args: {},
  handler: async (ctx) => {
    const { strategyAccount } = await requireViewerAccount(ctx);
    const existing = await getActivePaymentLink(ctx, strategyAccount._id);
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
  args: {},
  handler: async (ctx) => {
    const { user, strategyAccount } = await requireViewerAccount(ctx);
    const wallet = await getAccountWallet(ctx, strategyAccount._id);
    if (!wallet?.evmUaAddress || !wallet?.solanaUaAddress) {
      throw new Error("Sync your Particle account wallet before rotating a payment link.");
    }

    const existing = await getActivePaymentLink(ctx, strategyAccount._id);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: PAYMENT_LINK_STATUS.disabled,
        disabledAt: now,
        updatedAt: now,
      });
    }

    return await createUniquePaymentLink(ctx, {
      userId: user._id,
      strategyAccountId: strategyAccount._id,
    });
  },
});
