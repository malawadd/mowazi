import { mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  analysisCadence,
  authorityMode,
  intelligenceTier,
} from "./agentValidators";
import { parseAutomationPolicy, validateProfileInput } from "./helpers/agentPolicy";
import { requireViewerStrategy } from "./model";

const ACTIVE_JOBS = new Set(["queued", "claimed", "running"]);

async function requireViewer(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Authentication is required.");
  const state = await requireViewerStrategy(ctx, identity.subject);
  if (!state.user || !state.strategyAccount) throw new Error("Strategy account is required.");
  return state as { user: any; strategyAccount: any };
}

function marketId(value: string) {
  const next = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_./:-]{0,63}$/.test(next)) throw new Error("Invalid market identifier.");
  return next;
}

const CADENCE_MS = { on_demand: 0, "15m": 900_000, "5m": 300_000, "2m": 120_000, "1m": 60_000 } as const;
const PRICING_VERSION = "deepseek-v4-2026-04-24";
const ESTIMATED_COST_MICROUSD = { focus: 5_843, pro: 16_044, max: 31_257 } as const;

function requireCostConfirmation(tier: keyof typeof ESTIMATED_COST_MICROUSD, confirmed: boolean, version: string, cost: number) {
  if (!confirmed || version !== PRICING_VERSION || cost !== ESTIMATED_COST_MICROUSD[tier]) {
    throw new Error("Confirm the current tier and cost estimate before starting analysis.");
  }
}

async function activeJobForMarket(ctx: any, scope: "public" | "private", market: string, strategyAccountId?: string) {
  const rows = await ctx.db.query("analysisJobs")
    .withIndex("by_scope_marketId", (q: any) => q.eq("scope", scope).eq("marketId", market)).collect();
  return rows.find((job: any) =>
    ACTIVE_JOBS.has(job.status) && (scope === "public" || job.strategyAccountId === strategyAccountId)) ?? null;
}

export const setAgentProfile = mutation({
  args: {
    tier: intelligenceTier,
    authorityMode,
    cadence: analysisCadence,
    watchMarkets: v.array(v.string()),
    eventTriggers: v.array(v.string()),
    dailyCreditLimit: v.number(),
  },
  handler: async (ctx, args) => {
    const { user, strategyAccount } = await requireViewer(ctx);
    validateProfileInput(args);
    const current = await ctx.db.query("agentProfiles")
      .withIndex("by_strategyAccountId", (q: any) => q.eq("strategyAccountId", strategyAccount._id)).first();
    const now = Date.now();
    const values = {
      ...args,
      watchMarkets: [...new Set(args.watchMarkets.map(marketId))],
      eventTriggers: [...new Set(args.eventTriggers.map((item) => item.trim()).filter(Boolean))],
      userId: user._id,
      strategyAccountId: strategyAccount._id,
      version: (current?.version ?? 0) + 1,
      paused: current?.paused ?? false,
      nextRunAt: args.cadence === "on_demand" ? undefined : now + CADENCE_MS[args.cadence],
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    };
    const profileId = current ? (await ctx.db.patch(current._id, values), current._id) : await ctx.db.insert("agentProfiles", values);
    await ctx.db.insert("auditEvents", {
      strategyAccountId: strategyAccount._id, userId: user._id, actor: "viewer",
      kind: "agent.profile.updated", summary: "Agent profile updated",
      detail: JSON.stringify({ tier: args.tier, authorityMode: args.authorityMode, cadence: args.cadence }),
      refTable: "agentProfiles", refId: String(profileId), createdAt: now,
    });
    return await ctx.db.get(profileId);
  },
});

export const requestAnalysis = mutation({
  args: {
    marketId: v.string(), confirmed: v.boolean(),
    pricingVersion: v.string(), estimatedCostMicrousd: v.number(),
  },
  handler: async (ctx, args) => {
    const { user, strategyAccount } = await requireViewer(ctx);
    const market = marketId(args.marketId);
    const profile = await ctx.db.query("agentProfiles")
      .withIndex("by_strategyAccountId", (q: any) => q.eq("strategyAccountId", strategyAccount._id)).first();
    const tier = profile?.tier ?? "focus";
    requireCostConfirmation(tier, args.confirmed, args.pricingVersion, args.estimatedCostMicrousd);
    const bucket = Math.floor(Date.now() / 30_000);
    const dedupeKey = `private:${strategyAccount._id}:${market}:${bucket}`;
    const active = await activeJobForMarket(ctx, "private", market, String(strategyAccount._id));
    if (active) return { jobId: active._id, deduplicated: true };
    const now = Date.now();
    const jobId = await ctx.db.insert("analysisJobs", {
      strategyAccountId: strategyAccount._id, userId: user._id, scope: "private", marketId: market,
      tier, trigger: "manual_private", status: "queued", dedupeKey,
      payloadJson: JSON.stringify({
        pricingVersion: args.pricingVersion, estimatedCostMicrousd: args.estimatedCostMicrousd,
      }), reservedCredits: 0, attempt: 0, createdAt: now, updatedAt: now,
    });
    return { jobId, deduplicated: false };
  },
});

export const touchPublicMarketDemand = mutation({
  args: { marketId: v.string(), sessionHash: v.string() },
  handler: async (ctx, args) => {
    const market = marketId(args.marketId);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(args.sessionHash)) throw new Error("Invalid demand session.");
    const now = Date.now();
    const existing = await ctx.db.query("publicMarketDemand")
      .withIndex("by_marketId_sessionHash", (q: any) => q.eq("marketId", market).eq("sessionHash", args.sessionHash)).first();
    const demand = { marketId: market, sessionHash: args.sessionHash, lastSeenAt: now, expiresAt: now + 90_000 };
    if (existing) await ctx.db.patch(existing._id, demand); else await ctx.db.insert("publicMarketDemand", demand);

    const latest = await ctx.db.query("analysisSnapshots")
      .withIndex("by_scope_marketId", (q: any) => q.eq("scope", "public").eq("marketId", market)).order("desc").first();
    return {
      activeUntil: now + 90_000, analysisId: latest?.analysisId ?? null,
      manualAnalysisRequired: true,
    };
  },
});

