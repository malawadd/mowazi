import test from "node:test";
import assert from "node:assert/strict";
import { canUseUaForHyperliquid, fundingAmountNeeded } from "../lib/trade/hyperliquidFunding";
import { buildHyperliquidOrderActions } from "../lib/trade/hyperliquidOrder";
import { isProtectedRoute } from "../middleware";

test("/trade is public while app account routes stay protected", () => {
  assert.equal(isProtectedRoute("/trade"), false);
  assert.equal(isProtectedRoute("/trade/BTC-PERP"), false);
  assert.equal(isProtectedRoute("/dashboard"), true);
  assert.equal(isProtectedRoute("/profile/wallet"), true);
});

test("Particle UA must credit a Hyperliquid-signable address", () => {
  assert.equal(
    canUseUaForHyperliquid({
      ownerAddress: "0x1111111111111111111111111111111111111111",
      evmUaAddress: "0x1111111111111111111111111111111111111111",
    }).ok,
    true,
  );
  assert.equal(
    canUseUaForHyperliquid({
      ownerAddress: "0x1111111111111111111111111111111111111111",
      evmUaAddress: "0x2222222222222222222222222222222222222222",
    }).ok,
    false,
  );
});

test("Hyperliquid IOC and isolated leverage payloads are deterministic", () => {
  const built = buildHyperliquidOrderActions({
    asset: 4,
    isBuy: true,
    mid: 100,
    size: 1.25,
    sizeDecimals: 2,
    slippageCapBps: 75,
    leverage: 5.8,
    reduceOnly: false,
  });

  assert.equal(built.aggressivePrice, 100.75);
  assert.deepEqual(built.leverageAction, { type: "updateLeverage", asset: 4, isCross: false, leverage: 5 });
  assert.deepEqual(built.orderAction, {
    type: "order",
    orders: [{ a: 4, b: true, p: "100.75", s: "1.25", r: false, t: { limit: { tif: "Ioc" } } }],
    grouping: "na",
  });
});

test("funding helper only asks for missing margin", () => {
  assert.equal(fundingAmountNeeded({ marginUsd: 100, venueAccountValueUsd: 42.321 }), 57.68);
  assert.equal(fundingAmountNeeded({ marginUsd: 100, venueAccountValueUsd: 100 }), 0);
});
