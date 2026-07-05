import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionPaymentIntent,
  createPaymentLinkSlug,
  isActivePaymentLink,
  normalizePaymentSlug,
  PAYMENT_INTENT_STATUS,
} from "../convex/helpers/paymentLinks";
import {
  getPaymentTokenOptions,
  getReceiverForPaymentToken,
} from "../lib/particlePaymentTokens";

const OPTIMISM_MAINNET = 10;
const SOLANA_MAINNET = 101;

test("payment link slugs are stable, normalized public identifiers", () => {
  const first = createPaymentLinkSlug("strategy-1:entropy");
  const second = createPaymentLinkSlug("strategy-1:entropy");

  assert.equal(first, second);
  assert.match(first, /^pay-[a-z0-9]{18}$/);
  assert.equal(normalizePaymentSlug(" Pay-ABC_123! "), "pay-abc123");
});

test("payment link active checks reject disabled or invalid links", () => {
  assert.equal(isActivePaymentLink("active"), true);
  assert.equal(isActivePaymentLink("disabled"), false);
  assert.equal(isActivePaymentLink("missing"), false);
});

test("payment intent transitions stop final states from changing", () => {
  assert.equal(
    canTransitionPaymentIntent(PAYMENT_INTENT_STATUS.draft, PAYMENT_INTENT_STATUS.previewed),
    true,
  );
  assert.equal(
    canTransitionPaymentIntent(PAYMENT_INTENT_STATUS.previewed, PAYMENT_INTENT_STATUS.submitted),
    true,
  );
  assert.equal(
    canTransitionPaymentIntent(PAYMENT_INTENT_STATUS.submitted, PAYMENT_INTENT_STATUS.failed),
    false,
  );
  assert.equal(
    canTransitionPaymentIntent(PAYMENT_INTENT_STATUS.failed, PAYMENT_INTENT_STATUS.submitted),
    false,
  );
});

test("payment receiver selection uses EVM UA for EVM chains and Solana UA for Solana", () => {
  const addresses = {
    evmUaAddress: "0x1111111111111111111111111111111111111111",
    solanaUaAddress: "So11111111111111111111111111111111111111112",
  };

  assert.deepEqual(
    getReceiverForPaymentToken({ chainId: OPTIMISM_MAINNET }, addresses),
    { receiver: addresses.evmUaAddress, receiverKind: "evm" },
  );
  assert.deepEqual(
    getReceiverForPaymentToken({ chainId: SOLANA_MAINNET }, addresses),
    { receiver: addresses.solanaUaAddress, receiverKind: "solana" },
  );
  assert.throws(
    () => getReceiverForPaymentToken({ chainId: SOLANA_MAINNET }, { evmUaAddress: addresses.evmUaAddress }),
    /Solana Universal Account/,
  );
});

test("public payment token options are sourced from Particle primary target metadata", () => {
  const options = getPaymentTokenOptions();

  assert.ok(options.length > 0);
  assert.ok(options.some((option) => option.token.symbol === "USDC"));
  assert.equal(options.some((option) => option.token.symbol === "BTC"), false);
});
