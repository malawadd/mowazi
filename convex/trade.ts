import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getUserByAuthSubject } from "./model";
import { DEFAULT_TRADE_SETTINGS, PERP_MARKETS } from "../lib/trade/markets";
import { assertCanCancelTradeIntent, normalizeOptionalHours } from "../lib/trade/intents";
import { getVenueSnapshotsWithFallback } from "../lib/trade/publicQuotes";
import { routeBestExecution, validateTradeSettings } from "../lib/trade/routing";
import type { BestExecutionQuote, TradeSettings } from "../lib/trade/types";

const sideValidator = v.union(v.literal("long"), v.literal("short"));
const venueValidator = v.union(
  v.literal("hyperliquid"),
  v.literal("lighter"),
  v.literal("orderly"),
  v.literal("gmx"),
  v.literal("ostium"),
);

async function getViewerUser(ctx: { auth: any; db: any }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return { identity: null, user: null };
  return { identity, user: await getUserByAuthSubject(ctx, identity.subject) };
}

async function requireViewerUser(ctx: { auth: any; db: any }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthorized");
  const now = Date.now();
  const existing = await getUserByAuthSubject(ctx, identity.subject);
  if (existing) return existing;

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
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Could not create user.");
  return user;
}

function toSettings(row: any): TradeSettings {
  if (!row) return DEFAULT_TRADE_SETTINGS;
  return {
    defaultMarketId: row.defaultMarketId,
    defaultLeverage: row.defaultLeverage,
    defaultMarginUsd: row.defaultMarginUsd,
    slippageCapBps: row.slippageCapBps,
    expectedHoldHours: row.expectedHoldHours ?? null,
    requireConfirmation: row.requireConfirmation,
  };
}

export const getTradeDashboard = query({
  args: {},
  handler: async (ctx) => {
    const { identity, user } = await getViewerUser(ctx);
    if (!identity || !user) {
      return {
        signedIn: Boolean(identity),
        markets: PERP_MARKETS,
        settings: DEFAULT_TRADE_SETTINGS,
        accountWallet: null,
        queuedIntents: [],
      };
    }

    const [settings, accountWallet, intents] = await Promise.all([
      ctx.db.query("tradeSettings").withIndex("by_userId", (q) => q.eq("userId", user._id)).first(),
      ctx.db.query("accountWallets").withIndex("by_userId", (q) => q.eq("userId", user._id)).first(),
      ctx.db.query("tradeIntents").withIndex("by_userId", (q) => q.eq("userId", user._id)).order("desc").take(12),
    ]);

    return {
      signedIn: true,
      markets: PERP_MARKETS,
      settings: toSettings(settings),
      accountWallet: accountWallet
        ? {
            id: accountWallet._id,
            ownerAddress: accountWallet.ownerAddress,
            evmUaAddress: accountWallet.evmUaAddress,
            unifiedBalanceUsd: accountWallet.unifiedBalanceUsd,
            assetsJson: accountWallet.assetsJson,
            lastRefreshedAt: accountWallet.lastRefreshedAt,
          }
        : null,
      queuedIntents: intents.map((intent) => ({
        id: intent._id,
        marketId: intent.marketId,
        side: intent.side,
        status: intent.status,
        marginUsd: intent.marginUsd,
        leverage: intent.leverage,
        notionalUsd: intent.notionalUsd,
        selectedVenue: intent.selectedVenue ?? null,
        quoteJson: intent.quoteJson,
        quoteCreatedAt: intent.quoteCreatedAt,
        queuedAt: intent.queuedAt,
        updatedAt: intent.updatedAt,
      })),
    };
  },
});

export const previewPerpRoute = action({
  args: {
    marketId: v.string(),
    side: sideValidator,
    marginUsd: v.number(),
    leverage: v.number(),
    expectedHoldHours: v.optional(v.number()),
    slippageCapBps: v.number(),
  },
  handler: async (ctx, args): Promise<BestExecutionQuote> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");
    const input = {
      marketId: args.marketId,
      side: args.side,
      marginUsd: args.marginUsd,
      leverage: args.leverage,
      holdTimeHours: normalizeOptionalHours(args.expectedHoldHours),
      slippageCapBps: args.slippageCapBps,
      now: Date.now(),
    };
    const snapshots = await getVenueSnapshotsWithFallback(input);
    return routeBestExecution(input, snapshots);
  },
});

export const setTradeSettings = mutation({
  args: {
    defaultMarketId: v.string(),
    defaultLeverage: v.number(),
    defaultMarginUsd: v.number(),
    slippageCapBps: v.number(),
    expectedHoldHours: v.optional(v.number()),
    requireConfirmation: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireViewerUser(ctx);
    const expectedHoldHours = normalizeOptionalHours(args.expectedHoldHours);
    validateTradeSettings({ ...args, expectedHoldHours });
    const now = Date.now();
    const existing = await ctx.db
      .query("tradeSettings")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    const patch = { ...args, expectedHoldHours: expectedHoldHours ?? undefined, updatedAt: now };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return await ctx.db.get(existing._id);
    }
    const settingsId = await ctx.db.insert("tradeSettings", {
      userId: user._id,
      ...patch,
      createdAt: now,
    });
    return await ctx.db.get(settingsId);
  },
});

export const queueTradeIntent = mutation({
  args: {
    marketId: v.string(),
    side: sideValidator,
    marginUsd: v.number(),
    leverage: v.number(),
    expectedHoldHours: v.optional(v.number()),
    slippageCapBps: v.number(),
    selectedVenue: venueValidator,
    quoteJson: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireViewerUser(ctx);
    const parsed = JSON.parse(args.quoteJson) as BestExecutionQuote;
    if (parsed.winningVenue !== args.selectedVenue) {
      throw new Error("Only the current best-execution venue can be queued.");
    }
    const accountWallet = await ctx.db
      .query("accountWallets")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .first();
    const expectedHoldHours = normalizeOptionalHours(args.expectedHoldHours);
    const now = Date.now();
    const intentId = await ctx.db.insert("tradeIntents", {
      userId: user._id,
      accountWalletId: accountWallet?._id,
      marketId: args.marketId,
      side: args.side,
      status: "queued",
      marginUsd: args.marginUsd,
      leverage: args.leverage,
      notionalUsd: Number((args.marginUsd * args.leverage).toFixed(2)),
      slippageCapBps: args.slippageCapBps,
      expectedHoldHours: expectedHoldHours ?? undefined,
      selectedVenue: args.selectedVenue,
      benchmarkVenue: parsed.benchmarkVenue ?? undefined,
      quoteJson: args.quoteJson,
      quoteCreatedAt: parsed.createdAt,
      queuedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(intentId);
  },
});

export const cancelTradeIntent = mutation({
  args: {
    intentId: v.id("tradeIntents"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireViewerUser(ctx);
    const intent = await ctx.db.get(args.intentId);
    if (!intent || intent.userId !== user._id) throw new Error("Trade intent not found.");
    assertCanCancelTradeIntent(intent.status as any);
    const now = Date.now();
    await ctx.db.patch(args.intentId, {
      status: "cancelled",
      cancelReason: args.reason,
      cancelledAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(args.intentId);
  },
});
