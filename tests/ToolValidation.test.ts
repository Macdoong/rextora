import { describe, expect, it } from "vitest";
import {
  formatValidationIssues,
  validateAgainstSchema,
} from "../src/lib/rextora/agent/v2/tools/toolValidator";
import {
  jobIdInputSchema,
  searchCreateInputSchema,
} from "../src/lib/rextora/agent/v2/tools/toolSchemas";
import { getToolById } from "../src/lib/rextora/agent/v2/tools";

describe("ToolValidation", () => {
  it("accepts valid jobId input", () => {
    const result = validateAgainstSchema(jobIdInputSchema, {
      jobId: "search_abc",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects missing required fields", () => {
    const result = validateAgainstSchema(jobIdInputSchema, {});
    expect(result.ok).toBe(false);
    expect(formatValidationIssues(result.issues)).toContain("jobId");
  });

  it("rejects unknown properties when additionalProperties is false", () => {
    const result = validateAgainstSchema(jobIdInputSchema, {
      jobId: "search_abc",
      extra: true,
    });
    expect(result.ok).toBe(false);
  });

  it("validates nested createBody for search.create", () => {
    const ok = validateAgainstSchema(searchCreateInputSchema, {
      createBody: { symbols: ["BTCUSDT"], timeframe: "15m" },
    });
    expect(ok.ok).toBe(true);

    const bad = validateAgainstSchema(searchCreateInputSchema, {});
    expect(bad.ok).toBe(false);
  });

  it("every registered tool has a usable input schema", () => {
    const tool = getToolById("strategy.detail");
    expect(tool).not.toBeNull();
    const valid = validateAgainstSchema(tool!.inputSchema, {
      strategyId: "demo",
    });
    expect(valid.ok).toBe(true);
  });
});
