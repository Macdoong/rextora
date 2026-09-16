/**
 * Global Vitest isolation for Rextora runtime stores.
 * Runs before every test file. Each Vitest worker gets a unique temp root.
 *
 * Production checkout data/rextora is never the writable default.
 * Specific overrides (REXTORA_STRATEGIES_DIR, etc.) still win when tests set them.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const DATA_KEY = "REXTORA_DATA_DIR";
const STRATEGIES_KEY = "REXTORA_STRATEGIES_DIR";

const workerKey =
  process.env.VITEST_POOL_ID ??
  process.env.VITEST_WORKER_ID ??
  `${process.pid}`;

const dataRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), `rextora-data-w${workerKey}-`),
);
const strategiesRoot = path.join(dataRoot, "strategies");
fs.mkdirSync(strategiesRoot, { recursive: true });

process.env[DATA_KEY] = dataRoot;
process.env[STRATEGIES_KEY] = strategiesRoot;

afterAll(() => {
  try {
    if (process.env[DATA_KEY] === dataRoot) {
      delete process.env[DATA_KEY];
    }
    if (process.env[STRATEGIES_KEY] === strategiesRoot) {
      delete process.env[STRATEGIES_KEY];
    }
  } finally {
    fs.rmSync(dataRoot, { recursive: true, force: true });
  }
});
