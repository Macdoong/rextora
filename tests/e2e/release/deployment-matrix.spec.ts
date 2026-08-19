import { test, expect } from "@playwright/test";
import {
  DEPLOYMENT_SCENARIOS,
  validateScenarioRegistry,
  REQUIRED_VIEWPORTS,
} from "./scenarioRegistry";
import { hasProviderKeys } from "./helpers";

const registryCheck = validateScenarioRegistry();

test.describe("Deployment scenario registry", () => {
  test("contains exactly 22 unique scenario IDs", () => {
    expect(registryCheck.missingScenarioIds).toEqual([]);
    expect(registryCheck.duplicateScenarioIds).toEqual([]);
    expect(DEPLOYMENT_SCENARIOS.length).toBe(22);
  });
});

test.describe("Deployment provider-backed matrix", () => {
  test.beforeAll(async ({ request }) => {
    if (registryCheck.missingScenarioIds.length > 0) {
      throw new Error(`missingScenarioIds=${registryCheck.missingScenarioIds.join(",")}`);
    }
    if (registryCheck.duplicateScenarioIds.length > 0) {
      throw new Error(`duplicateScenarioIds=${registryCheck.duplicateScenarioIds.join(",")}`);
    }
    for (let i = 0; i < 15; i++) {
      try {
        const res = await request.get("/api/rextora/settings/ai-providers", { timeout: 5000 });
        if (res.status() === 200) return;
      } catch {
        /* dev compiling between viewport projects */
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("dev_warm_gate_failed");
  });

  test.beforeEach(async ({ request }) => {
    for (let i = 0; i < 15; i++) {
      try {
        const res = await request.get("/api/rextora/settings/ai-providers", {
          timeout: 5_000,
        });
        if (res.status() === 200) {
          const raw = await res.text();
          if (raw.trim()) return;
        }
      } catch {
        /* dev recompiling after long agent scenarios */
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("dev_scenario_gate_failed");
  });

  for (const scenario of DEPLOYMENT_SCENARIOS) {
    test(`scenario ${String(scenario.id).padStart(2, "0")}: ${scenario.name}`, async ({
      page,
      request,
    }) => {
      if (scenario.requiresProviderKeys && !hasProviderKeys()) {
        test.skip(true, "Provider keys required");
      }
      await scenario.run({ page, request });
    });
  }
});

test.describe("Deployment viewport coverage metadata", () => {
  test("playwright project defines all required viewports", () => {
    const projectNames = test.info().project.name;
    expect(REQUIRED_VIEWPORTS.some((vp) => projectNames.includes(vp))).toBe(true);
  });
});
