import { EntryPosition, type WalletPluginParamers } from "@particle-network/connectkit/wallet";

export function createParticleWalletPluginOptions(
  entryPosition: WalletPluginParamers["entryPosition"] = EntryPosition.BR,
) {
  return {
    widgetIntegration: "modal",
    visible: true,
    entryPosition,
    preload: true,
  } satisfies WalletPluginParamers;
}
