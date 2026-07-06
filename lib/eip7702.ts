export type UniversalAccountMode = "smart" | "eip7702-if-supported";

export type Eip7702Capability = {
  supported: boolean;
  method?: string;
  reason: string;
};

export type Eip7702Status = Eip7702Capability & {
  requested: boolean;
  enabled: boolean;
  deployments?: unknown;
};

function hasCallable(value: unknown, key: string) {
  return Boolean(value && typeof value === "object" && typeof (value as Record<string, unknown>)[key] === "function");
}

export function detectEip7702Capability(walletClient: unknown): Eip7702Capability {
  if (hasCallable(walletClient, "signAuthorization")) {
    return { supported: true, method: "signAuthorization", reason: "Wallet supports EIP-7702 authorization." };
  }
  if (hasCallable(walletClient, "authorizeSync")) {
    return { supported: true, method: "authorizeSync", reason: "Wallet supports EIP-7702 authorization." };
  }
  if (hasCallable(walletClient, "sign7702Authorization")) {
    return { supported: true, method: "sign7702Authorization", reason: "Wallet supports EIP-7702 authorization." };
  }
  const nestedWallet = walletClient && typeof walletClient === "object"
    ? (walletClient as Record<string, unknown>).wallet
    : null;
  if (hasCallable(nestedWallet, "sign7702Authorization")) {
    return { supported: true, method: "wallet.sign7702Authorization", reason: "Wallet supports EIP-7702 authorization." };
  }
  return {
    supported: false,
    reason: "Connected wallet does not expose the EIP-7702 authorization API.",
  };
}

export function getEip7702Status(
  mode: UniversalAccountMode,
  capability: Eip7702Capability,
  deployments?: unknown,
): Eip7702Status {
  const requested = mode === "eip7702-if-supported";
  return {
    ...capability,
    requested,
    enabled: requested && capability.supported,
    deployments,
  };
}
