export type ModelProvider = "openai" | "deepseek";
export type CredentialSource = "platform" | "byok";

export type AccessibleModel = {
  id: string;
  pricingKnown: boolean;
  inputPriceMicrousdPerMillion: number;
  cachedInputPriceMicrousdPerMillion: number;
  outputPriceMicrousdPerMillion: number;
};

export type ProviderConnection = {
  _id: string;
  provider: ModelProvider;
  label: string;
  keyLast4: string;
  status: "pending" | "verified" | "invalid" | "revoked";
  models: AccessibleModel[];
  capabilities: { compatibleModels?: string[] };
  failureReason?: string;
  verifiedAt?: number;
  lastUsedAt?: number;
  version: number;
};

export type ModelRoute = {
  slot: string;
  provider: ModelProvider;
  model: string;
  credentialSource: CredentialSource;
  connectionId?: string;
  maxOutputTokens: number;
  reasoningEffort?: "none" | "low" | "medium" | "high";
  inputPriceMicrousdPerMillion: number;
  cachedInputPriceMicrousdPerMillion: number;
  outputPriceMicrousdPerMillion: number;
};

export type ModelRoutingDocument = { schemaVersion: 1; routes: ModelRoute[] };

export const specialistRoles = [
  "technical_trend", "liquidity", "derivatives", "on_chain", "news", "social",
  "cross_venue_basis", "volatility_liquidations", "whale_flow", "macro_correlation",
  "execution_quality", "portfolio_exposure", "short_horizon", "swing_horizon",
  "bull_case", "bear_case", "range_regime", "catalyst", "data_quality_skeptic",
  "market_integrity",
] as const;

export const platformModels: Record<ModelProvider, AccessibleModel[]> = {
  openai: [
    { id: "gpt-5.4-mini", pricingKnown: false, inputPriceMicrousdPerMillion: 0, cachedInputPriceMicrousdPerMillion: 0, outputPriceMicrousdPerMillion: 0 },
    { id: "gpt-5.6-luna", pricingKnown: true, inputPriceMicrousdPerMillion: 1_000_000, cachedInputPriceMicrousdPerMillion: 100_000, outputPriceMicrousdPerMillion: 6_000_000 },
    { id: "gpt-5.6-terra", pricingKnown: true, inputPriceMicrousdPerMillion: 2_500_000, cachedInputPriceMicrousdPerMillion: 250_000, outputPriceMicrousdPerMillion: 15_000_000 },
    { id: "gpt-5.6-sol", pricingKnown: true, inputPriceMicrousdPerMillion: 5_000_000, cachedInputPriceMicrousdPerMillion: 500_000, outputPriceMicrousdPerMillion: 30_000_000 },
  ],
  deepseek: [
    { id: "deepseek-v4-flash", pricingKnown: true, inputPriceMicrousdPerMillion: 140_000, cachedInputPriceMicrousdPerMillion: 2_800, outputPriceMicrousdPerMillion: 280_000 },
    { id: "deepseek-v4-pro", pricingKnown: true, inputPriceMicrousdPerMillion: 435_000, cachedInputPriceMicrousdPerMillion: 3_625, outputPriceMicrousdPerMillion: 870_000 },
  ],
};

function route(slot: string, provider: ModelProvider, model: string, maxOutputTokens: number): ModelRoute {
  const price = platformModels[provider].find((item) => item.id === model)!;
  return {
    slot, provider, model, credentialSource: "platform", maxOutputTokens,
    inputPriceMicrousdPerMillion: price.inputPriceMicrousdPerMillion,
    cachedInputPriceMicrousdPerMillion: price.cachedInputPriceMicrousdPerMillion,
    outputPriceMicrousdPerMillion: price.outputPriceMicrousdPerMillion,
  };
}

export function presetRouting(preset: "economy" | "balanced" | "quality"): ModelRoutingDocument {
  const openai = preset === "economy" ? "gpt-5.6-luna" : preset === "quality" ? "gpt-5.6-sol" : "gpt-5.4-mini";
  const deepseek = preset === "quality" ? "deepseek-v4-pro" : "deepseek-v4-flash";
  const routes: ModelRoute[] = [
    route("specialist_default", "openai", openai, 700),
    route("synthesis", "openai", preset === "economy" ? "gpt-5.6-luna" : "gpt-5.6-sol", 1_200),
    route("critic", "deepseek", "deepseek-v4-pro", 1_200),
    route("arbiter", "openai", preset === "economy" ? "gpt-5.6-luna" : "gpt-5.6-sol", 1_200),
    route("openai_synthesis", "openai", preset === "economy" ? "gpt-5.6-luna" : "gpt-5.6-sol", 1_200),
    route("deepseek_synthesis", "deepseek", "deepseek-v4-pro", 1_200),
    route("policy_draft", "deepseek", deepseek, 700),
  ];
  specialistRoles.forEach((roleName, index) => {
    if (index % 2 === 1) routes.push(route(`role:${roleName}`, "deepseek", deepseek, 700));
  });
  return { schemaVersion: 1, routes };
}

export async function providerRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/agent-providers/${path}`, {
    ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail ?? payload.error ?? `Provider service returned ${response.status}.`);
  return payload as T;
}
