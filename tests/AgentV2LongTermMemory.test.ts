import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendVerifiedMemory,
  exportVerifiedMemory,
  readMemoryRecords,
  rebuildMemoryIndex,
  rememberApprovedPlan,
  evaluateFailedConfigurationReuse,
  reflectOnTerminalEvent,
  resetVerifiedMemory,
  searchVerifiedMemory,
} from "../src/lib/rextora/agent/v2/memory";
import type { AgentEvent } from "../src/lib/rextora/agent/v2/events";
import { approvePlanV2, createPlanV2 } from "../src/lib/rextora/agent/v2/planner";

let root = "";
const sessionId = "agent_memory_test";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-memory-"));
  process.env.REXTORA_AGENT_MEMORY_DIR = root;
});

afterEach(() => {
  delete process.env.REXTORA_AGENT_MEMORY_DIR;
  fs.rmSync(root, { recursive: true, force: true });
});

function record(overrides: Record<string, unknown> = {}) {
  return {
    sessionId,
    kind: "approved_plan" as const,
    statementKo: "1시간봉 대체 탐색 계획을 승인했습니다.",
    evidenceRefs: [{ type: "plan" as const, id: "plan_verified" }],
    verifiedAt: "2026-08-03T00:00:00.000Z",
    sourceEventId: null,
    metadata: { approved: true },
    ...overrides,
  };
}

describe("Agent V2 server-authoritative long-term memory", () => {
  it("stores only evidence-linked verified records and deduplicates replay", () => {
    expect(appendVerifiedMemory(record()).appended).toBe(true);
    expect(appendVerifiedMemory(record()).appended).toBe(false);
    expect(readMemoryRecords(sessionId)).toHaveLength(1);
    expect(readMemoryRecords(sessionId)[0].evidenceRefs[0].id).toBe("plan_verified");
  });

  it("rejects missing evidence and secret-shaped content", () => {
    expect(() => appendVerifiedMemory(record({ evidenceRefs: [] }))).toThrow("memory_evidence_required");
    expect(() => appendVerifiedMemory(record({
      statementKo: "credential sk-abcdefghijklmnopqrstuvwxyz",
    }))).toThrow("memory_secret_rejected");
    expect(() => appendVerifiedMemory(record({ metadata: { apiKey: "hidden" } }))).toThrow("memory_secret_rejected");
  });

  it("rebuilds a searchable derived index from append-only records", () => {
    appendVerifiedMemory(record());
    appendVerifiedMemory(record({
      kind: "failure_reason",
      statementKo: "수수료 비용 기준을 통과하지 못해 이전 설정을 제외했습니다.",
      evidenceRefs: [{ type: "job", id: "search_failed_real" }],
    }));
    const index = rebuildMemoryIndex(sessionId);
    expect(index.entries).toHaveLength(2);
    const found = searchVerifiedMemory(sessionId, "수수료 이전 설정");
    expect(found[0].evidenceRefs[0].id).toBe("search_failed_real");
  });

  it("reflects only actual terminal outcomes and links entity plus event evidence", () => {
    const base: AgentEvent = {
      eventId: "event_terminal_real",
      type: "search.completed",
      sessionId,
      entityId: "search_real_job",
      taskId: "task_real",
      at: "2026-08-03T01:00:00.000Z",
      source: "engine_store",
      payload: { status: "completed" },
    };
    expect(reflectOnTerminalEvent({ ...base, type: "search.progress" })).toBe(0);
    expect(reflectOnTerminalEvent(base)).toBe(1);
    expect(reflectOnTerminalEvent(base)).toBe(0);
    const memory = readMemoryRecords(sessionId)[0];
    expect(memory.kind).toBe("actual_result");
    expect(memory.evidenceRefs).toEqual([
      { type: "job", id: "search_real_job" },
      { type: "event", id: "event_terminal_real" },
    ]);
  });

  it("does not fabricate an absent failure reason", () => {
    reflectOnTerminalEvent({
      eventId: "event_failed_real",
      type: "backtest.failed",
      sessionId,
      entityId: "run_real",
      taskId: null,
      at: "2026-08-03T02:00:00.000Z",
      source: "engine_store",
      payload: {},
    });
    expect(readMemoryRecords(sessionId)[0].statementKo).toContain("구체 원인은 기록되지 않았습니다");
  });

  it("exports and explicitly resets operator memory", () => {
    appendVerifiedMemory(record());
    const exported = exportVerifiedMemory(sessionId);
    expect(exported.records).toHaveLength(1);
    expect(exported.records[0].metadata).not.toHaveProperty("apiKey");
    expect(resetVerifiedMemory(sessionId)).toBe(1);
    expect(readMemoryRecords(sessionId)).toEqual([]);
  });

  it("remembers an approved goal and plan but never a draft", () => {
    const draft = createPlanV2({ sessionId, goal: "겹치지 않는 새 탐색" });
    expect(rememberApprovedPlan(draft)).toBe(0);
    expect(rememberApprovedPlan(approvePlanV2(draft, "approval_real"))).toBe(2);
    expect(readMemoryRecords(sessionId).map((item) => item.kind)).toEqual([
      "approved_goal",
      "approved_plan",
    ]);
  });

  it("blocks failed configuration reuse until a justification is provided", () => {
    appendVerifiedMemory(record({
      kind: "failure_reason",
      statementKo: "검증된 실패 설정입니다.",
      evidenceRefs: [{ type: "job", id: "search_failed" }],
      metadata: { configurationHash: "config_failed" },
    }));
    expect(evaluateFailedConfigurationReuse({ sessionId, configurationHash: "config_failed" }).allowed).toBe(false);
    expect(evaluateFailedConfigurationReuse({
      sessionId,
      configurationHash: "config_failed",
      justification: "비용 조건을 변경해 재검증",
    }).allowed).toBe(true);
  });
});
