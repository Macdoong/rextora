import { test, expect } from "@playwright/test";
import { DEPLOYMENT_SCENARIOS } from "./scenarioRegistry";

const s01 = DEPLOYMENT_SCENARIOS.find((s) => s.id === 1)!;
const s02 = DEPLOYMENT_SCENARIOS.find((s) => s.id === 2)!;

test.describe("Experiment C — matrix semantics 01 then 02", () => {
  test("scenario 01 then 02 @390 with 60s cap on 02", async ({ page, request }, testInfo) => {
    const checkpoints: Array<{ id: string; ms: number; note?: string }> = [];
    const t0 = Date.now();
    const mark = (id: string, note?: string) => checkpoints.push({ id, ms: Date.now() - t0, note });

    mark("C0", "start");
    await s01.run({ page, request });
    mark("C1", "scenario01_complete");

    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });

    const s02Promise = s02.run({ page, request });
    const timeoutPromise = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("scenario02_60s_diagnostic_cap")), 60_000),
    );

    let passed = false;
    let failure: string | null = null;
    try {
      await Promise.race([s02Promise, timeoutPromise]);
      passed = true;
      mark("C2", "scenario02_complete");
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
      mark("C2", `scenario02_failed:${failure}`);
      await page.screenshot({ path: testInfo.outputPath("experiment-c-failure.png"), fullPage: true }).catch(() => {});
    }

    await testInfo.attach("checkpoints", {
      body: JSON.stringify({ checkpoints, consoleErrors: errors, passed, failure }, null, 2),
      contentType: "application/json",
    });

    if (!passed) {
      throw new Error(failure ?? "scenario02_failed");
    }
  });
});
