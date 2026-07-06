import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
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
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
