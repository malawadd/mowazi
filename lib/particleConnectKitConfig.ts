import { Buffer } from "buffer";
import { createConfig, type Theme } from "@particle-network/connectkit";
import { authWalletConnectors } from "@particle-network/connectkit/auth";
import { evmWalletConnectors } from "@particle-network/connectkit/evm";
import { wallet, type WalletPlugin } from "@particle-network/connectkit/wallet";
import { PARTICLE_EVM_CHAINS } from "@/lib/particleEvmChains";
import { createParticleWalletPluginOptions } from "@/lib/particleWalletPlugin";

const globalWithBuffer = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
};
if (!globalWithBuffer.Buffer) {
  globalWithBuffer.Buffer = Buffer;
}

const PARTICLE_PROJECT_ID =
  process.env.NEXT_PUBLIC_PROJECT_ID || "missing-particle-project-id";
const PARTICLE_CLIENT_KEY =
  process.env.NEXT_PUBLIC_CLIENT_KEY || "missing-particle-client-key";
const PARTICLE_APP_ID =
  process.env.NEXT_PUBLIC_APP_ID || "missing-particle-app-id";

const moeaziConnectTheme = {
  "--pcm-font-family": "var(--font-plus-jakarta-sans), sans-serif",
  "--pcm-focus-color": "#111111",
  "--pcm-overlay-background": "rgba(17, 17, 17, 0.38)",
  "--pcm-overlay-backdrop-filter": "none",
  "--pcm-modal-box-shadow": "0 0 0 3px #111111, 8px 8px 0 #111111",
  "--pcm-modal-width": "420px",
  "--pcm-modal-max-height": "78vh",
  "--pcm-rounded-sm": "0px",
  "--pcm-rounded-md": "0px",
  "--pcm-rounded-lg": "0px",
  "--pcm-rounded-xl": "0px",
  "--pcm-rounded-full": "0px",
  "--pcm-body-background": "#fffdf5",
  "--pcm-body-background-secondary": "#fff8e9",
  "--pcm-body-background-tertiary": "#eef7ff",
  "--pcm-body-color": "#111111",
  "--pcm-body-color-secondary": "#3f3f46",
  "--pcm-body-color-tertiary": "#71717a",
  "--pcm-body-action-color": "#111111",
  "--pcm-button-border-color": "#111111",
  "--pcm-button-font-weight": "800",
  "--pcm-button-hover-shadow": "3px 3px 0 #111111",
  "--pcm-primary-button-color": "#111111",
  "--pcm-primary-button-bankground": "#ffd23f",
  "--pcm-primary-button-hover-background": "#ffa552",
  "--pcm-secondary-button-color": "#111111",
  "--pcm-secondary-button-bankground": "#fffdf5",
  "--pcm-secondary-button-hover-background": "#fff8e9",
  "--pcm-accent-color": "#74b9ff",
  "--pcm-error-color": "#ff6b6b",
  "--pcm-success-color": "#88d498",
  "--pcm-warning-color": "#ffd23f",
  "--pcm-wallet-lable-color": "#88d498",
} satisfies Theme;

export const particleConnectKitConfig = createConfig({
  projectId: PARTICLE_PROJECT_ID,
  clientKey: PARTICLE_CLIENT_KEY,
  appId: PARTICLE_APP_ID,
  chains: PARTICLE_EVM_CHAINS,
  appearance: {
    mode: "light",
    theme: moeaziConnectTheme,
    collapseWalletList: true,
  },
  plugins: [wallet(createParticleWalletPluginOptions())],
  walletConnectors: [
    evmWalletConnectors({
      metadata: {
        name: "Moeazi",
        description:
          "Moeazi manages LINK/USDC delta-neutral strategy accounts.",
        url: "",
      },
    }),
    authWalletConnectors(),
  ],
});

export function applyParticleWalletWidgetVisibility(visible: boolean) {
  const walletPlugin = particleConnectKitConfig.plugins.find(
    (plugin) => plugin.id === "wallet",
  ) as WalletPlugin | undefined;
  document.documentElement.classList.toggle(
    "particle-wallet-widget-hidden",
    !visible,
  );
  walletPlugin?.overrideWalletOption(
    createParticleWalletPluginOptions({ visible: true }),
  );
}
