import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeTool } from "../src/lib/rextora/agent/v2/tools/toolExecutor";
import { getToolById, listWriteToolIds } from "../src/lib/rextora/agent/v2/tools";
import { copyStrategy, createStrategy, getStrategyById } from "../src/lib/rextora/strategy/strategyStore";

import { descriptionHasLibraryArchive } from "../src/lib/rextora/strategy/libraryArchive";
import { preparePaperFromResults } from "../src/lib/rextora/paper/paperSessionService";
import { getPaperSession } from "../src/lib/rextora/paper/paperSessionStore";
import { readToolAuditLines } from "../src/lib/rextora/agent/v2/tools/toolAudit";
import { recordToolResultLifecycle } from "../src/lib/rextora/agent/v2/lifecycle/lifecycleService";
import { replayAgentEvents } from "../src/lib/rextora/agent/v2/events/eventStore";
import { RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


let root = "";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-expanded-tools-"));
  process.env.REXTORA_STRATEGIES_DIR = path.join(root, "strategies");
  process.env.REXTORA_PAPER_SESSIONS_DIR = path.join(root, "paper");
  process.env.REXTORA_BACKTESTS_DIR = path.join(root, "backtests");
  process.env.REXTORA_AGENT_TOOL_AUDIT_DIR = path.join(root, "audit");
  process.env.REXTORA_AGENT_TOOL_IDEMPOTENCY_DIR = path.join(root, "idempotency");
  process.env.REXTORA_AGENT_EVENTS_DIR = path.join(root, "events");
  process.env.REXTORA_AGENT_TASKS_DIR = path.join(root, "tasks");
  process.env.REXTORA_AGENT_MEMORY_DIR = path.join(root, "memory");
});

afterEach(() => {
  for (const key of [
    "REXTORA_STRATEGIES_DIR", "REXTORA_PAPER_SESSIONS_DIR", "REXTORA_BACKTESTS_DIR",
    "REXTORA_AGENT_TOOL_AUDIT_DIR", "REXTORA_AGENT_TOOL_IDEMPOTENCY_DIR",
    "REXTORA_AGENT_EVENTS_DIR", "REXTORA_AGENT_TASKS_DIR", "REXTORA_AGENT_MEMORY_DIR",
  ]) delete process.env[key];
  fs.rmSync(root, { recursive: true, force: true });
});

async function approved(toolId: string, input: Record<string, unknown>) {
  return executeTool({
    toolId,
    input,
    context: { sessionId: "agent_expanded_safe", approved: true, approvalId: `approval_${toolId}` },
  });
}

