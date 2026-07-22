import test from "node:test";
import assert from "node:assert/strict";
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_TOKENS,
  ARBITRUM_UNIVERSAL_ROUTER,
  assertArbitrumSwapPair,
  isAllowedArbitrumSwapTarget,
} from "../lib/trade/arbitrumRegistry";
import { ownerCapabilities } from "../lib/ownerSigner";
import {
  allowedTargets,
  assertFresh,
  prepareSwapRequest,
  validateTransaction,
} from "../execution-sidecar/src/uniswap";

test("Arbitrum is the sole active strategy chain", () => {
  assert.equal(ARBITRUM_CHAIN_ID, 42161);
  assert.doesNotThrow(() => assertArbitrumSwapPair({
    tokenIn: ARBITRUM_TOKENS.USDC.address,
    tokenOut: ARBITRUM_TOKENS.WETH.address,
    tokenInChainId: "42161",
    tokenOutChainId: "42161",
  }));
  assert.throws(() => assertArbitrumSwapPair({
    tokenIn: ARBITRUM_TOKENS.USDC.address,
    tokenOut: ARBITRUM_TOKENS.WETH.address,
    tokenInChainId: 10,
    tokenOutChainId: 10,
  }), /Arbitrum/);
});

test("Particle without 7702 retains approval but not autopilot", () => {
  const unsupported = ownerCapabilities({ eip7702Supported: false, delegatedChainIds: [] });
  assert.equal(unsupported.shadow, true);
  assert.equal(unsupported.approval, true);
  assert.equal(unsupported.autopilot, false);
  const delegated = ownerCapabilities({ eip7702Supported: true, delegatedChainIds: [42161] });
  assert.equal(delegated.autopilot, true);
});

test("Uniswap request shaping distinguishes classic and UniswapX", () => {
  const permitData = { domain: { chainId: 42161 } };
  const classic = prepareSwapRequest({ routing: "CLASSIC", permitData, requestId: "a" }, "0xsigned");
  assert.deepEqual(classic.permitData, permitData);
  assert.equal(classic.signature, "0xsigned");
  const auction = prepareSwapRequest({ routing: "DUTCH_V2", permitData, requestId: "b" }, "0xsigned");
  assert.equal(auction.signature, "0xsigned");
  assert.equal("permitData" in auction, false);
});

test("swap validation binds sender, target, chain, and freshness", () => {
  const now = 1_700_000_000_000;
  assert.doesNotThrow(() => assertFresh(now - 29_999, now));
  assert.throws(() => assertFresh(now - 30_001, now), /stale/);
  assert.equal(isAllowedArbitrumSwapTarget(ARBITRUM_UNIVERSAL_ROUTER), true);
  const sender = `0x${"2".repeat(40)}`;
  const tx = validateTransaction({
    expectedSender: sender,
    allowedTargets: allowedTargets(),
    result: { swap: { to: ARBITRUM_UNIVERSAL_ROUTER, from: sender, data: "0x12", value: "0", chainId: 42161 } },
  });
  assert.equal(tx.chainId, 42161);
  assert.throws(() => validateTransaction({
    expectedSender: sender,
    allowedTargets: allowedTargets(),
    result: { swap: { to: `0x${"3".repeat(40)}`, from: sender, data: "0x12", value: "0", chainId: 42161 } },
  }), /allowlisted/);
});
