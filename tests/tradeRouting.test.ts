import test from "node:test";
import assert from "node:assert/strict";
import { routeBestExecution, validateTradeSettings } from "../lib/trade/routing";
import type { RouteInput, VenueSnapshot } from "../lib/trade/types";

const baseInput: RouteInput = {
  marketId: "BTC-PERP",
  side: "long",
  marginUsd: 100,
  leverage: 5,
  slippageCapBps: 100,
  now: 1_000_000,
};

function snapshot(
  venue: VenueSnapshot["venue"],
  overrides: Partial<VenueSnapshot> = {},
): VenueSnapshot {
  return {
    venue,
    marketId: "BTC-PERP",
    midPrice: 100,
    bidPrice: 99.95,
    askPrice: 100.05,
    entryImpactBps: 5,
    exitImpactBps: 5,
    fundingRateHourly: 0.00001,
    openInterestUsd: 1_000_000,
    volume24hUsd: 10_000_000,
    fetchedAt: baseInput.now!,
    source: "fixture",
    ...overrides,
  };
}

test("routing excludes unsupported markets and venue leverage caps", () => {
  const quote = routeBestExecution(
    { ...baseInput, marketId: "US100", leverage: 120 },
    [
      snapshot("hyperliquid", { marketId: "US100" }),
      snapshot("lighter", { marketId: "US100" }),
      snapshot("ostium", { marketId: "US100" }),
    ],
  );

  const hyperliquid = quote.quotes.find((item) => item.venue === "hyperliquid");
  const ostium = quote.quotes.find((item) => item.venue === "ostium");

  assert.equal(hyperliquid?.eligible, false);
  assert.match(hyperliquid?.reason ?? "", /not listed/i);
  assert.equal(ostium?.eligible, true);
  assert.equal(quote.winningVenue, "ostium");
});

test("routing uses a shared slippage benchmark instead of each venue mid", () => {
  const quote = routeBestExecution(baseInput, [
    snapshot("hyperliquid", {
      midPrice: 100,
      bidPrice: 99,
      askPrice: 101,
      entryImpactBps: 0,
      exitImpactBps: 0,
    }),
    snapshot("lighter", {
      midPrice: 102.5,
      bidPrice: 102,
      askPrice: 103,
      entryImpactBps: 0,
      exitImpactBps: 0,
    }),
  ]);

  const hyperliquid = quote.quotes.find((item) => item.venue === "hyperliquid");
  const lighter = quote.quotes.find((item) => item.venue === "lighter");

  assert.equal(quote.benchmarkVenue, "hyperliquid");
  assert.equal(hyperliquid?.costs.entrySlippageUsd, 5);
  assert.equal(lighter?.costs.entrySlippageUsd, 14.63);
});

test("funding is optional and exit fees are modeled from entry notional", () => {
  const withoutFunding = routeBestExecution(baseInput, [snapshot("lighter")]);
  const withFunding = routeBestExecution({ ...baseInput, holdTimeHours: 10 }, [snapshot("lighter")]);
  const baseQuote = withoutFunding.quotes.find((item) => item.venue === "lighter");
  const fundedQuote = withFunding.quotes.find((item) => item.venue === "lighter");

  assert.equal(baseQuote?.costs.fundingUsd, 0);
  assert.equal(fundedQuote?.costs.fundingUsd, 0.05);
  assert.equal(fundedQuote?.costs.entryFeeUsd, 0);
  assert.equal(fundedQuote?.costs.exitFeeUsd, 0);
});

test("freshness and fixture fallback keep unavailable public venues routable", () => {
  const quote = routeBestExecution(baseInput);
  const eligible = quote.quotes.filter((item) => item.eligible);

  assert.ok(eligible.length > 0);
  assert.ok(eligible.every((item) => item.source === "fixture"));
  assert.ok(eligible.every((item) => item.freshnessMs === 0));
});

test("ties prefer lower entry slippage and then static venue priority", () => {
  const quote = routeBestExecution(baseInput, [
    snapshot("hyperliquid", {
      midPrice: 100,
      bidPrice: 100,
      askPrice: 100,
      entryImpactBps: 0,
      exitImpactBps: 0,
    }),
    snapshot("lighter", {
      midPrice: 100,
      bidPrice: 100,
      askPrice: 100,
      entryImpactBps: 0,
      exitImpactBps: 0,
    }),
  ]);

  assert.equal(quote.winningVenue, "lighter");
});

test("trade settings validation rejects invalid defaults", () => {
  assert.throws(
    () =>
      validateTradeSettings({
        defaultMarketId: "BTC-PERP",
        defaultLeverage: 250,
        defaultMarginUsd: 100,
        slippageCapBps: 50,
      }),
    /cap/i,
  );
  assert.doesNotThrow(() =>
    validateTradeSettings({
      defaultMarketId: "BTC-PERP",
      defaultLeverage: 5,
      defaultMarginUsd: 100,
      slippageCapBps: 50,
    }),
  );
});