describe("Agent V2 expanded safe employee tools", () => {
  it("registers only approval-required writes with strict schemas", () => {
    const required = [
      "results.promote",
      "paper.approve_start", "paper.pause", "paper.resume", "paper.stop",
      "strategy.rename", "strategy.archive", "strategy.restore", "strategy.delete",
    ];
    for (const id of required) {
      const tool = getToolById(id);
      expect(listWriteToolIds()).toContain(id);
      expect(tool?.requiresApproval).toBe(true);
      expect(tool?.executionMode).toBe("write");
      expect(tool?.inputSchema.additionalProperties).toBe(false);
      expect(tool?.inputSchema.required).toContain("idempotencyKey");
    }
  });

  it("denies every new mutation before approval", async () => {
    for (const id of ["paper.approve_start", "strategy.rename", "strategy.delete"]) {
      const result = await executeTool({
        toolId: id,
        input: { sessionId: "paper_x", strategyId: "strategy_x", name: "x", idempotencyKey: `deny_${id}` },
        context: { sessionId: "agent_expanded_safe", approved: false },
      });
      expect(result.status, id).toBe("denied");
    }
  });

  it("renames, archives, restores and idempotently replays without changing params identity", async () => {
    const clone = copyStrategy(createStrategy({ name: "Employee Source" }).id, "Employee candidate");
    const storedClone = getStrategyById(clone.id)!;
    const identity = { paramsHash: storedClone.paramsHash, strategyHash: storedClone.strategyHash };
    const rename = await approved("strategy.rename", {
      strategyId: clone.id, name: "Employee renamed", idempotencyKey: "rename_once",
    });
    expect(rename.ok).toBe(true);
    expect(getStrategyById(clone.id)?.name).toBe("Employee renamed");

    const archiveInput = { strategyId: clone.id, idempotencyKey: "archive_once" };
    expect((await approved("strategy.archive", archiveInput)).ok).toBe(true);
    const archivedUpdatedAt = getStrategyById(clone.id)?.updatedAt;
    expect(descriptionHasLibraryArchive(getStrategyById(clone.id)?.description)).toBe(true);
    expect((await approved("strategy.archive", archiveInput)).ok).toBe(true);
    expect(getStrategyById(clone.id)?.updatedAt).toBe(archivedUpdatedAt);

    expect((await approved("strategy.restore", { strategyId: clone.id, idempotencyKey: "restore_once" })).ok).toBe(true);
    const restored = getStrategyById(clone.id)!;
    expect(descriptionHasLibraryArchive(restored.description)).toBe(false);
    expect({ paramsHash: restored.paramsHash, strategyHash: restored.strategyHash }).toEqual(identity);
  });

  it("runs the canonical Paper lifecycle with exchangeCalled=false and persists lifecycle events", async () => {
    const clone = copyStrategy(createStrategy({ name: "Paper Source" }).id, "Paper candidate");
    const prepared = preparePaperFromResults({ strategyId: clone.id });
    const sessionId = prepared.session.id;
    const sequence = [
      ["paper.approve_start", "active"],
      ["paper.pause", "paused"],
      ["paper.resume", "active"],
      ["paper.stop", "stopped"],
    ] as const;
    let index = 0;
    for (const [toolId, status] of sequence) {
      const result = await approved(toolId, {
        sessionId, strategyId: clone.id, idempotencyKey: `${toolId}_${index}`,
      });
      expect(result.ok, toolId).toBe(true);
      expect((result.data as { status: string }).status).toBe(status);
      expect((result.data as { exchangeCalled: boolean }).exchangeCalled).toBe(false);
      recordToolResultLifecycle({ sessionId: "agent_expanded_safe", stepId: `step_${index++}`, toolId, result });
    }
    expect(getPaperSession(sessionId)?.status).toBe("stopped");
    expect(getPaperSession(sessionId)?.exchangeCalled).toBe(false);
    const types: string[] = [];
    replayAgentEvents("agent_expanded_safe", (event) => types.push(event.type));
    expect(types).toEqual(expect.arrayContaining(["paper.activated", "paper.paused", "paper.stopped"]));
  });

  it("blocks protected deletion, permits dependency-safe deletion, and audits outcomes", async () => {
    const protectedResult = await approved("strategy.delete", {
      strategyId: RETIRED_SAFE_STRATEGY_ID, idempotencyKey: "never_delete_safe",
    });
    expect(protectedResult.ok).toBe(false);
    expect(getStrategyById(RETIRED_SAFE_STRATEGY_ID)).toBeUndefined();

    const clone = copyStrategy(createStrategy({ name: "Disposable Source" }).id, "Disposable candidate");
    const deleted = await approved("strategy.delete", {
      strategyId: clone.id, idempotencyKey: "delete_candidate_once",
    });
    expect(deleted.ok).toBe(true);
    expect(getStrategyById(clone.id)).toBeFalsy();

    const audit = readToolAuditLines(new Date().toISOString().slice(0, 10), 20);
    expect(audit.some((row) => row.toolId === "strategy.delete" && !row.result.ok)).toBe(true);
    expect(audit.some((row) => row.toolId === "strategy.delete" && row.result.ok)).toBe(true);
  });
});
