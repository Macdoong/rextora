import { afterEach, describe, expect, it } from "vitest";
import {
  clearToolEventsForTests,
  getRecentToolEvents,
  onToolEvent,
} from "../src/lib/rextora/agent/v2/tools/toolEvents";
import { executeTool } from "../src/lib/rextora/agent/v2/tools/toolExecutor";
import type { AnyToolDefinition } from "../src/lib/rextora/agent/v2/tools/toolTypes";
import {
  emptyObjectSchema,
  genericOutputSchema,
} from "../src/lib/rextora/agent/v2/tools/toolSchemas";

describe("ToolEvents", () => {
  afterEach(() => {
    clearToolEventsForTests();
  });

  it("emits started + completed for successful tools", async () => {
    const seen: string[] = [];
    const off = onToolEvent((e) => seen.push(e.type));

    await executeTool({
      toolId: "events.ok",
      input: {},
      resolveTool: () =>
        ({
          id: "events.ok",
          name: "ok",
          description: "ok",
          category: "research",
          inputSchema: emptyObjectSchema,
          outputSchema: genericOutputSchema,
          requiresApproval: false,
          executionMode: "read",
          capabilities: ["list"],
          handler: async () => ({ ok: true }),
        }) satisfies AnyToolDefinition,
    });

    off();
    expect(seen).toEqual(["tool.started", "tool.completed"]);
  });

  it("emits started + denied when policy blocks", async () => {
    const seen: string[] = [];
    const off = onToolEvent((e) => seen.push(e.type));

    await executeTool({
      toolId: "live.start",
      input: {},
      resolveTool: () => null,
    });

    off();
    expect(seen).toEqual(["tool.started", "tool.denied"]);
  });

  it("emits started + failed on handler error", async () => {
    const seen: string[] = [];
    const off = onToolEvent((e) => seen.push(e.type));

    await executeTool({
      toolId: "events.fail",
      resolveTool: () =>
        ({
          id: "events.fail",
          name: "fail",
          description: "fail",
          category: "research",
          inputSchema: emptyObjectSchema,
          outputSchema: genericOutputSchema,
          requiresApproval: false,
          executionMode: "read",
          capabilities: ["list"],
          handler: async () => {
            throw new Error("boom");
          },
        }) satisfies AnyToolDefinition,
    });

    off();
    expect(seen).toEqual(["tool.started", "tool.failed"]);
    expect(getRecentToolEvents(5).at(-1)?.errorMessage).toContain("boom");
  });
});
