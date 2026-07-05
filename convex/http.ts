import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

function getWorkerSecret() {
  const secret = process.env.WORKER_SHARED_SECRET;
  if (!secret) {
    throw new Error("WORKER_SHARED_SECRET must be configured before using worker HTTP routes.");
  }
  return secret;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

http.route({
  path: "/worker",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const authHeader = request.headers.get("authorization");
      const expected = `Bearer ${getWorkerSecret()}`;
      if (authHeader !== expected) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const body = (await request.json()) as { command?: string; payload?: Record<string, unknown> };
      const payload = body.payload ?? {};

      switch (body.command) {
        case "listRunnableAccounts":
          return jsonResponse(
            await ctx.runQuery(internal.worker.listRunnableAccounts, {
              includeReady: payload.includeReady as boolean | undefined,
            }),
          );
        case "acquireExecutionLease":
          return jsonResponse(
            await ctx.runMutation(internal.worker.acquireExecutionLease, {
              strategyAccountId: payload.strategyAccountId as any,
              holderId: payload.holderId as string,
              ttlMs: payload.ttlMs as number | undefined,
            }),
          );
        case "heartbeatExecutionLease":
          return jsonResponse(
            await ctx.runMutation(internal.worker.heartbeatExecutionLease, {
              strategyAccountId: payload.strategyAccountId as any,
              holderId: payload.holderId as string,
              ttlMs: payload.ttlMs as number | undefined,
            }),
          );
        case "releaseExecutionLease":
          return jsonResponse(
            await ctx.runMutation(internal.worker.releaseExecutionLease, {
              strategyAccountId: payload.strategyAccountId as any,
              holderId: payload.holderId as string,
            }),
          );
        case "recordExecution":
          return jsonResponse(await ctx.runMutation(internal.worker.recordExecution, payload as any));
        case "recordSnapshot":
          return jsonResponse(await ctx.runMutation(internal.worker.recordSnapshot, payload as any));
        case "recordAlert":
          return jsonResponse(await ctx.runMutation(internal.worker.recordAlert, payload as any));
        case "recordIncident":
          return jsonResponse(await ctx.runMutation(internal.mutations.recordIncidentEvent, payload as any));
        case "updateStrategyState":
          return jsonResponse(await ctx.runMutation(internal.mutations.updateStrategyExecutionState, payload as any));
        case "syncVenueState":
          return jsonResponse(await ctx.runMutation(internal.mutations.syncVenueAccountState, payload as any));
        case "markDepositConfirmed":
          return jsonResponse(await ctx.runMutation(internal.worker.markDepositConfirmed, payload as any));
        case "listPendingWithdrawals":
          return jsonResponse(await ctx.runQuery(internal.worker.listPendingWithdrawals, payload as any));
        case "confirmWithdrawalState":
          return jsonResponse(await ctx.runMutation(internal.mutations.transitionWithdrawalState, {
            withdrawalId: payload.withdrawalId as any,
            nextStatus: payload.nextStatus as any,
            txHash: payload.txHash as string | undefined,
            note: payload.note as string | undefined,
            failureCode: payload.failureCode as string | undefined,
          }));
        case "simulateExecution":
          return jsonResponse(await ctx.runAction(internal.actions.simulateExecution, payload as any));
        case "executeUniPoolSwap":
          return jsonResponse(await ctx.runAction(internal.actions.executeUniPoolSwap, payload as any));
        case "executeUniRebalance":
          return jsonResponse(await ctx.runAction(internal.actions.executeUniRebalance, payload as any));
        case "executeHLApproveAgent":
          return jsonResponse(await ctx.runAction(internal.actions.executeHLApproveAgent, payload as any));
        case "executeHLOrder":
          return jsonResponse(await ctx.runAction(internal.actions.executeHLOrder, payload as any));
        case "rotateHyperliquidAgent":
          return jsonResponse(await ctx.runAction(internal.actions.rotateHyperliquidAgent, payload as any));
        case "runCanaryChecks":
          return jsonResponse(await ctx.runAction(internal.actions.runCanaryChecks, payload as any));
        case "pauseStrategy":
          return jsonResponse(await ctx.runAction(internal.actions.pauseStrategy, payload as any));
        case "startWithdrawal":
          return jsonResponse(await ctx.runAction(internal.actions.startWithdrawal, payload as any));
        default:
          return jsonResponse({ error: `Unknown worker command: ${body.command ?? "undefined"}` }, 400);
      }
    } catch (error) {
      return jsonResponse(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  }),
});

export default http;
