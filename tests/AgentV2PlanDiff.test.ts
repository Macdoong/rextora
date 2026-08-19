import { describe, expect, it } from "vitest";
import {
  buildModifiedSearchPlan,
  diffSearchDrafts,
} from "../src/lib/rextora/agent/v2/reasoning/toolPlanBuilder";
import { buildSearchPlanDraft } from "../src/lib/rextora/agent/searchPlanDraft";

describe("AgentV2PlanDiff", () => {
  it("shows diff fields for pattern change", () => {
    const before = buildSearchPlanDraft({
      requestedSymbol: "BTCUSDT",
      requestedTimeframe: "15m",
      patternSpaceIds: ["order_block", "fvg"],
    });
    const after = buildSearchPlanDraft({
      requestedSymbol: "BTCUSDT",
      requestedTimeframe: "15m",
      patternSpaceIds: ["trendline", "support_resistance"],
    });
    const diff = diffSearchDrafts(before, after, "plan_test");
    expect(diff.fields.some((f) => f.key === "patterns")).toBe(true);
    expect(diff.previousHash).not.toBe(diff.nextHash);
  });

  it("modified plan invalidates previous hash", () => {
    const base = buildSearchPlanDraft({ requestedTimeframe: "15m" });
    const mod = buildModifiedSearchPlan({ base, timeframe: "1h" });
    expect(mod.diff.previousHash).not.toBe(mod.diff.nextHash);
    expect(mod.diff.summaryKo).toContain("타임프레임");
  });
});