export const requestPublicAnalysis = mutation({
  args: {
    marketId: v.string(), sessionHash: v.string(), tier: intelligenceTier,
    confirmed: v.boolean(), pricingVersion: v.string(), estimatedCostMicrousd: v.number(),
  },
  handler: async (ctx, args) => {
    requireCostConfirmation(args.tier, args.confirmed, args.pricingVersion, args.estimatedCostMicrousd);
    const market = marketId(args.marketId);
    const now = Date.now();
    const active = await activeJobForMarket(ctx, "public", market);
    if (active) return { jobId: active._id, deduplicated: true, reason: "active" };
    const latest = await ctx.db.query("analysisSnapshots")
      .withIndex("by_scope_marketId", (q: any) => q.eq("scope", "public").eq("marketId", market))
      .order("desc").first();
    if (latest?.validUntil && latest.validUntil > now) {
      return { jobId: null, deduplicated: true, reason: "fresh" };
    }
    const jobId = await ctx.db.insert("analysisJobs", {
      scope: "public", marketId: market, tier: args.tier, trigger: "manual_public",
      status: "queued", dedupeKey: `manual:${market}:${Math.floor(now / 30_000)}`,
      payloadJson: JSON.stringify({
        pricingVersion: args.pricingVersion, estimatedCostMicrousd: args.estimatedCostMicrousd,
      }), reservedCredits: 0, attempt: 0, createdAt: now, updatedAt: now,
    });
    return { jobId, deduplicated: false, reason: "created" };
  },
});

export const requestPolicyDraft = mutation({
  args: { sourceText: v.string() },
  handler: async (ctx, args) => {
    const { user, strategyAccount } = await requireViewer(ctx);
    const sourceText = args.sourceText.trim();
    if (sourceText.length < 10 || sourceText.length > 4_000) throw new Error("Policy request must be 10-4000 characters.");
    const now = Date.now();
    const jobId = await ctx.db.insert("analysisJobs", {
      strategyAccountId: strategyAccount._id, userId: user._id, scope: "private", marketId: "__POLICY__",
      tier: "focus", trigger: "policy_draft", status: "queued", dedupeKey: `policy:${strategyAccount._id}:${now}`,
      payloadJson: JSON.stringify({ sourceText }), reservedCredits: 0, attempt: 0, createdAt: now, updatedAt: now,
    });
    return { jobId };
  },
});

export const activateAutomationPolicy = mutation({
  args: { policyId: v.id("automationPolicies") },
  handler: async (ctx, args) => {
    const { user, strategyAccount } = await requireViewer(ctx);
    const policy = await ctx.db.get(args.policyId);
    if (!policy || policy.strategyAccountId !== strategyAccount._id || policy.userId !== user._id) throw new Error("Policy not found.");
    parseAutomationPolicy(policy.policyJson);
    const active = await ctx.db.query("automationPolicies")
      .withIndex("by_strategyAccountId_status", (q: any) => q.eq("strategyAccountId", strategyAccount._id).eq("status", "active")).collect();
    const now = Date.now();
    for (const row of active) await ctx.db.patch(row._id, { status: "superseded", updatedAt: now });
    await ctx.db.patch(policy._id, { status: "active", activatedAt: now, updatedAt: now });
    return { policyId: policy._id, status: "active" as const };
  },
});

export const decideTradeProposal = mutation({
  args: { proposalId: v.id("tradeProposals"), decision: v.union(v.literal("approved"), v.literal("rejected")) },
  handler: async (ctx, args) => {
    const { user, strategyAccount } = await requireViewer(ctx);
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal || proposal.strategyAccountId !== strategyAccount._id || proposal.userId !== user._id) throw new Error("Proposal not found.");
    if (proposal.status !== "pending_approval" || proposal.expiresAt <= Date.now()) throw new Error("Proposal is not awaiting approval.");
    const now = Date.now();
    await ctx.db.patch(proposal._id, { status: args.decision, decidedAt: now, updatedAt: now });
    const approval = await ctx.db.query("approvalRequests").withIndex("by_proposalId", (q: any) => q.eq("proposalId", proposal._id)).first();
    if (approval) await ctx.db.patch(approval._id, { status: args.decision, decidedAt: now, updatedAt: now });
    return { proposalId: proposal._id, status: args.decision };
  },
});

export const pauseAutopilot = mutation({
  args: { paused: v.boolean() },
  handler: async (ctx, args) => {
    const { user, strategyAccount } = await requireViewer(ctx);
    const profile = await ctx.db.query("agentProfiles")
      .withIndex("by_strategyAccountId", (q: any) => q.eq("strategyAccountId", strategyAccount._id)).first();
    if (!profile) throw new Error("Agent profile not configured.");
    const now = Date.now();
    await ctx.db.patch(profile._id, { paused: args.paused, updatedAt: now, version: profile.version + 1 });
    await ctx.db.insert("auditEvents", {
      strategyAccountId: strategyAccount._id, userId: user._id, actor: "viewer", kind: "agent.autopilot.pause_changed",
      summary: args.paused ? "Agent autopilot paused" : "Agent autopilot resumed", refTable: "agentProfiles",
      refId: String(profile._id), createdAt: now,
    });
    return { paused: args.paused };
  },
});
