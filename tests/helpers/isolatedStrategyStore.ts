import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const ENV_KEY = "REXTORA_STRATEGIES_DIR";

/**
 * Point strategyStore at a fresh temp directory (SAFE will be seeded by ensureStrategyStore).
 * Restores the previous REXTORA_STRATEGIES_DIR (normally the Vitest worker root) on cleanup.
 */
export function installIsolatedStrategyStore(): {
  root: string;
  cleanup: () => void;
} {
  const prev = process.env[ENV_KEY];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-strategies-"));
  process.env[ENV_KEY] = root;
  return {
    root,
    cleanup: () => {
      if (prev === undefined) delete process.env[ENV_KEY];
      else process.env[ENV_KEY] = prev;
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

export function hashFile(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function productionStrategiesDir(): string {
  return path.join(process.cwd(), "data", "rextora", "strategies");
}

export function canonicalSafeSourcePath(): string {
  return path.join(process.cwd(), "data", "strategies", "SAFE_v44_i4060.json");
}
