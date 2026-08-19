import { describe, expect, it } from "vitest";
import {
  buildCancelReplacePlan,
  buildNewSearchPlan,
} from "../src/lib/rextora/agent/v2/reasoning/toolPlanBuilder";

describe("AgentV2CancelReplace", () => {
  it("builds cancel + create + start steps for exact job", () => {
    const jobId = "job_active_123";
    const { draft } = buildNewSearchPlan({
      symbol: "BTCUSDT",
      timeframe: "1h",
    });
    const steps = buildCancelReplacePlan(jobId, draft);
    expect(steps[0]?.toolId).toBe("search.cancel");
    expect(steps[0]?.arguments.jobId).toBe(jobId);
    expect(steps.some((s) => s.toolId === "search.create")).toBe(true);
    expect(steps.some((s) => s.toolId === "search.start")).toBe(true);
    expect(steps.every((s) => s.requiresApproval)).toBe(true);
  });

  it("orders cancel before create/start", () => {
    const { draft } = buildNewSearchPlan({});
    const steps = buildCancelReplacePlan("job_x", draft);
    const cancel = steps.find((s) => s.toolId === "search.cancel")!;
    const create = steps.find((s) => s.toolId === "search.create")!;
    expect(cancel.executionOrder).toBeLessThan(create.executionOrder);
  });
});
