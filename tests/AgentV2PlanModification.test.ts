import { describe, expect, it } from "vitest";
import {
  buildModifiedSearchPlan,
  buildNewSearchPlan,
  detectTimeframeChange,
} from "../src/lib/rextora/agent/v2/reasoning/toolPlanBuilder";
import { buildSearchPlanDraft } from "../src/lib/rextora/agent/searchPlanDraft";

describe("AgentV2PlanModification", () => {
  it("changes timeframe and produces new request hash", () => {
    const base = buildSearchPlanDraft({
      requestedSymbol: "BTCUSDT",
      requestedTimeframe: "15m",
    });
    const modified = buildModifiedSearchPlan({
      base,
      timeframe: "1h",
    });
    expect(modified.draft.timeframe).toBe("1h");
    expect(modified.requestHash).not.toBe(
      buildNewSearchPlan({
        symbol: "BTCUSDT",
        timeframe: "15m",
      }).requestHash,
    );
    expect(modified.diff.fields.some((f) => f.key === "timeframe")).toBe(true);
  });

  it("detects Korean timeframe change requests", () => {
    expect(detectTimeframeChange("15분 말고 1시간으로 해")).toBe("1h");
    expect(detectTimeframeChange("1시간봉으로 다시 해")).toBe("1h");
  });
});
