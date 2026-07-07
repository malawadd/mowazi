import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCanCancelTradeIntent,
  canCancelTradeIntent,
  normalizeOptionalHours,
} from "../lib/trade/intents";

test("queued trade intents can be cancelled before execution starts", () => {
  assert.equal(canCancelTradeIntent("queued"), true);
  assert.equal(canCancelTradeIntent("executing"), false);
  assert.equal(canCancelTradeIntent("filled"), false);
  assert.doesNotThrow(() => assertCanCancelTradeIntent("queued"));
  assert.throws(() => assertCanCancelTradeIntent("executing"), /queued/i);
});

test("optional hold time normalizes empty values and rejects negative input", () => {
  assert.equal(normalizeOptionalHours(undefined), null);
  assert.equal(normalizeOptionalHours(null), null);
  assert.equal(normalizeOptionalHours(0), null);
  assert.equal(normalizeOptionalHours(12), 12);
  assert.throws(() => normalizeOptionalHours(-1), /negative/i);
});
