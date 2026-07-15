import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireViewerStrategy } from "./model";

function parseJson(value: string | undefined, fallback: unknown = null) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function normalizeMarket(value: string) {
  return value.trim().toUpperCase();
}

async function viewer(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  const state = await requireViewerStrategy(ctx, identity.subject);
  return state.user && state.strategyAccount ? state : null;
}

function materialize(snapshot: any) {
  if (!snapshot) return null;
  return {
    analysisId: snapshot.analysisId,
    scope: snapshot.scope,
    marketId: snapshot.marketId,
    tier: snapshot.tier,
    status: snapshot.status,
    sourceFreshnessMs: snapshot.sourceFreshnessMs,
    validUntil: snapshot.validUntil,
    createdAt: snapshot.createdAt,
    providers: parseJson(snapshot.providersJson, []),
    visualization: parseJson(snapshot.payloadJson, {}),
  };
}

export const getPublicMarketAnalysis = query({
  args: { marketId: v.string() },
  handler: async (ctx, args) => {
    const marketId = normalizeMarket(args.marketId);
    const snapshot = await ctx.db.query("analysisSnapshots")
      .withIndex("by_scope_marketId", (q: any) => q.eq("scope", "public").eq("marketId", marketId))
      .order("desc").first();
    const demand = await ctx.db.query("publicMarketDemand")
      .withIndex("by_marketId", (q: any) => q.eq("marketId", marketId)).collect();
    return {
      analysis: materialize(snapshot),
      activeViewers: demand.filter((row: any) => row.expiresAt > Date.now()).length,
      stale: !snapshot || snapshot.validUntil <= Date.now(),
    };
  },
});

export const getAccountMarketAnalysis = query({
  args: { marketId: v.string() },
  handler: async (ctx, args) => {
    const state = await viewer(ctx);
    if (!state) return null;
    const marketId = normalizeMarket(args.marketId);
    const [privateSnapshot, publicSnapshot, profile] = await Promise.all([
      ctx.db.query("analysisSnapshots")
        .withIndex("by_strategyAccountId_marketId", (q: any) =>
          q.eq("strategyAccountId", state.strategyAccount._id).eq("marketId", marketId))
        .order("desc").first(),
      ctx.db.query("analysisSnapshots")
        .withIndex("by_scope_marketId", (q: any) => q.eq("scope", "public").eq("marketId", marketId))
        .order("desc").first(),
      ctx.db.query("agentProfiles")
        .withIndex("by_strategyAccountId", (q: any) => q.eq("strategyAccountId", state.strategyAccount._id)).first(),
    ]);
    const selected = privateSnapshot ?? publicSnapshot;
    return {
      analysis: materialize(selected),
      personalized: Boolean(privateSnapshot),
      profile,
      executionBlocked: Boolean(profile?.paused || state.strategyAccount.emergencyStop),
    };
  },
});

export const getAgentSettings = query({
  args: {},
  handler: async (ctx) => {
    const state = await viewer(ctx);
    if (!state) return null;
    const [profile, activePolicy, drafts, creditAccount, proposals, approvals] = await Promise.all([
      ctx.db.query("agentProfiles")
        .withIndex("by_strategyAccountId", (q: any) => q.eq("strategyAccountId", state.strategyAccount._id)).first(),
      ctx.db.query("automationPolicies")
        .withIndex("by_strategyAccountId_status", (q: any) => q.eq("strategyAccountId", state.strategyAccount._id).eq("status", "active")).first(),
      ctx.db.query("automationPolicies")
        .withIndex("by_strategyAccountId_status", (q: any) => q.eq("strategyAccountId", state.strategyAccount._id).eq("status", "draft"))
        .order("desc").take(5),
      ctx.db.query("creditAccounts").withIndex("by_userId", (q: any) => q.eq("userId", state.user._id)).first(),
      ctx.db.query("tradeProposals").withIndex("by_strategyAccountId", (q: any) => q.eq("strategyAccountId", state.strategyAccount._id))
        .order("desc").take(20),
      ctx.db.query("approvalRequests").withIndex("by_userId_status", (q: any) => q.eq("userId", state.user._id).eq("status", "pending"))
        .order("desc").take(20),
    ]);
    return {
      profile,
      activePolicy: activePolicy ? { ...activePolicy, policy: parseJson(activePolicy.policyJson, {}) } : null,
      drafts: drafts.map((row: any) => ({ ...row, policy: parseJson(row.policyJson, {}), diff: parseJson(row.diffJson, {}) })),
      credits: creditAccount ? { balance: creditAccount.balance, reserved: creditAccount.reserved, available: creditAccount.balance - creditAccount.reserved } : null,
      proposals: proposals.map((row: any) => ({ ...row, payload: parseJson(row.payloadJson, {}) })),
      approvals,
      emergencyStop: state.strategyAccount.emergencyStop,
    };
  },
});
