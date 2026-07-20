import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireViewerStrategy } from "./model";

async function accountForUser(ctx: any, userId: any) {
  return await ctx.db.query("creditAccounts").withIndex("by_userId", (q: any) => q.eq("userId", userId)).first();
}

async function ledger(ctx: any, account: any, args: {
  kind: "grant" | "reserve" | "release" | "settle";
  amount: number;
  reference: string;
  rateCardVersion?: number;
  metadataJson?: string;
}) {
  return await ctx.db.insert("creditLedger", {
    creditAccountId: account._id,
    userId: account.userId,
    kind: args.kind,
    amount: args.amount,
    balanceAfter: account.balance,
    reservedAfter: account.reserved,
    rateCardVersion: args.rateCardVersion ?? 1,
    reference: args.reference,
    metadataJson: args.metadataJson,
    createdAt: Date.now(),
  });
}

export const grantCredits = internalMutation({
  args: { userId: v.id("users"), amount: v.number(), reference: v.string(), rateCardVersion: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.amount) || args.amount <= 0) throw new Error("Credit grant must be a positive integer.");
    const now = Date.now();
    let account = await accountForUser(ctx, args.userId);
    if (!account) {
      const id = await ctx.db.insert("creditAccounts", { userId: args.userId, balance: args.amount, reserved: 0, version: 1, createdAt: now, updatedAt: now });
      account = await ctx.db.get(id);
    } else {
      await ctx.db.patch(account._id, { balance: account.balance + args.amount, version: account.version + 1, updatedAt: now });
      account = await ctx.db.get(account._id);
    }
    if (!account) throw new Error("Credit account could not be created.");
    await ledger(ctx, account, { ...args, kind: "grant" });
    return { accountId: account._id, balance: account.balance };
  },
});

export const reserveCredits = internalMutation({
  args: { userId: v.id("users"), jobId: v.id("analysisJobs"), amount: v.number(), expiresAt: v.number(), rateCardVersion: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.amount) || args.amount <= 0) throw new Error("Reservation must be a positive integer.");
    const existing = await ctx.db.query("creditReservations").withIndex("by_jobId", (q: any) => q.eq("jobId", args.jobId)).first();
    if (existing) return { reservationId: existing._id, reserved: existing.amount, duplicate: true };
    let account = await accountForUser(ctx, args.userId);
    if (!account || account.balance - account.reserved < args.amount) return { reservationId: null, reserved: 0, insufficient: true };
    const now = Date.now();
    await ctx.db.patch(account._id, { reserved: account.reserved + args.amount, version: account.version + 1, updatedAt: now });
    const reservationId = await ctx.db.insert("creditReservations", {
      creditAccountId: account._id, userId: args.userId, jobId: args.jobId, amount: args.amount,
      status: "active", expiresAt: args.expiresAt, createdAt: now, updatedAt: now,
    });
    await ctx.db.patch(args.jobId, { reservedCredits: args.amount, updatedAt: now });
    account = await ctx.db.get(account._id);
    if (!account) throw new Error("Credit account disappeared during reservation.");
    await ledger(ctx, account, { kind: "reserve", amount: args.amount, reference: String(args.jobId), rateCardVersion: args.rateCardVersion });
    return { reservationId, reserved: args.amount, insufficient: false };
  },
});

export const settleCredits = internalMutation({
  args: { jobId: v.id("analysisJobs"), billableAmount: v.number(), rateCardVersion: v.number(), metadataJson: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.query("creditReservations").withIndex("by_jobId", (q: any) => q.eq("jobId", args.jobId)).first();
    if (!reservation || reservation.status !== "active") return { settled: false };
    const billable = Math.max(0, Math.min(reservation.amount, Math.floor(args.billableAmount)));
    let account = await ctx.db.get(reservation.creditAccountId);
    if (!account) throw new Error("Credit account not found.");
    const now = Date.now();
    await ctx.db.patch(account._id, {
      balance: Math.max(0, account.balance - billable), reserved: Math.max(0, account.reserved - reservation.amount),
      version: account.version + 1, updatedAt: now,
    });
    await ctx.db.patch(reservation._id, { status: "settled", updatedAt: now });
    account = await ctx.db.get(account._id);
    if (!account) throw new Error("Credit account disappeared during settlement.");
    await ledger(ctx, account, { kind: "settle", amount: billable, reference: String(args.jobId), rateCardVersion: args.rateCardVersion, metadataJson: args.metadataJson });
    const released = reservation.amount - billable;
    if (released > 0) await ledger(ctx, account, { kind: "release", amount: released, reference: String(args.jobId), rateCardVersion: args.rateCardVersion });
    return { settled: true, billable, released, balance: account.balance };
  },
});

export const releaseCredits = internalMutation({
  args: { jobId: v.id("analysisJobs"), reason: v.string(), rateCardVersion: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.query("creditReservations").withIndex("by_jobId", (q: any) => q.eq("jobId", args.jobId)).first();
    if (!reservation || reservation.status !== "active") return { released: false };
    let account = await ctx.db.get(reservation.creditAccountId);
    if (!account) throw new Error("Credit account not found.");
    const now = Date.now();
    await ctx.db.patch(account._id, { reserved: Math.max(0, account.reserved - reservation.amount), version: account.version + 1, updatedAt: now });
    await ctx.db.patch(reservation._id, { status: "released", updatedAt: now });
    account = await ctx.db.get(account._id);
    if (!account) throw new Error("Credit account disappeared during release.");
    await ledger(ctx, account, { kind: "release", amount: reservation.amount, reference: String(args.jobId), rateCardVersion: args.rateCardVersion, metadataJson: JSON.stringify({ reason: args.reason }) });
    return { released: true, amount: reservation.amount };
  },
});

export const claimStarterCredits = mutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.AGENT_DEV_CONTROLS_ENABLED !== "true") {
      throw new Error("Development starter credits are disabled.");
    }
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication is required.");
    const state = await requireViewerStrategy(ctx, identity.subject);
    if (!state.user) throw new Error("User account not found.");
    const existing = await ctx.db.query("creditClaims")
      .withIndex("by_userId_kind", (q: any) =>
        q.eq("userId", state.user._id).eq("kind", "development_starter")).first();
    if (existing) return { claimed: false, amount: existing.amount };
    const configured = Number(process.env.DEV_STARTER_CREDITS ?? 100);
    const amount = Number.isInteger(configured) && configured > 0 ? Math.min(configured, 100_000) : 100;
    const now = Date.now();
    let account = await accountForUser(ctx, state.user._id);
    if (!account) {
      const id = await ctx.db.insert("creditAccounts", {
        userId: state.user._id, balance: amount, reserved: 0, version: 1,
        createdAt: now, updatedAt: now,
      });
      account = await ctx.db.get(id);
    } else {
      await ctx.db.patch(account._id, {
        balance: account.balance + amount,
        version: account.version + 1,
        updatedAt: now,
      });
      account = await ctx.db.get(account._id);
    }
    if (!account) throw new Error("Credit account could not be created.");
    const reference = `development-starter:${state.user._id}`;
    await ctx.db.insert("creditClaims", {
      userId: state.user._id, kind: "development_starter", amount, reference, createdAt: now,
    });
    await ledger(ctx, account, { kind: "grant", amount, reference, rateCardVersion: 1 });
    return { claimed: true, amount, balance: account.balance };
  },
});
