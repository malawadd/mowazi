import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultModelRouting,
  estimateModelRouting,
  parseModelRouting,
} from "../convex/helpers/modelRouting";

test("BYOK routes reduce credits while exposing provider cost", () => {
  const platform = defaultModelRouting();
  const byok = {
    ...platform,
    routes: platform.routes.map((route) => ({
      ...route,
      credentialSource: "byok" as const,
      connectionId: `connection-${route.provider}`,
      inputPriceMicrousdPerMillion: 1_000_000,
      cachedInputPriceMicrousdPerMillion: 100_000,
      outputPriceMicrousdPerMillion: 2_000_000,
    })),
  };

  const platformEstimate = estimateModelRouting(platform, "focus");
  const byokEstimate = estimateModelRouting(byok, "focus");
  assert.equal(platformEstimate.calls, 7);
  assert.ok(byokEstimate.credits < platformEstimate.credits);
  assert.equal(platformEstimate.estimatedProviderCostMicrousd, 0);
  assert.ok(byokEstimate.estimatedProviderCostMicrousd > 0);
});

test("model routing rejects missing BYOK credentials and zero rates", () => {
  const document = defaultModelRouting();
  document.routes[0] = {
    ...document.routes[0],
    credentialSource: "byok",
    connectionId: undefined,
  };
  assert.throws(() => parseModelRouting(JSON.stringify(document)), /require a connection/);

  document.routes[0].connectionId = "connection-openai";
  assert.throws(() => parseModelRouting(JSON.stringify(document)), /confirmed model rates/);
});
