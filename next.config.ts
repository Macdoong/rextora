import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true"
});

/**
 * Exclude non-runtime artifacts from output file tracing.
 * Supported by Next.js 16.2.x via outputFileTracingExcludes.
 * Keep patterns scoped — avoid whole-project globs that confuse Turbopack NFT.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "@rextora/runtime-paths",
    "@rextora/strategy-runtime-io",
  ],
  // Playwright and local probes use 127.0.0.1; without this Next 16 blocks dev HMR.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Silence Next 16 default-Turbopack vs optional webpack watchOptions pairing.
  turbopack: {},
  // Runtime job/trial trees are huge and must not be watched or traced by Next.
  // Scanning them OOMs production builds and stalls next-dev Turbopack compile,
  // which prevents Settings/Agent pages from ever mounting.
  outputFileTracingExcludes: {
    "*": [
      "tmp/**/*",
      "test-results/**/*",
      "playwright-report/**/*",
      "tests/**/*",
      ".git/**/*",
      ".cursor/**/*",
      "screenshots/**/*",
      "data/rextora/strategy-search/jobs/**/*",
      "data/rextora/strategy-search/trials/**/*",
      "data/rextora/strategy-search/owners/**/*",
    ],
  },
  webpack: (config) => {
    // Dev and production: never watch/scan the multi-thousand job/trial tree.
    const ignored = [
      "**/data/rextora/strategy-search/jobs/**",
      "**/data/rextora/strategy-search/trials/**",
      "**/data/rextora/strategy-search/owners/**",
      "**/tmp/**",
      "**/test-results/**",
    ];
    const prev = config.watchOptions?.ignored;
    config.watchOptions = {
      ...config.watchOptions,
      ignored: Array.isArray(prev) ? [...prev, ...ignored] : ignored,
    };
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);
