import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: process.env.REXTORA_JOURNEY_SAFETY_TAIL === "1"
    ? "tester-journey-safety-tail.pw.ts"
    : process.env.REXTORA_JOURNEY_CONTINUE === "1"
      ? "tester-journey-continuation.pw.ts"
      : "tester-journey.pw.ts",
  timeout: 480_000,
  expect: { timeout: 60_000 },
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "tester-journey-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3000",
    viewport: { width: 1440, height: 1000 },
    trace: "off",
  },
});
