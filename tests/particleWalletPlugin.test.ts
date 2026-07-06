import test from "node:test";
import assert from "node:assert/strict";
import {
  createParticleWalletPluginOptions,
  parseParticleWalletWidgetPreference,
} from "../lib/particleWalletPlugin";

test("Particle wallet plugin options keep the floating entry hidden by default", () => {
  const options = createParticleWalletPluginOptions();

  assert.equal(options.widgetIntegration, "modal");
  assert.equal(options.visible, false);
  assert.equal(options.entryPosition, "bottom-right");
  assert.equal(options.preload, true);
  assert.equal(options.customStyle?.light?.colorPrimary, "#ffd23f");
  assert.equal(options.customStyle?.light?.colorAccent, "#74b9ff");
});

test("Particle wallet plugin options can enable the floating entry on demand", () => {
  const options = createParticleWalletPluginOptions({ visible: true });

  assert.equal(options.visible, true);
  assert.equal(options.entryPosition, "bottom-right");
});

test("Particle wallet widget preference parser is opt-in only", () => {
  assert.equal(parseParticleWalletWidgetPreference("true"), true);
  assert.equal(parseParticleWalletWidgetPreference("false"), false);
  assert.equal(parseParticleWalletWidgetPreference(null), false);
});
