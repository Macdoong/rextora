import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const e2eDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-e2e-data-"));
fs.mkdirSync(path.join(e2eDataRoot, "strategies"), { recursive: true });

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/release/**"],
  globalTeardown: "./tests/e2e/teardown.ts",
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
    viewport: { width: 1440, height: 1000 }
  },
  webServer: {
    command: "npx next start -p 3100",
    url: "http://127.0.0.1:3100/dashboard",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      REXTORA_DATA_DIR: e2eDataRoot,
      REXTORA_STRATEGIES_DIR: path.join(e2eDataRoot, "strategies"),
      REXTORA_ORPHAN_AUTO_RESUME_LIMIT: "0",
    }
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
