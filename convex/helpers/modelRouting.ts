const ROLES = [
  "technical_trend", "liquidity", "derivatives", "on_chain", "news", "social",
  "cross_venue_basis", "volatility_liquidations", "whale_flow", "macro_correlation",
  "execution_quality", "portfolio_exposure", "short_horizon", "swing_horizon",
  "bull_case", "bear_case", "range_regime", "catalyst", "data_quality_skeptic",
  "market_integrity",
] as const;

const SYNTHESIS = {
  focus: ["synthesis"],
  pro: ["critic", "synthesis"],
  max: ["openai_synthesis", "deepseek_synthesis", "arbiter"],
} as const;

export type ModelRoute = {
  slot: string;
  provider: "openai" | "deepseek";
  model: string;
  credentialSource: "platform" | "byok";
  connectionId?: string;
  maxOutputTokens: number;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  inputPriceMicrousdPerMillion: number;
  cachedInputPriceMicrousdPerMillion: number;
  outputPriceMicrousdPerMillion: number;
};

export type ModelRoutingDocument = {
  schemaVersion: 1;
  routes: ModelRoute[];
};

const platformRoute = (
  slot: string, provider: "openai" | "deepseek", model: string, maxOutputTokens: number,
): ModelRoute => ({
  slot, provider, model, credentialSource: "platform", maxOutputTokens,
  inputPriceMicrousdPerMillion: 0, cachedInputPriceMicrousdPerMillion: 0,
  outputPriceMicrousdPerMillion: 0,
});

export function defaultModelRouting(): ModelRoutingDocument {
  return {
    schemaVersion: 1,
    routes: [
      platformRoute("specialist_default", "deepseek", "deepseek-v4-flash", 700),
      platformRoute("synthesis", "openai", "gpt-5.6-sol", 1_200),
      platformRoute("critic", "deepseek", "deepseek-v4-pro", 1_200),
      platformRoute("arbiter", "openai", "gpt-5.6-sol", 1_200),
      platformRoute("openai_synthesis", "openai", "gpt-5.6-sol", 1_200),
      platformRoute("deepseek_synthesis", "deepseek", "deepseek-v4-pro", 1_200),
      platformRoute("policy_draft", "deepseek", "deepseek-v4-flash", 700),
    ],
  };
}

const ALLOWED_DEFAULTS = new Set([
  "specialist_default", "synthesis", "critic", "arbiter", "policy_draft",
  "openai_synthesis", "deepseek_synthesis",
]);

function validSlot(slot: string) {
  return ALLOWED_DEFAULTS.has(slot)
    || (slot.startsWith("role:") && ROLES.includes(slot.slice(5) as typeof ROLES[number]));
}

export function parseModelRouting(value: string): ModelRoutingDocument {
  const parsed = JSON.parse(value) as ModelRoutingDocument;
  if (parsed?.schemaVersion !== 1 || !Array.isArray(parsed.routes)) {
    throw new Error("Unsupported model-routing document.");
  }
  if (parsed.routes.length < 2 || parsed.routes.length > 32) {
    throw new Error("Model routing must contain 2-32 routes.");
  }
  const slots = new Set<string>();
  const credentials = new Map<string, string>();
  for (const route of parsed.routes) {
    if (!validSlot(route.slot) || slots.has(route.slot)) throw new Error(`Invalid or duplicate route: ${route.slot}`);
    slots.add(route.slot);
    if (!["openai", "deepseek"].includes(route.provider)) throw new Error("Unsupported model provider.");
    if (!["platform", "byok"].includes(route.credentialSource)) throw new Error("Unsupported credential source.");
    if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(route.model)) throw new Error("Invalid model ID.");
    if (route.credentialSource === "byok" && !route.connectionId) throw new Error("BYOK routes require a connection.");
    const credential = `${route.credentialSource}:${route.connectionId ?? "platform"}`;
    const current = credentials.get(route.provider);
    if (current && current !== credential) throw new Error("Each provider must use one credential source per configuration.");
    credentials.set(route.provider, credential);
    if (route.maxOutputTokens < 128 || route.maxOutputTokens > 8_192) throw new Error("Invalid output-token cap.");
    for (const price of [route.inputPriceMicrousdPerMillion, route.cachedInputPriceMicrousdPerMillion, route.outputPriceMicrousdPerMillion]) {
      if (!Number.isFinite(price) || price < 0 || price > 1_000_000_000) throw new Error("Invalid model rate.");
    }
    if (route.credentialSource === "byok" && route.inputPriceMicrousdPerMillion === 0 && route.outputPriceMicrousdPerMillion === 0) {
      throw new Error(`BYOK route ${route.slot} requires confirmed model rates.`);
    }
  }
  if (!slots.has("specialist_default") || !slots.has("synthesis")) {
    throw new Error("Specialist and synthesis defaults are required.");
  }
  return parsed;
}

function routeFor(routes: ModelRoute[], slot: string) {
  return routes.find((item) => item.slot === slot)
    ?? routes.find((item) => item.slot === (slot.startsWith("role:") ? "specialist_default" : "synthesis"))!;
}

export function estimateModelRouting(document: ModelRoutingDocument, tier: "focus" | "pro" | "max") {
  const base = ROLES.slice(0, { focus: 6, pro: 12, max: 20 }[tier]);
  const roles = tier === "pro"
    ? [...base, "liquidity", "derivatives", "cross_venue_basis", "volatility_liquidations"]
    : tier === "max" ? [...base, ...base.filter((_, index) => [0, 1, 2, 6, 7, 8, 11, 12, 13, 14].includes(index))] : base;
  const calls = [
    ...roles.map((role) => ({ route: routeFor(document.routes, `role:${role}`), kind: "specialist" })),
    ...SYNTHESIS[tier].map((step) => ({ route: routeFor(document.routes, step), kind: step === "arbiter" ? "arbiter" : "synthesis" })),
  ];
  const credits = calls.reduce((sum, call) => {
    if (call.route.credentialSource === "platform") return sum + (call.kind === "specialist" ? 3 : call.kind === "arbiter" ? 9 : 7);
    return sum + (call.kind === "specialist" ? 1 : call.kind === "arbiter" ? 3 : 2);
  }, 0);
  const providerCost = calls.reduce((sum, call) => call.route.credentialSource === "byok" ? sum
    + Math.round(call.route.inputPriceMicrousdPerMillion * 2_500 / 1_000_000)
    + Math.round(call.route.outputPriceMicrousdPerMillion * call.route.maxOutputTokens / 1_000_000) : sum, 0);
  return { calls: calls.length, credits, estimatedProviderCostMicrousd: providerCost, maximumProviderCostMicrousd: providerCost };
}
