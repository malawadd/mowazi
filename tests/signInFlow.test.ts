import test from "node:test";
import assert from "node:assert/strict";
import { shouldStartParticleSignIn } from "../lib/signInFlow";

const readyState = {
  isConnected: true,
  address: "0x1111111111111111111111111111111111111111",
  autoAttemptedAddress: null,
  sessionStatus: "unauthenticated" as const,
  hasSession: false,
  busy: false,
  signing: false,
  completed: false,
};

test("Particle sign-in starts only for a connected unauthenticated wallet", () => {
  assert.equal(shouldStartParticleSignIn(readyState), true);
  assert.equal(shouldStartParticleSignIn({ ...readyState, isConnected: false }), false);
  assert.equal(shouldStartParticleSignIn({ ...readyState, address: null }), false);
  assert.equal(shouldStartParticleSignIn({ ...readyState, sessionStatus: "loading" }), false);
});

test("Particle sign-in does not re-enter after an app session exists", () => {
  assert.equal(shouldStartParticleSignIn({ ...readyState, sessionStatus: "authenticated" }), false);
  assert.equal(shouldStartParticleSignIn({ ...readyState, hasSession: true }), false);
  assert.equal(shouldStartParticleSignIn({ ...readyState, completed: true }), false);
});

test("Particle sign-in does not re-enter while a signature flow is active", () => {
  assert.equal(shouldStartParticleSignIn({ ...readyState, busy: true }), false);
  assert.equal(shouldStartParticleSignIn({ ...readyState, signing: true }), false);
});

test("Particle sign-in auto prompt is one attempt per connected address", () => {
  assert.equal(
    shouldStartParticleSignIn({
      ...readyState,
      autoAttemptedAddress: "0x1111111111111111111111111111111111111111",
    }),
    false,
  );
  assert.equal(
    shouldStartParticleSignIn({
      ...readyState,
      autoAttemptedAddress: "0x2222222222222222222222222222222222222222",
    }),
    true,
  );
});
