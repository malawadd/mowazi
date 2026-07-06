import test from "node:test";
import assert from "node:assert/strict";
import {
  createParticleWalletPluginOptions,
  parseParticleWalletWidgetPreference,
} from "../lib/particleWalletPlugin";

test("Particle wallet plugin options initialize in draggable widget mode", () => {
  const options = createParticleWalletPluginOptions();

  assert.equal(options.widgetIntegration, "modal");
  assert.equal(options.themeType, "light");
  assert.equal(options.visible, true);
  assert.equal(options.entryPosition, "bottom-right");
  assert.equal(options.preload, true);
  assert.equal(options.customStyle?.light?.colorPrimary, "#ffd23f");
  assert.equal(options.customStyle?.light?.colorAccent, "#74b9ff");
  assert.equal(options.customStyle?.dark?.colorPrimary, "#ffd23f");
});

test("Particle wallet plugin options can hide the floating entry on demand", () => {
  const options = createParticleWalletPluginOptions({ visible: false });

  assert.equal(options.visible, false);
  assert.equal(options.entryPosition, "bottom-right");
});

test("Particle wallet widget preference parser is opt-in only", () => {
  assert.equal(parseParticleWalletWidgetPreference("true"), true);
  assert.equal(parseParticleWalletWidgetPreference("false"), false);
  assert.equal(parseParticleWalletWidgetPreference(null), false);
});
