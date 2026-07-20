import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  analysisCadence,
  analysisJobStatus,
  analysisScope,
  agentLifecycleStatus,
  authorityMode,
  intelligenceTier,
  proposalStatus,
} from "./agentValidators";

export const agentTables = {
  agentProfiles: defineTable({
    strategyAccountId: v.id("strategyAccounts"),
    userId: v.id("users"),
    tier: intelligenceTier,
    authorityMode,
    name: v.optional(v.string()),
    lifecycleStatus: v.optional(agentLifecycleStatus),
    cadence: analysisCadence,
    watchMarkets: v.array(v.string()),
    eventTriggers: v.array(v.string()),
    dailyCreditLimit: v.number(),
    paused: v.boolean(),
    nextRunAt: v.optional(v.number()),
    activatedAt: v.optional(v.number()),
    scheduleRevision: v.optional(v.number()),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_strategyAccountId", ["strategyAccountId"])
    .index("by_userId", ["userId"])
    .index("by_nextRunAt", ["nextRunAt"]),

  agentMarketSubscriptions: defineTable({
    profileId: v.id("agentProfiles"),
    strategyAccountId: v.id("strategyAccounts"),
    userId: v.id("users"),
    marketId: v.string(),
    enabled: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_profileId", ["profileId"])
    .index("by_marketId_enabled", ["marketId", "enabled"])
    .index("by_strategyAccountId_marketId", ["strategyAccountId", "marketId"]),

  automationPolicies: defineTable({
    strategyAccountId: v.id("strategyAccounts"),
    userId: v.id("users"),
    version: v.number(),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("superseded")),
    sourceText: v.optional(v.string()),
    policyJson: v.string(),
    diffJson: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    activatedAt: v.optional(v.number()),
  })
    .index("by_strategyAccountId", ["strategyAccountId"])
    .index("by_strategyAccountId_status", ["strategyAccountId", "status"]),

  analysisJobs: defineTable({
    strategyAccountId: v.optional(v.id("strategyAccounts")),
    userId: v.optional(v.id("users")),
    scope: analysisScope,
    marketId: v.string(),
    tier: intelligenceTier,
    trigger: v.string(),
    status: analysisJobStatus,
    dedupeKey: v.string(),
    payloadJson: v.optional(v.string()),
    reservedCredits: v.number(),
    holderId: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    attempt: v.number(),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_dedupeKey", ["dedupeKey"])
    .index("by_scope_marketId", ["scope", "marketId"])
    .index("by_scope_marketId_status", ["scope", "marketId", "status"])
    .index("by_strategyAccountId_marketId_status", ["strategyAccountId", "marketId", "status"])
    .index("by_strategyAccountId", ["strategyAccountId"]),

  analysisSnapshots: defineTable({
    strategyAccountId: v.optional(v.id("strategyAccounts")),
    scope: analysisScope,
    marketId: v.string(),
    analysisId: v.string(),
    tier: intelligenceTier,
    status: v.union(v.literal("fresh"), v.literal("degraded"), v.literal("failed")),
    payloadJson: v.string(),
    providersJson: v.string(),
    sourceFreshnessMs: v.number(),
    validUntil: v.number(),
    createdAt: v.number(),
  })
    .index("by_scope_marketId", ["scope", "marketId"])
    .index("by_strategyAccountId_marketId", ["strategyAccountId", "marketId"])
    .index("by_strategyAccountId_scope_marketId", ["strategyAccountId", "scope", "marketId"]),

  tradeProposals: defineTable({
    strategyAccountId: v.id("strategyAccounts"),
    userId: v.id("users"),
    analysisId: v.string(),
    policyVersion: v.number(),
    marketId: v.string(),
    side: v.union(v.literal("long"), v.literal("short")),
    status: proposalStatus,
    payloadJson: v.string(),
    confidence: v.number(),
    consensus: v.number(),
    idempotencyKey: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    decidedAt: v.optional(v.number()),
  })
    .index("by_strategyAccountId", ["strategyAccountId"])
    .index("by_strategyAccountId_status", ["strategyAccountId", "status"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  shadowExecutions: defineTable({
    proposalId: v.id("tradeProposals"),
    strategyAccountId: v.id("strategyAccounts"),
    userId: v.id("users"),
    marketId: v.string(),
    side: v.union(v.literal("long"), v.literal("short")),
    status: v.union(v.literal("open"), v.literal("closed"), v.literal("expired")),
    entryPrice: v.number(),
    markPrice: v.number(),
    sizeUsd: v.number(),
    unrealizedPnlUsd: v.number(),
    realizedPnlUsd: v.number(),
    quoteReference: v.string(),
    openedAt: v.number(),
    updatedAt: v.number(),
    closedAt: v.optional(v.number()),
  })
    .index("by_strategyAccountId", ["strategyAccountId"])
    .index("by_strategyAccountId_status", ["strategyAccountId", "status"])
    .index("by_proposalId", ["proposalId"]),

  approvalRequests: defineTable({
    proposalId: v.id("tradeProposals"),
    strategyAccountId: v.id("strategyAccounts"),
    userId: v.id("users"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("expired"),
    ),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    decidedAt: v.optional(v.number()),
  })
    .index("by_proposalId", ["proposalId"])
    .index("by_userId_status", ["userId", "status"]),

  creditAccounts: defineTable({
    userId: v.id("users"),
    balance: v.number(),
    reserved: v.number(),
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  creditReservations: defineTable({
    creditAccountId: v.id("creditAccounts"),
    userId: v.id("users"),
    jobId: v.optional(v.id("analysisJobs")),
    amount: v.number(),
    status: v.union(v.literal("active"), v.literal("settled"), v.literal("released")),
    expiresAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_userId_status", ["userId", "status"]),

  creditLedger: defineTable({
    creditAccountId: v.id("creditAccounts"),
    userId: v.id("users"),
    kind: v.union(
      v.literal("grant"),
      v.literal("reserve"),
      v.literal("release"),
      v.literal("settle"),
    ),
    amount: v.number(),
    balanceAfter: v.number(),
    reservedAfter: v.number(),
    rateCardVersion: v.number(),
    reference: v.string(),
    metadataJson: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_reference", ["reference"]),

  creditClaims: defineTable({
    userId: v.id("users"),
    kind: v.literal("development_starter"),
    amount: v.number(),
    reference: v.string(),
    createdAt: v.number(),
  })
    .index("by_userId_kind", ["userId", "kind"])
    .index("by_reference", ["reference"]),

  publicMarketDemand: defineTable({
    marketId: v.string(),
    sessionHash: v.string(),
    lastSeenAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_marketId", ["marketId"])
    .index("by_marketId_sessionHash", ["marketId", "sessionHash"]),
};
