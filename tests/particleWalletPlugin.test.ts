import test from "node:test";
import assert from "node:assert/strict";
import { createParticleWalletPluginOptions } from "../lib/particleWalletPlugin";

test("Particle wallet plugin options enable the full modal wallet entry", () => {
  const options = createParticleWalletPluginOptions();

  assert.equal(options.widgetIntegration, "modal");
  assert.equal(options.visible, true);
  assert.equal(options.entryPosition, "bottom-right");
  assert.equal(options.preload, true);
});
