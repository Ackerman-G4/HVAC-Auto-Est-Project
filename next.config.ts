import type { NextConfig } from "next";
import path from "path";
import withBundleAnalyzer from "@next/bundle-analyzer";

const nextConfig: NextConfig = {
  // Pin turbopack root to this project directory so it never
  // gets confused by lockfiles in parent folders.
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Opt out of anonymous telemetry
  // https://nextjs.org/telemetry
  experimental: {
    // Modularize large barrel-file packages so a route only bundles the
    // components/icons it actually uses (smaller first-load JS app-wide).
    optimizePackageImports: ['recharts', 'lucide-react', 'framer-motion'],
  },

  // Strict React mode catches common bugs early
  reactStrictMode: true,
};

// Opt-in, so ordinary builds are unaffected. npm sets npm_lifecycle_event to
// the script name, which avoids an inline env assignment that cmd.exe and
// PowerShell would each need different syntax for.
const analyzing =
  process.env.ANALYZE === "true" || process.env.npm_lifecycle_event === "analyze";

export default withBundleAnalyzer({ enabled: analyzing })(nextConfig);
