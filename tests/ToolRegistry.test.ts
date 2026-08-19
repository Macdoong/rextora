import { describe, expect, it } from "vitest";
import {
  assertRegistrySafe,
  getToolById,
  getToolsByCapability,
  getToolsByCategory,
  getToolsByIntent,
  listReadToolIds,
  listToolIds,
  listTools,
  listWriteToolIds,
  FORBIDDEN_TOOL_IDS,
} from "../src/lib/rextora/agent/v2/tools";

describe("ToolRegistry", () => {
  it("registers all required read and write tools", () => {
    const ids = listToolIds();
    const required = [
      "search.list",
      "search.status",
      "search.result",
      "results.list",
      "results.detail",
      "strategy.list",
      "strategy.detail",
      "backtest.list",
      "backtest.detail",
      "paper.status",
      "paper.session",
      "workspace.current",
      "workspace.get",
      "lifecycle.current",
      "lifecycle.get",
      "settings.current",
      "settings.get",
      "research.summary",
      "search.create",
      "search.start",
      "search.pause",
      "search.cancel",
      "backtest.run",
      "paper.prepare",
      "paper.approve_start",
      "paper.pause",
      "paper.resume",
      "paper.stop",
      "strategy.rename",
      "strategy.archive",
      "strategy.restore",
      "strategy.delete",
      "results.promote",
    ];
    for (const id of required) {
      expect(ids).toContain(id);
      expect(getToolById(id)).not.toBeNull();
    }
  });

  it("exposes lookup by category, capability, and intent", () => {
    expect(getToolsByCategory("search").length).toBeGreaterThan(0);
    expect(getToolsByCapability("list").some((t) => t.id === "strategy.list")).toBe(
      true,
    );
    expect(
      getToolsByIntent("prepare_search_plan").some((t) => t.id === "search.create"),
    ).toBe(true);
  });

  it("separates read and write tools", () => {
    const reads = listReadToolIds();
    const writes = listWriteToolIds();
    expect(reads).toContain("settings.current");
    expect(writes).toContain("backtest.run");
    expect(reads.some((id) => writes.includes(id))).toBe(false);
  });

  it("never registers Live / Exchange / SAFE tools", () => {
    expect(() => assertRegistrySafe()).not.toThrow();
    const ids = listToolIds();
    for (const forbidden of FORBIDDEN_TOOL_IDS) {
      expect(ids).not.toContain(forbidden);
    }
    expect(ids.some((id) => id.startsWith("live."))).toBe(false);
    expect(ids.some((id) => id.startsWith("exchange."))).toBe(false);
    expect(ids.some((id) => id.startsWith("safe."))).toBe(false);
  });

  it("every tool has required interface fields", () => {
    for (const t of listTools()) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(t.inputSchema).toBeTruthy();
      expect(t.outputSchema).toBeTruthy();
      expect(typeof t.requiresApproval).toBe("boolean");
      expect(["read", "write"]).toContain(t.executionMode);
      expect(Array.isArray(t.capabilities)).toBe(true);
      expect(typeof t.handler).toBe("function");
    }
  });
});
