import {
  EntryPosition,
  type WalletPluginParamers,
} from "@particle-network/connectkit/wallet";
import type { WalletCustomStyle } from "@particle-network/wallet";

export const PARTICLE_WALLET_WIDGET_STORAGE_KEY =
  "moeazi:particle-wallet-widget-visible";
export const DEFAULT_PARTICLE_WALLET_WIDGET_VISIBLE = false;
const INITIAL_PARTICLE_WALLET_PLUGIN_VISIBLE = true;

type ParticleWalletPluginOptions = {
  entryPosition?: WalletPluginParamers["entryPosition"];
  visible?: boolean;
};
type ParticleWalletCustomStyle = Omit<WalletCustomStyle, "supportChains">;

export function parseParticleWalletWidgetPreference(value: string | null) {
  return value === "true";
}

const particleWalletLightStyle: NonNullable<WalletCustomStyle["light"]> = {
  colorAccent: "#74b9ff",
  colorPrimary: "#fffdf5",
  colorOnPrimary: "#111111",
  primaryButtonBackgroundColors: ["#ffd23f", "#ffa552"],
  primaryIconButtonBackgroundColors: ["#fff8e9", "#fff1cf"],
  primaryIconTextColor: "#111111",
  primaryButtonTextColor: "#111111",
  cancelButtonBackgroundColor: "#fff8e9",
  backgroundColors: [
    "#fffdf5",
    [
      ["#fff8e9", "#eef7ff"],
      ["#fffdf5", "#fff1cf"],
    ],
  ],
  messageColors: ["#111111", "#3f3f46", "#71717a"],
  borderGlowColors: ["#ffd23f", "#74b9ff"],
  modalMaskBackgroundColor: "rgba(17, 17, 17, 0.38)",
  cardBorderRadius: 0,
};

export const particleWalletCustomStyle: ParticleWalletCustomStyle = {
  light: {
    ...particleWalletLightStyle,
  },
  dark: {
    ...particleWalletLightStyle,
  },
};

export function createParticleWalletPluginOptions({
  entryPosition = EntryPosition.BR,
  visible = INITIAL_PARTICLE_WALLET_PLUGIN_VISIBLE,
}: ParticleWalletPluginOptions = {}) {
  return {
    widgetIntegration: "modal",
    themeType: "light",
    visible,
    entryPosition,
    preload: false,
    customStyle: particleWalletCustomStyle,
  } satisfies WalletPluginParamers;
}
