import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  readToolAuditLines,
  writeToolAudit,
} from "../src/lib/rextora/agent/v2/tools/toolAudit";
import { executeTool } from "../src/lib/rextora/agent/v2/tools/toolExecutor";
import type { AnyToolDefinition } from "../src/lib/rextora/agent/v2/tools/toolTypes";
import {
  emptyObjectSchema,
  genericOutputSchema,
} from "../src/lib/rextora/agent/v2/tools/toolSchemas";

describe("ToolAudit", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-tool-audit-"));
    process.env.REXTORA_AGENT_TOOL_AUDIT_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.REXTORA_AGENT_TOOL_AUDIT_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes audit records with required fields", () => {
    const timestamp = "2026-08-02T12:00:00.000Z";
    writeToolAudit({
      toolId: "strategy.list",
      sessionId: "agent_audittest01",
      arguments: { limit: 10 },
      result: { ok: true, status: "ok", errorCode: null, summary: "ok" },
      durationMs: 12,
      approved: true,
      timestamp,
      approvalId: null,
    });
    const lines = readToolAuditLines("2026-08-02");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.toolId).toBe("strategy.list");
    expect(lines[0]?.sessionId).toBe("agent_audittest01");
    expect(lines[0]?.arguments).toEqual({ limit: 10 });
    expect(lines[0]?.durationMs).toBe(12);
    expect(lines[0]?.approved).toBe(true);
    expect(lines[0]?.timestamp).toBe(timestamp);
  });

  it("redacts secret-like argument keys", () => {
    writeToolAudit({
      toolId: "settings.current",
      sessionId: null,
      arguments: { apiKey: "secret", limit: 1 },
      result: { ok: true, status: "ok", errorCode: null },
      durationMs: 1,
      approved: true,
      timestamp: "2026-08-02T13:00:00.000Z",
      approvalId: null,
    });
    const lines = readToolAuditLines("2026-08-02");
    expect(lines.at(-1)?.arguments.apiKey).toBe("[redacted]");
    expect(lines.at(-1)?.arguments.limit).toBe(1);
  });

  it("executeTool writes an audit line on completion and denial", async () => {
    const stub: AnyToolDefinition = {
      id: "audit.stub",
      name: "stub",
      description: "stub",
      category: "research",
      inputSchema: emptyObjectSchema,
      outputSchema: genericOutputSchema,
      requiresApproval: true,
      executionMode: "write",
      capabilities: ["run"],
      handler: async () => ({ ok: true }),
    };

    await executeTool({
      toolId: "audit.stub",
      input: { foo: "bar" },
      context: { approved: false, sessionId: "agent_audittest02" },
      resolveTool: () => stub,
    });

    const day = new Date().toISOString().slice(0, 10);
    const lines = readToolAuditLines(day);
    expect(lines.some((l) => l.toolId === "audit.stub" && !l.result.ok)).toBe(
      true,
    );
  });
});
