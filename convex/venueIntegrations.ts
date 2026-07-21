import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { managedTradingVenue } from "./agentValidators";
import { getViewerUser, requireViewerUser } from "./tradeHelpers";

const VENUES = ["hyperliquid", "lighter", "orderly", "gmx", "ostium", "uniswap"] as const;

export const getVenueIntegrations = query({
  args: {},
  handler: async (ctx) => {
    const { identity, user } = await getViewerUser(ctx);
    if (!identity || !user) return { signedIn: Boolean(identity), strategyAccountId: null, integrations: [] };
    const strategy = await ctx.db.query("strategyAccounts").withIndex("by_userId", (q) => q.eq("userId", user._id)).first();
    if (!strategy) return { signedIn: true, strategyAccountId: null, integrations: defaults([]) };
    const [configured, venueAccounts] = await Promise.all([
      ctx.db.query("venueIntegrations").withIndex("by_strategyAccountId", (q) => q.eq("strategyAccountId", strategy._id)).collect(),
      ctx.db.query("venueAccounts").withIndex("by_strategyAccountId", (q) => q.eq("strategyAccountId", strategy._id)).collect(),
    ]);
    return { signedIn: true, strategyAccountId: strategy._id, integrations: defaults(configured, venueAccounts) };
  },
});

export const setVenueEnabled = mutation({
  args: { venue: managedTradingVenue, enabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireViewerUser(ctx);
    const strategy = await ctx.db.query("strategyAccounts").withIndex("by_userId", (q) => q.eq("userId", user._id)).first();
    if (!strategy) throw new Error("Create a strategy account before enabling venues.");
    const existing = await ctx.db.query("venueIntegrations")
      .withIndex("by_strategyAccountId_venue", (q) => q.eq("strategyAccountId", strategy._id).eq("venue", args.venue)).first();
    const now = Date.now();
    const status = args.enabled ? "authorization_required" as const : "disabled" as const;
    if (existing) {
      await ctx.db.patch(existing._id, { enabled: args.enabled, status, updatedAt: now });
      return existing._id;
    }
    return await ctx.db.insert("venueIntegrations", {
      strategyAccountId: strategy._id, venue: args.venue, enabled: args.enabled,
      status, createdAt: now, updatedAt: now,
    });
  },
});

function defaults(configured: Doc<"venueIntegrations">[], accounts: Doc<"venueAccounts">[] = []) {
  return VENUES.map((venue) => {
    const integration = configured.find((item) => item.venue === venue);
    const account = accounts.find((item) => item.venue === venue && item.status === "ready");
    const enabled = integration?.enabled ?? Boolean(account);
    return {
      venue, enabled,
      status: account ? "ready" : (integration?.status ?? "disabled"),
      ready: Boolean(account),
      lastHealthAt: integration?.lastHealthAt ?? account?.lastSyncedAt ?? null,
      lastHealthMessage: integration?.lastHealthMessage ?? null,
    };
  });
}
