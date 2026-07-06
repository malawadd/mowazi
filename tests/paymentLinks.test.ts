import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionPaymentIntent,
  createPaymentLinkSlug,
  allowsEoaDirectDeposit,
  isActivePaymentLink,
  normalizeDepositPolicy,
  normalizePaymentSlug,
  PAYMENT_LINK_DEPOSIT_POLICY,
  PAYMENT_INTENT_STATUS,
} from "../convex/helpers/paymentLinks";
import {
  getEvmPrimaryDepositTokenOptions,
  getPaymentTokenOptions,
  getReceiverForDirectEvmDeposit,
  getReceiverForPaymentToken,
  getSettlementTarget,
  SETTLEMENT_CHAIN_ID,
} from "../lib/particlePaymentTokens";
import { detectEip7702Capability, getEip7702Status } from "../lib/eip7702";
import { buildArbitrumUsdcSettlementTransaction } from "../lib/universalAccountSettlement";

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

test("payment link deposit policy defaults preserve existing direct EOA links", () => {
  assert.equal(
    normalizeDepositPolicy(undefined),
    PAYMENT_LINK_DEPOSIT_POLICY.uaSettlementPlusEoaDirect,
  );
  assert.equal(
    normalizeDepositPolicy(PAYMENT_LINK_DEPOSIT_POLICY.uaSettlementOnly),
    PAYMENT_LINK_DEPOSIT_POLICY.uaSettlementOnly,
  );
  assert.equal(allowsEoaDirectDeposit(undefined), true);
  assert.equal(allowsEoaDirectDeposit(PAYMENT_LINK_DEPOSIT_POLICY.uaSettlementOnly), false);
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

test("EIP-7702 detection only enables authorization-capable wallets", () => {
  const jsonRpcWallet = { request: async () => "0x" };
  const viemJsonRpcWallet = {
    account: { type: "json-rpc" },
    signAuthorization: async () => "0xsig",
  };
  const embeddedWallet = { signAuthorization: async () => "0xsig" };

  assert.equal(detectEip7702Capability(jsonRpcWallet).supported, false);
  assert.equal(detectEip7702Capability(viemJsonRpcWallet).supported, false);
  assert.equal(detectEip7702Capability(embeddedWallet).supported, true);
  assert.equal(
    getEip7702Status("eip7702-if-supported", detectEip7702Capability(embeddedWallet)).enabled,
    true,
  );
  assert.equal(
    getEip7702Status("smart", detectEip7702Capability(embeddedWallet)).enabled,
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
    getReceiverForDirectEvmDeposit(addresses),
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

test("public payment token options are sourced from Particle primary metadata", () => {
  const options = getPaymentTokenOptions();

  assert.ok(options.length > 0);
  assert.ok(options.some((option) => option.token.symbol === "USDC"));
  assert.equal(options.some((option) => option.token.symbol === "BTC"), false);
});

test("EOA direct deposit options are Particle primary EVM tokens only", () => {
  const options = getEvmPrimaryDepositTokenOptions();

  assert.ok(options.length > 0);
  assert.ok(options.every((option) => option.chainId !== SOLANA_MAINNET));
  assert.ok(options.every((option) => !("receiverKind" in option)));
  assert.ok(options.some((option) => option.symbol === "USDC"));
});

test("UA settlement transaction targets Arbitrum USDC and transfers to receiver", () => {
  const receiver = "0x1111111111111111111111111111111111111111";
  const settlement = getSettlementTarget();
  const transaction = buildArbitrumUsdcSettlementTransaction({
    amount: "1.25",
    receiver,
  });

  assert.equal(transaction.chainId, SETTLEMENT_CHAIN_ID);
  assert.deepEqual(transaction.expectTokens, [{ type: "usdc", amount: "1.25" }]);
  assert.equal(transaction.transactions.length, 1);
  assert.equal((transaction.transactions[0] as any).to, settlement.address);
  assert.match((transaction.transactions[0] as any).data, /^0xa9059cbb/);
});
