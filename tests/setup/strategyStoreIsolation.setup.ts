/**
 * Global Vitest isolation for Strategy Management storage.
 * Runs before every test file. Each Vitest worker gets a unique temp root.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll } from "vitest";

const ENV_KEY = "REXTORA_STRATEGIES_DIR";

const workerKey =
  process.env.VITEST_POOL_ID ??
  process.env.VITEST_WORKER_ID ??
  `${process.pid}`;

const root = fs.mkdtempSync(
  path.join(os.tmpdir(), `rextora-strategies-w${workerKey}-`),
);

process.env[ENV_KEY] = root;

afterAll(() => {
  try {
    if (process.env[ENV_KEY] === root) {
      delete process.env[ENV_KEY];
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
