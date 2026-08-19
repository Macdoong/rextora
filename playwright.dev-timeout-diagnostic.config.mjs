import { defineConfig, devices } from "@playwright/test";
import { loadProjectEnv } from "./scripts/loadProjectEnv.mjs";

const root = process.cwd();
Object.assign(process.env, loadProjectEnv(root));

export default defineConfig({
  testDir: "./tests/e2e/release",
  testMatch: ["dev-timeout-diagnostic.spec.ts"],
  timeout: 90_000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "tmp/rextora-dev-timeout-diagnostic/experiment-c/results.json" }]],
  use: {
    baseURL: process.env.REXTORA_DEV_BASE_URL ?? "http://127.0.0.1:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "REXTORA_ORPHAN_AUTO_RESUME_LIMIT=0 npm run dev -- --port 3101 --hostname 127.0.0.1 --webpack",
    url: "http://127.0.0.1:3101/dashboard",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "dev-390",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
});
