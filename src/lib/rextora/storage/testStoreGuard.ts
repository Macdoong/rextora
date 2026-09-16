/**
 * Fail-closed test-runtime protection against writing the real checkout
 * data/rextora tree. Production runtime is never gated here.
 *
 * Reads of production snapshots remain allowed. Only mutations are blocked.
 */

import path from "node:path";
import { productionRextoraDataRootCanonical } from "./runtimePaths";

export const UNSAFE_TEST_REXTORA_STORE =
  "UNSAFE_TEST_REXTORA_STORE: Test writes must use an isolated REXTORA_DATA_DIR.";

/** Detect Vitest / NODE_ENV=test without relying on a single flag. */
export function isRextoraTestRuntime(): boolean {
  if (process.env.VITEST === "true" || process.env.VITEST === "1") return true;
  if (typeof process.env.VITEST_WORKER_ID !== "undefined") return true;
  if (process.env.NODE_ENV === "test") return true;
  return false;
}

function checkoutProductionRextoraDataRoot(): string {
  // Stable against process.chdir() during tests.
  return path.resolve(__dirname, "../../../../data/rextora");
}

function productionRoots(): string[] {
  return [
    path.resolve(productionRextoraDataRootCanonical()),
    checkoutProductionRextoraDataRoot(),
  ];
}

export function isPathInsideProductionRextoraStore(resolvedPath: string): boolean {
  const abs = path.resolve(resolvedPath);
  return productionRoots().some((prod) => {
    const prefix = prod.endsWith(path.sep) ? prod : prod + path.sep;
    return abs === prod || abs.startsWith(prefix);
  });
}

/**
 * Throw before a test-runtime write if the target is the real production
 * data/rextora tree. No-op outside test runtimes.
 */
export function assertTestStoreIsNotProduction(resolvedPath: string): void {
  if (!isRextoraTestRuntime()) return;
  if (!resolvedPath || resolvedPath.trim() === "") {
    throw new Error(UNSAFE_TEST_REXTORA_STORE);
  }
  if (isPathInsideProductionRextoraStore(resolvedPath)) {
    throw new Error(
      `${UNSAFE_TEST_REXTORA_STORE} Refusing write to production path: ${path.resolve(resolvedPath)}`,
    );
  }
}
