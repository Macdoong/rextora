import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { loadProjectEnv } from "../../scripts/loadProjectEnv.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
Object.assign(process.env, loadProjectEnv(root));
export default defineConfig({
  testDir: path.join(root, "tests/e2e/release"),
  testMatch: ["settings-browser.spec.ts"],
  timeout: 180_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3101",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
  },
});
