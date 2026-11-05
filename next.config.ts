import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost", "terminal.local"],
  webpack(config, { webpack, dev }) {
    if (dev) config.devtool = false;
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /^cloudflare:workers$/,
      path.resolve(process.cwd(), "db/node-env.ts"),
    ));
    return config;
  },
};

export default nextConfig;
