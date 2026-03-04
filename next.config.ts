import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Pin turbopack root to this project directory so it never
  // gets confused by lockfiles in parent folders.
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Opt out of anonymous telemetry
  // https://nextjs.org/telemetry
  experimental: {},

  // Strict React mode catches common bugs early
  reactStrictMode: true,
};

export default nextConfig;
