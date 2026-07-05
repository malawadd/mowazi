import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["mowazitest.kiyan.finance"],
  webpack(config, { isServer }) {
    if (!isServer) {
      config.resolve ??= {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        "@aws-sdk/credential-providers$": path.join(
          process.cwd(),
          "node_modules/@aws-sdk/credential-providers/dist-es/index.browser.js",
        ),
      };
    }

    return config;
  },
};

export default nextConfig;
