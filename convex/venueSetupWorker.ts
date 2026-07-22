import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { managedTradingVenue } from "./agentValidators";

const authority = v.union(v.literal("shadow"), v.literal("approval"), v.literal("autopilot"));

const ROLE = {
  hyperliquid: "hyperliquid_agent_wallet",
  lighter: "lighter_trading_account",
  orderly: "orderly_trading_account",
  gmx: "gmx_trading_wallet",
  ostium: "ostium_trading_wallet",
  uniswap: "arbitrum_ua_owner",
} as const;

export const finalizeVenueSetup = internalMutation({
  args: {
    attemptId: v.id("venueSetupAttempts"),
    ownerAddress: v.string(),
    accountId: v.string(),
    delegatePublicKey: v.optional(v.string()),
    collateralJson: v.string(),
    readinessJson: v.string(),
    limitsJson: v.string(),
    authorityMode: authority,
    permissionExpiresAt: v.optional(v.number()),
    transactionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Venue setup attempt not found.");
    if (attempt.authorityMode !== args.authorityMode) throw new Error("Authority mode changed during verification.");
    const now = Date.now();
    const existing = await ctx.db.query("venueAccounts")
      .withIndex("by_strategyAccountId_role", (q) => q.eq("strategyAccountId", attempt.strategyAccountId).eq("role", ROLE[attempt.venue])).first();
    const account = {
      strategyAccountId: attempt.strategyAccountId,
      role: ROLE[attempt.venue],
      venue: attempt.venue,
      chainRef: "eip155:42161",
      accountRef: `${attempt.venue}:${args.accountId}`,
      walletAddress: args.ownerAddress.toLowerCase(),
      ownerAddress: args.ownerAddress.toLowerCase(),
      accountId: args.accountId,
      delegatePublicKey: args.delegatePublicKey,
      collateralJson: args.collateralJson,
      readinessJson: args.readinessJson,
      legacy: false,
      status: "ready" as const,
      lastSyncedAt: now,
      lastSyncStatus: "fresh" as const,
      lastSyncError: undefined,
      updatedAt: now,
    };
    let venueAccountId = existing?._id;
    if (existing) await ctx.db.patch(existing._id, account);
    else venueAccountId = await ctx.db.insert("venueAccounts", { ...account, createdAt: now });

    const currentPermission = await ctx.db.query("venuePermissions")
      .withIndex("by_strategyAccountId_venue", (q) => q.eq("strategyAccountId", attempt.strategyAccountId).eq("venue", attempt.venue))
      .filter((q) => q.eq(q.field("status"), "active")).first();
    if (currentPermission) await ctx.db.patch(currentPermission._id, { status: "revoked", updatedAt: now });
    await ctx.db.insert("venuePermissions", {
      strategyAccountId: attempt.strategyAccountId,
      venue: attempt.venue,
      ownerAddress: args.ownerAddress.toLowerCase(),
      delegatePublicKey: args.delegatePublicKey,
      authorityMode: args.authorityMode,
      chainId: 42161,
      limitsJson: args.limitsJson,
      status: "active",
      expiresAt: args.permissionExpiresAt,
      transactionId: args.transactionId,
      createdAt: now,
      updatedAt: now,
    });
    const integration = await ctx.db.query("venueIntegrations")
      .withIndex("by_strategyAccountId_venue", (q) => q.eq("strategyAccountId", attempt.strategyAccountId).eq("venue", attempt.venue)).first();
    if (!integration) throw new Error("Venue integration not found.");
    await ctx.db.patch(integration._id, { enabled: true, routingEnabled: true, status: "ready", updatedAt: now });
    await ctx.db.patch(attempt._id, { state: "ready", step: "complete", completedAt: now, updatedAt: now });
    await ctx.db.insert("auditEvents", {
      strategyAccountId: attempt.strategyAccountId,
      actor: "execution_gateway",
      kind: "venue.setup_verified",
      summary: `${attempt.venue} mainnet authority and collateral verified`,
      detail: JSON.stringify({ venueAccountId, authorityMode: args.authorityMode, chainId: 42161 }),
      refTable: "venueSetupAttempts",
      refId: String(attempt._id),
      createdAt: now,
    });
    return { venueAccountId, ready: true };
  },
});

export const failVenueSetup = internalMutation({
  args: { attemptId: v.id("venueSetupAttempts"), error: v.string() },
  handler: async (ctx, args) => {
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) return null;
    await ctx.db.patch(attempt._id, { state: "failed", error: args.error.slice(0, 500), updatedAt: Date.now() });
    return attempt._id;
  },
});

export const completeOptimismMigration = internalMutation({
  args: { migrationId: v.id("optimismMigrations"), reconciliationJson: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.migrationId);
    if (!row || row.status !== "reconciling") throw new Error("Migration is not reconciling.");
    const legacy = await ctx.db.get(row.legacyVenueAccountId);
    const now = Date.now();
    if (legacy) await ctx.db.patch(legacy._id, {
      status: "paused", legacy: true, readinessJson: args.reconciliationJson, updatedAt: now,
    });
    await ctx.db.patch(row._id, { status: "complete", completedAt: now, updatedAt: now });
    return row._id;
  },
});
