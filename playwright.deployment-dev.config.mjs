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

/** Development server matrix — next dev on port 3101 */
export default defineConfig({
  testDir: "./tests/e2e/release",
  globalSetup: "./tests/e2e/release/global-setup.dev.mjs",
  testMatch: ["deployment-matrix.spec.ts", "model-switching.spec.ts", "model-switch-390.spec.ts"],
  timeout: 300_000,
  expect: { timeout: 120_000 },
  retries: 0,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "tmp/rextora-release-completion/development/matrix-result.json" }]],
  use: {
    baseURL: process.env.REXTORA_DEV_BASE_URL ?? "http://127.0.0.1:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    // Webpack dev respects watchOptions ignores on the 2400+ job/trial tree;
    // default Turbopack stalls Settings/Agent chunk compile on operator disks.
    command:
      "REXTORA_ORPHAN_AUTO_RESUME_LIMIT=0 npm run dev -- --port 3101 --hostname 127.0.0.1 --webpack",
    url: "http://127.0.0.1:3101/api/rextora/settings/ai-providers",
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
  projects: viewports.map((vp) => ({
    name: `dev-${vp.name}`,
    use: {
      ...devices["Desktop Chrome"],
      viewport: { width: vp.width, height: vp.height },
    },
  })),
});
