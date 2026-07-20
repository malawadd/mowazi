import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const ACTIVE = ["queued", "claimed", "running"] as const;

export const authorizeProfileSync = internalQuery({
  args: { subject: v.string(), profileId: v.id("agentProfiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Agent profile not found.");
    const user = await ctx.db.query("users").withIndex("by_authSubject", (q: any) =>
      q.eq("authSubject", args.subject)).first();
    if (!user || profile.userId !== user._id) throw new Error("Agent profile not found.");
    const subscriptions = await ctx.db.query("agentMarketSubscriptions")
      .withIndex("by_profileId", (q: any) => q.eq("profileId", profile._id)).collect();
    return { profile, markets: subscriptions.filter((row) => row.enabled).map((row) => row.marketId) };
  },
});

export const getScheduleProfile = internalQuery({
  args: { profileId: v.id("agentProfiles") },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) return null;
    const [strategy, credit, policy, subscriptions] = await Promise.all([
      ctx.db.get(profile.strategyAccountId),
      ctx.db.query("creditAccounts").withIndex("by_userId", (q: any) =>
        q.eq("userId", profile.userId)).first(),
      ctx.db.query("automationPolicies").withIndex("by_strategyAccountId_status", (q: any) =>
        q.eq("strategyAccountId", profile.strategyAccountId).eq("status", "active")).first(),
      ctx.db.query("agentMarketSubscriptions").withIndex("by_profileId", (q: any) =>
        q.eq("profileId", profile._id)).collect(),
    ]);
    return {
      profile,
      strategy,
      availableCredits: credit ? credit.balance - credit.reserved : 0,
      policyVersion: policy?.version ?? null,
      markets: subscriptions.filter((row) => row.enabled).map((row) => row.marketId),
    };
  },
});

export const getAgentExecutionContext = internalQuery({
  args: { strategyAccountId: v.id("strategyAccounts") },
  handler: async (ctx, args) => {
    const [profile, policy, strategy] = await Promise.all([
      ctx.db.query("agentProfiles").withIndex("by_strategyAccountId", (q: any) =>
        q.eq("strategyAccountId", args.strategyAccountId)).first(),
      ctx.db.query("automationPolicies").withIndex("by_strategyAccountId_status", (q: any) =>
        q.eq("strategyAccountId", args.strategyAccountId).eq("status", "active")).first(),
      ctx.db.get(args.strategyAccountId),
    ]);
    if (!profile || !policy || !strategy) return null;
    return {
      profile: {
        ...profile,
        authorityMode: profile.authorityMode === "insights" ? "shadow" : profile.authorityMode,
      },
      policy: { ...policy, policy: JSON.parse(policy.policyJson) },
      strategy,
    };
  },
});

export const getTradeProposalExecutionContext = internalQuery({
  args: { proposalId: v.id("tradeProposals") },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) return null;
    const [profile, policy, strategy, credit] = await Promise.all([
      ctx.db.query("agentProfiles").withIndex("by_strategyAccountId", (q: any) =>
        q.eq("strategyAccountId", proposal.strategyAccountId)).first(),
      ctx.db.query("automationPolicies").withIndex("by_strategyAccountId_status", (q: any) =>
        q.eq("strategyAccountId", proposal.strategyAccountId).eq("status", "active")).first(),
      ctx.db.get(proposal.strategyAccountId),
      ctx.db.query("creditAccounts").withIndex("by_userId", (q: any) =>
        q.eq("userId", proposal.userId)).first(),
    ]);
    if (!profile || !policy || !strategy) return null;
    return {
      proposal: { ...proposal, payload: JSON.parse(proposal.payloadJson) },
      profile: {
        ...profile,
        authorityMode: profile.authorityMode === "insights" ? "shadow" : profile.authorityMode,
      },
      policy: { ...policy, policy: JSON.parse(policy.policyJson) },
      strategy,
      availableCredits: credit ? credit.balance - credit.reserved : 0,
    };
  },
});

export const authorizeProposalExecution = internalQuery({
  args: { subject: v.string(), proposalId: v.id("tradeProposals") },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Proposal not found.");
    const user = await ctx.db.query("users").withIndex("by_authSubject", (q: any) =>
      q.eq("authSubject", args.subject)).first();
    if (!user || proposal.userId !== user._id) throw new Error("Proposal not found.");
    return { proposalId: proposal._id, status: proposal.status };
  },
});

export const enqueueScheduledAnalysis = internalMutation({
  args: {
    profileId: v.id("agentProfiles"),
    marketId: v.string(),
    scheduleRevision: v.number(),
    trigger: v.string(),
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.scheduleRevision !== args.scheduleRevision) {
      return { created: false, reason: "stale_schedule", job: null };
    }
    if (profile.paused || profile.lifecycleStatus !== "active") {
      return { created: false, reason: "profile_paused", job: null };
    }
    const strategy = await ctx.db.get(profile.strategyAccountId);
    if (!strategy || strategy.status !== "active" || strategy.emergencyStop) {
      return { created: false, reason: "strategy_blocked", job: null };
    }
    if (!profile.watchMarkets.includes(args.marketId)) {
      return { created: false, reason: "market_not_watched", job: null };
    }
    for (const status of ACTIVE) {
      const existing = await ctx.db.query("analysisJobs")
        .withIndex("by_strategyAccountId_marketId_status", (q: any) =>
          q.eq("strategyAccountId", profile.strategyAccountId)
            .eq("marketId", args.marketId).eq("status", status),
        ).first();
      if (existing) return { created: false, reason: "active_job", job: existing };
    }
    const now = Date.now();
    const bucket = Math.floor(now / 30_000);
    const id = await ctx.db.insert("analysisJobs", {
      strategyAccountId: profile.strategyAccountId,
      userId: profile.userId,
      scope: "private",
      marketId: args.marketId,
      tier: profile.tier,
      trigger: args.trigger,
      status: "queued",
      dedupeKey: `schedule:${profile._id}:${args.marketId}:${bucket}`,
      reservedCredits: 0,
      attempt: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { created: true, reason: "created", job: await ctx.db.get(id) };
  },
});
