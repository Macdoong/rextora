import { describe, expect, it } from "vitest";
import {
  evaluateToolPolicy,
  getToolById,
  isForbiddenToolId,
} from "../src/lib/rextora/agent/v2/tools";
import { createToolContext } from "../src/lib/rextora/agent/v2/tools/toolContext";

describe("ToolPolicy", () => {
  it("denies forbidden Live / Exchange / SAFE tool ids", () => {
    expect(isForbiddenToolId("live.start")).toBe(true);
    expect(isForbiddenToolId("exchange.order")).toBe(true);
    expect(isForbiddenToolId("safe.modify")).toBe(true);
    expect(isForbiddenToolId("search.list")).toBe(false);
  });

  it("denies unknown tools", () => {
    const decision = evaluateToolPolicy(
      null,
      "unknown.tool",
      createToolContext(),
      {},
    );
    expect(decision.allow).toBe(false);
    if (!decision.allow) {
      expect(decision.code).toBe("POLICY_UNKNOWN_TOOL");
    }
  });

  it("requires approval for write tools", () => {
    const tool = getToolById("backtest.run");
    const denied = evaluateToolPolicy(
      tool,
      "backtest.run",
      createToolContext({ approved: false }),
      { strategyId: "x" },
    );
    expect(denied.allow).toBe(false);
    if (!denied.allow) {
      expect(denied.code).toBe("POLICY_APPROVAL_REQUIRED");
    }

    const allowed = evaluateToolPolicy(
      tool,
      "backtest.run",
      createToolContext({ approved: true }),
      { strategyId: "x" },
    );
    expect(allowed.allow).toBe(true);
  });

  it("allows read tools without approval", () => {
    const tool = getToolById("strategy.list");
    const decision = evaluateToolPolicy(
      tool,
      "strategy.list",
      createToolContext({ approved: false }),
      {},
    );
    expect(decision.allow).toBe(true);
  });

  it("blocks Live smuggling in write inputs", () => {
    const tool = getToolById("search.create");
    const decision = evaluateToolPolicy(
      tool,
      "search.create",
      createToolContext({ approved: true }),
      { createBody: { mode: "LIVE" }, start_live: true },
    );
    expect(decision.allow).toBe(false);
  });
});
