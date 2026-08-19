import { describe, expect, it } from "vitest";
import { executeTool } from "../src/lib/rextora/agent/v2/tools/toolExecutor";
import type { AnyToolDefinition } from "../src/lib/rextora/agent/v2/tools/toolTypes";
import { getToolById, listReadToolIds } from "../src/lib/rextora/agent/v2/tools";
import { emptyObjectSchema, genericOutputSchema } from "../src/lib/rextora/agent/v2/tools/toolSchemas";

function mockTool(
  partial: Partial<AnyToolDefinition> & Pick<AnyToolDefinition, "id" | "handler">,
): AnyToolDefinition {
  return {
    name: partial.name ?? partial.id,
    description: partial.description ?? "mock",
    category: partial.category ?? "research",
    inputSchema: partial.inputSchema ?? emptyObjectSchema,
    outputSchema: partial.outputSchema ?? genericOutputSchema,
    requiresApproval: partial.requiresApproval ?? false,
    executionMode: partial.executionMode ?? "read",
    capabilities: partial.capabilities ?? ["list"],
    ...partial,
  };
}

describe("ToolExecution", () => {
  it("executes a read tool through the registry path", async () => {
    const result = await executeTool({
      toolId: "mock.read",
      input: {},
      context: { sessionId: "agent_toolsexec01", approved: false },
      resolveTool: () =>
        mockTool({
          id: "mock.read",
          handler: async () => ({ hello: "world" }),
        }),
    });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ hello: "world" });
    expect(result.status).toBe("ok");
  });

  it("blocks write tools without approval before handler runs", async () => {
    let called = false;
    const result = await executeTool({
      toolId: "mock.write",
      input: { x: 1 },
      context: { approved: false },
      resolveTool: () =>
        mockTool({
          id: "mock.write",
          requiresApproval: true,
          executionMode: "write",
          handler: async () => {
            called = true;
            return { ran: true };
          },
        }),
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("denied");
    expect(called).toBe(false);
  });

  it("runs write tools when approved", async () => {
    const result = await executeTool({
      toolId: "mock.write",
      input: {},
      context: { approved: true, approvalId: "appr-1" },
      resolveTool: () =>
        mockTool({
          id: "mock.write",
          requiresApproval: true,
          executionMode: "write",
          handler: async () => ({ executed: true, exchangeCalled: false }),
        }),
    });
    expect(result.ok).toBe(true);
    expect(result.approved).toBe(true);
    expect((result.data as { executed: boolean }).executed).toBe(true);
  });

  it("returns validation_error for invalid input against real tool schema", async () => {
    const tool = getToolById("search.status");
    expect(tool).not.toBeNull();
    const result = await executeTool({
      toolId: "search.status",
      input: {},
      context: { approved: false },
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("validation_error");
  });

  it("every registered read tool is callable via executeTool", async () => {
    for (const id of listReadToolIds()) {
      const tool = getToolById(id)!;
      const result = await executeTool({
        toolId: id,
        input: {},
        context: { approved: false, sessionId: "agent_toolsexec02" },
        resolveTool: () => ({
          ...tool,
          inputSchema: emptyObjectSchema,
          handler: async () => ({ toolId: id, stub: true }),
        }),
      });
      expect(result.ok, id).toBe(true);
    }
  });

  it("surfaces handler errors as execution_error", async () => {
    const result = await executeTool({
      toolId: "mock.fail",
      input: {},
      resolveTool: () =>
        mockTool({
          id: "mock.fail",
          handler: async () => {
            throw new Error("ADAPTER_BROKE");
          },
        }),
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe("execution_error");
    expect(result.errorMessage).toContain("ADAPTER_BROKE");
  });
});
