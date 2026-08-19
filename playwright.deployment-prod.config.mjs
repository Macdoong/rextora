import { defineConfig, devices } from "@playwright/test";
import { loadProjectEnv } from "./scripts/loadProjectEnv.mjs";

const root = process.cwd();
Object.assign(process.env, loadProjectEnv(root));

const viewports = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 900 },
  { name: "1440", width: 1440, height: 1000 },
];

/** Production server matrix — requires `next start -p 3000` with authoritative BUILD_ID */
export default defineConfig({
  testDir: "./tests/e2e/release",
  testMatch: ["deployment-matrix.spec.ts", "model-switching.spec.ts", "model-switch-390.spec.ts", "settings-browser.spec.ts"],
  timeout: 300_000,
  expect: { timeout: 120_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "tmp/rextora-deployment-release/browser-production/results.json" }]],
  use: {
    baseURL: process.env.REXTORA_RELEASE_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: viewports.map((vp) => ({
    name: `prod-${vp.name}`,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width: vp.width, height: vp.height },
    },
  })),
});
