import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

/**
 * Webpack/NFT compile walks the project with fs.readdir (AfterScanDir).
 * data/rextora and .validation are runtime/validation trees, not source.
 * Watching/hashing them OOMs Node (measured: 4GB then 8GB heap, still
 * AfterScanDir). Guard is build-argv only — never next start / next-dev.
 */
function installProductionBuildScanGuard(): void {
  const g = globalThis as typeof globalThis & {
    __rextoraBuildScanGuard?: boolean;
  };
  if (g.__rextoraBuildScanGuard) return;
  if (!process.argv.includes("build")) return;
  g.__rextoraBuildScanGuard = true;

  const blockedPrefixes = [
    path.resolve(process.cwd(), "data/rextora"),
    path.resolve(process.cwd(), ".validation"),
    path.resolve(process.cwd(), "tmp"),
    path.resolve(process.cwd(), "test-results"),
    path.resolve(process.cwd(), "playwright-report"),
    path.resolve(process.cwd(), ".git"),
  ];
  const isBlocked = (input: fs.PathLike): boolean => {
    const resolved = path.resolve(String(input));
    return blockedPrefixes.some(
      (prefix) => resolved === prefix || resolved.startsWith(prefix + path.sep),
    );
  };

  const origReaddir = fs.readdir.bind(fs);
  const origReaddirSync = fs.readdirSync.bind(fs);
  fs.readdir = ((dir: fs.PathLike, options?: unknown, cb?: unknown) => {
    if (isBlocked(dir)) {
      const callback = typeof options === "function" ? options : cb;
      if (typeof callback === "function") {
        queueMicrotask(() =>
          (callback as (err: NodeJS.ErrnoException | null, files: string[]) => void)(
            null,
            [],
          ),
        );
        return;
      }
      return Promise.resolve([]);
    }
    return origReaddir(dir as never, options as never, cb as never);
  }) as typeof fs.readdir;
  fs.readdirSync = ((dir: fs.PathLike, options?: unknown) => {
    if (isBlocked(dir)) {
      return [] as never;
    }
    return origReaddirSync(dir, options as never);
  }) as typeof fs.readdirSync;
}

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true"
});

installProductionBuildScanGuard();

/**
 * Exclude non-runtime artifacts from output file tracing.
 * Supported by Next.js 16.2.x via outputFileTracingExcludes.
 * Keep patterns scoped — avoid whole-project globs that confuse Turbopack NFT.
 */
const nextConfig: NextConfig = {
  distDir: process.env.REXTORA_NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  serverExternalPackages: [
    "@rextora/runtime-paths",
    "@rextora/strategy-runtime-io",
  ],
  // Playwright and local probes use 127.0.0.1; without this Next 16 blocks dev HMR.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Next 16 `next build` defaults to Turbopack. Measured next-swc compile
  // footprint was 64–75GB on a 32GB host (swap thrash, log stuck on
  // "Creating an optimized production build" for 30+ min with no BUILD_ID).
  // Production builds use `next build --webpack` (package.json).
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
      ".validation/**/*",
      "data/rextora/strategy-search/**/*",
      "data/rextora/agent-sessions/**/*",
      "data/rextora/agent-plans-v2/**/*",
      "data/rextora/agent-tasks/**/*",
      "data/rextora/agent-approval-receipts/**/*",
      "data/rextora/agent-events/**/*",
      "data/rextora/agent-memory-v2/**/*",
      "data/rextora/agent-commands/**/*",
      "data/rextora/agent-tool-audit/**/*",
      "data/rextora/backtests/**/*",
      "data/rextora/paper-sessions/**/*",
    ],
  },
  webpack: (config) => {
    // Webpack compile snapshots the project context. A recursive AfterScanDir
    // of data/rextora (3052 job files + 254 trial trees + 4390 agent sessions)
    // OOMs the default ~4GB Node heap. watchOptions.ignored must be string
    // globs (schema rejects mixed regex arrays). snapshot.managedPaths skips
    // the compile-time directory hash of those trees.
    const ignored = [
      "**/data/rextora/**",
      "**/.validation/**",
      "**/tmp/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "**/.next/dev/**",
      "**/.next/cache/**",
      "**/.next/diagnostics/**",
    ];
    const prevIgnored = config.watchOptions?.ignored;
    config.watchOptions = {
      ...config.watchOptions,
      ignored: Array.isArray(prevIgnored)
        ? [...prevIgnored, ...ignored]
        : ignored,
    };
    const prevManaged = config.snapshot?.managedPaths;
    config.snapshot = {
      ...config.snapshot,
      managedPaths: [
        ...(Array.isArray(prevManaged) ? prevManaged : prevManaged ? [prevManaged] : []),
        /[\\/]data[\\/]rextora[\\/]/,
        /[\\/]\.validation[\\/]/,
        /[\\/]tmp[\\/]/,
      ],
    };
    return config;
  },
};

export default withBundleAnalyzer(nextConfig);
