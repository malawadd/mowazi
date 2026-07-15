import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { parseAutomationPolicy } from "./helpers/agentPolicy";

export const claimNextAnalysisJob = internalMutation({
  args: { holderId: v.string(), leaseMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const leaseMs = Math.min(Math.max(args.leaseMs ?? 60_000, 10_000), 300_000);
    const queued = await ctx.db.query("analysisJobs").withIndex("by_status", (q) => q.eq("status", "queued")).order("asc").take(25);
    let job = queued[0] ?? null;
    if (!job) {
      const claimed = await ctx.db.query("analysisJobs").withIndex("by_status", (q) => q.eq("status", "claimed")).take(50);
      const expired = claimed.find((row) => (row.leaseExpiresAt ?? 0) <= now);
      if (expired) job = expired;
    }
    if (!job) return null;
    await ctx.db.patch(job._id, {
      status: "claimed", holderId: args.holderId, leaseExpiresAt: now + leaseMs,
      attempt: job.attempt + 1, startedAt: job.startedAt ?? now, updatedAt: now, error: undefined,
    });
    return await ctx.db.get(job._id);
  },
});

export const heartbeatAnalysisJob = internalMutation({
  args: { jobId: v.id("analysisJobs"), holderId: v.string(), leaseMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.holderId !== args.holderId || !["claimed", "running"].includes(job.status)) return { heartbeated: false };
    const now = Date.now();
    await ctx.db.patch(job._id, { status: "running", leaseExpiresAt: now + (args.leaseMs ?? 60_000), updatedAt: now });
    return { heartbeated: true };
  },
});

export const completeAnalysisJob = internalMutation({
  args: {
    jobId: v.id("analysisJobs"), holderId: v.string(), analysisId: v.string(),
    status: v.union(v.literal("fresh"), v.literal("degraded"), v.literal("failed")),
    payloadJson: v.string(), providersJson: v.string(), sourceFreshnessMs: v.number(), validUntil: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.holderId !== args.holderId || !["claimed", "running"].includes(job.status)) throw new Error("Analysis job lease is not owned by this worker.");
    JSON.parse(args.payloadJson); JSON.parse(args.providersJson);
    const now = Date.now();
    const snapshotId = await ctx.db.insert("analysisSnapshots", {
      strategyAccountId: job.strategyAccountId, scope: job.scope, marketId: job.marketId,
      analysisId: args.analysisId, tier: job.tier, status: args.status, payloadJson: args.payloadJson,
      providersJson: args.providersJson, sourceFreshnessMs: Math.max(0, args.sourceFreshnessMs),
      validUntil: Math.max(now, args.validUntil), createdAt: now,
    });
    await ctx.db.patch(job._id, {
      status: args.status === "failed" ? "failed" : "completed", completedAt: now, updatedAt: now,
      leaseExpiresAt: now, error: args.status === "failed" ? "Analysis completed without a valid synthesis." : undefined,
    });
    return { snapshotId, jobId: job._id };
  },
});

export const failAnalysisJob = internalMutation({
  args: { jobId: v.id("analysisJobs"), holderId: v.string(), error: v.string(), retryable: v.boolean() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.holderId !== args.holderId) return { failed: false };
    const now = Date.now();
    const retry = args.retryable && job.attempt < 3;
    await ctx.db.patch(job._id, {
      status: retry ? "queued" : "failed", holderId: undefined, leaseExpiresAt: undefined,
      error: args.error.slice(0, 2_000), completedAt: retry ? undefined : now, updatedAt: now,
    });
    return { failed: true, retrying: retry };
  },
});

export const recordPolicyDraft = internalMutation({
  args: { jobId: v.id("analysisJobs"), policyJson: v.string(), diffJson: v.string() },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job?.strategyAccountId || !job.userId || job.trigger !== "policy_draft") throw new Error("Policy job not found.");
    const policy = parseAutomationPolicy(args.policyJson);
    JSON.parse(args.diffJson);
    const latest = await ctx.db.query("automationPolicies")
      .withIndex("by_strategyAccountId", (q) => q.eq("strategyAccountId", job.strategyAccountId!)).order("desc").first();
    const source = JSON.parse(job.payloadJson ?? "{}") as { sourceText?: string };
    const now = Date.now();
    const policyId = await ctx.db.insert("automationPolicies", {
      strategyAccountId: job.strategyAccountId, userId: job.userId, version: (latest?.version ?? 0) + 1,
      status: "draft", sourceText: source.sourceText, policyJson: JSON.stringify(policy), diffJson: args.diffJson,
      createdAt: now, updatedAt: now,
    });
    await ctx.db.patch(job._id, { status: "completed", completedAt: now, updatedAt: now, leaseExpiresAt: now });
    return { policyId };
  },
});

export const recordTradeProposal = internalMutation({
  args: {
    strategyAccountId: v.id("strategyAccounts"), analysisId: v.string(), policyVersion: v.number(),
    marketId: v.string(), side: v.union(v.literal("long"), v.literal("short")), payloadJson: v.string(),
    confidence: v.number(), consensus: v.number(), idempotencyKey: v.string(), expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    JSON.parse(args.payloadJson);
    const duplicate = await ctx.db.query("tradeProposals").withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", args.idempotencyKey)).first();
    if (duplicate) return { proposalId: duplicate._id, status: duplicate.status, duplicate: true };
    const strategy = await ctx.db.get(args.strategyAccountId);
    if (!strategy) throw new Error("Strategy account not found.");
    const profile = await ctx.db.query("agentProfiles")
      .withIndex("by_strategyAccountId", (q) => q.eq("strategyAccountId", args.strategyAccountId)).first();
    if (!profile) throw new Error("Agent profile not configured.");
    let status: "insight" | "pending_approval" | "approved" | "blocked" =
      profile.authorityMode === "insights" ? "insight" : profile.authorityMode === "approval_required" ? "pending_approval" : "approved";
    if (profile.paused || strategy.emergencyStop || strategy.status !== "active") status = "blocked";
    const now = Date.now();
    const proposalId = await ctx.db.insert("tradeProposals", {
      ...args, userId: profile.userId, status, confidence: Math.max(0, Math.min(1, args.confidence)),
      consensus: Math.max(0, Math.min(1, args.consensus)), createdAt: now, updatedAt: now,
    });
    if (status === "pending_approval") {
      await ctx.db.insert("approvalRequests", {
        proposalId, strategyAccountId: args.strategyAccountId, userId: profile.userId, status: "pending",
        expiresAt: args.expiresAt, createdAt: now, updatedAt: now,
      });
    }
    return { proposalId, status, duplicate: false };
  },
});

export const transitionTradeProposal = internalMutation({
  args: {
    proposalId: v.id("tradeProposals"),
    status: v.union(v.literal("executing"), v.literal("executed"), v.literal("failed"), v.literal("expired"), v.literal("blocked")),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Trade proposal not found.");
    const now = Date.now();
    await ctx.db.patch(proposal._id, { status: args.status, updatedAt: now, decidedAt: proposal.decidedAt ?? now });
    return { proposalId: proposal._id, status: args.status };
  },
});

export const getAnalysisJob = internalQuery({
  args: { jobId: v.id("analysisJobs") },
  handler: async (ctx, args) => await ctx.db.get(args.jobId),
});

export const listActivePublicDemand = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db.query("publicMarketDemand").collect();
    return rows.filter((row) => row.expiresAt > now);
  },
});
