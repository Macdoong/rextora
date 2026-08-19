/**
 * Production-safe loader for orphan search recovery.
 * Instrumentation must not statically/dynamically import the recovery module:
 * that pulls a wide dependency graph into instrumentation NFT tracing.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

export function loadOrphanJobRecoveryModule():
  | typeof import("./orphanJobRecovery")
  | null {
  const cwd = process.cwd();
  const candidateDirs = [
    path.join(cwd, ".next/server/chunks"),
    path.join(cwd, ".next/server/chunks/ssr"),
  ];

  for (const dir of candidateDirs) {
    if (!fs.existsSync(dir)) continue;
    const match = fs
      .readdirSync(dir)
      .find(
        (name) =>
          name.startsWith("src_lib_rextora_strategySearch_orphanJobRecovery") &&
          name.endsWith(".js") &&
          !name.endsWith(".map"),
      );
    if (!match) continue;
    return require(path.join(dir, match)) as typeof import("./orphanJobRecovery");
  }

  return null;
}

export function resolveOrphanJobRecoveryForTests() {
  return import("./orphanJobRecovery");
}

// Preserve module URL for tests verifying loader ownership.
export const ORPHAN_RECOVERY_LOADER_URL = fileURLToPath(import.meta.url);
