/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accountWallets from "../accountWallets.js";
import type * as actions from "../actions.js";
import type * as agentActions from "../agentActions.js";
import type * as agentCredits from "../agentCredits.js";
import type * as agentMutations from "../agentMutations.js";
import type * as agentProfiles from "../agentProfiles.js";
import type * as agentQueries from "../agentQueries.js";
import type * as agentRuntime from "../agentRuntime.js";
import type * as agentScheduler from "../agentScheduler.js";
import type * as agentSchema from "../agentSchema.js";
import type * as agentValidators from "../agentValidators.js";
import type * as agentWorker from "../agentWorker.js";
import type * as constants from "../constants.js";
import type * as helpers_agentPolicy from "../helpers/agentPolicy.js";
import type * as helpers_executionPolicy from "../helpers/executionPolicy.js";
import type * as helpers_leases from "../helpers/leases.js";
import type * as helpers_paymentLinks from "../helpers/paymentLinks.js";
import type * as helpers_walletAssets from "../helpers/walletAssets.js";
import type * as helpers_walletCrypto from "../helpers/walletCrypto.js";
import type * as helpers_withdrawals from "../helpers/withdrawals.js";
import type * as http from "../http.js";
import type * as model from "../model.js";
import type * as mutations from "../mutations.js";
import type * as payments from "../payments.js";
import type * as private_ from "../private.js";
import type * as publicActions from "../publicActions.js";
import type * as queries from "../queries.js";
import type * as trade from "../trade.js";
import type * as tradeHelpers from "../tradeHelpers.js";
import type * as venueIntegrations from "../venueIntegrations.js";
import type * as worker from "../worker.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  accountWallets: typeof accountWallets;
  actions: typeof actions;
  agentActions: typeof agentActions;
  agentCredits: typeof agentCredits;
  agentMutations: typeof agentMutations;
  agentProfiles: typeof agentProfiles;
  agentQueries: typeof agentQueries;
  agentRuntime: typeof agentRuntime;
  agentScheduler: typeof agentScheduler;
  agentSchema: typeof agentSchema;
  agentValidators: typeof agentValidators;
  agentWorker: typeof agentWorker;
  constants: typeof constants;
  "helpers/agentPolicy": typeof helpers_agentPolicy;
  "helpers/executionPolicy": typeof helpers_executionPolicy;
  "helpers/leases": typeof helpers_leases;
  "helpers/paymentLinks": typeof helpers_paymentLinks;
  "helpers/walletAssets": typeof helpers_walletAssets;
  "helpers/walletCrypto": typeof helpers_walletCrypto;
  "helpers/withdrawals": typeof helpers_withdrawals;
  http: typeof http;
  model: typeof model;
  mutations: typeof mutations;
  payments: typeof payments;
  private: typeof private_;
  publicActions: typeof publicActions;
  queries: typeof queries;
  trade: typeof trade;
  tradeHelpers: typeof tradeHelpers;
  venueIntegrations: typeof venueIntegrations;
  worker: typeof worker;
}>;
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {};
