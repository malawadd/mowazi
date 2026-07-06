export type ParticleSessionStatus = "loading" | "authenticated" | "unauthenticated";

type ParticleSignInGateState = {
  isConnected: boolean;
  address?: string | null;
  autoAttemptedAddress?: string | null;
  sessionStatus: ParticleSessionStatus;
  hasSession: boolean;
  busy: boolean;
  signing: boolean;
  completed: boolean;
};

export function shouldStartParticleSignIn(state: ParticleSignInGateState) {
  const address = state.address?.toLowerCase() ?? null;
  const attemptedAddress = state.autoAttemptedAddress?.toLowerCase() ?? null;

  return Boolean(
    state.isConnected &&
      address &&
      attemptedAddress !== address &&
      state.sessionStatus === "unauthenticated" &&
      !state.hasSession &&
      !state.busy &&
      !state.signing &&
      !state.completed,
  );
}
