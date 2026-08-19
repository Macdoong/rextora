import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSessionOnDisk,
  loadSessionRecord,
  saveSessionRecord,
  sessionExists,
} from "../src/lib/rextora/agent/v2/session/sessionPersistence";
import {
  getAgentSession,
  patchAgentSession,
  resetAgentSession,
} from "../src/lib/rextora/agent/v2/session/sessionStore";
import type { PersistedConversationTurn } from "../src/lib/rextora/agent/v2/session/sessionTypes";

describe("AgentSessionPersistence", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-agent-session-"));
    process.env.REXTORA_AGENT_SESSIONS_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.REXTORA_AGENT_SESSIONS_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates session directory layout with required files", () => {
    const sessionId = "agent_testlayout01";
    createSessionOnDisk(sessionId);
    const dir = path.join(tmpDir, sessionId);
    expect(fs.existsSync(path.join(dir, "metadata.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "workspace.json"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "turns.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "events.jsonl"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "plans"))).toBe(true);
  });

  it("persists and reloads conversation turns via jsonl", () => {
    const sessionId = "agent_testturns001";
    const record = createSessionOnDisk(sessionId);
    const turns: PersistedConversationTurn[] = [
      {
        id: "turn-1",
        query: "오늘 무엇을 해야 하지?",
        response: null,
        error: null,
        timestamp: new Date().toISOString(),
      },
      {
        id: "turn-2",
        query: "좋은 전략을 찾아줘.",
        response: null,
        error: null,
        timestamp: new Date().toISOString(),
      },
    ];
    saveSessionRecord({ ...record, conversationTurns: turns, updatedAt: new Date().toISOString() });
    const loaded = loadSessionRecord(sessionId);
    expect(loaded?.conversationTurns).toHaveLength(2);
    expect(loaded?.conversationTurns[0]?.query).toContain("오늘");
  });

  it("patchAgentSession stores pending plan under plans/", () => {
    const sessionId = "agent_testplan001";
    createSessionOnDisk(sessionId);
    const result = patchAgentSession({
      sessionId,
      // Client clock must be strictly newer than server create timestamp.
      updatedAt: new Date(Date.now() + 5_000).toISOString(),
      pendingPlan: {
        kind: "search_plan",
        titleKo: "탐색 계획",
        summaryKo: "테스트",
        fields: [],
        estimatedScopeKo: "BTCUSDT",
        executionStarted: false,
        requiresApproval: true,
        validationOk: true,
        validationIssues: [],
        proposedAction: {
          actionId: "act-1",
          actionType: "prepare_search_plan",
          summary: "plan",
          reason: "test",
          targetRoute: "/strategy-search",
          strategyId: null,
          jobId: null,
          runId: null,
          symbol: "BTCUSDT",
          timeframe: "15m",
          parameters: {},
          requiresApproval: true,
          riskLevel: "medium",
          blockedReason: null,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60000).toISOString(),
        },
        reviewRoute: "/strategy-search",
        openRoute: "/strategy-search",
      },
    });
    expect(result.applied).toBe(true);
    expect(sessionExists(sessionId)).toBe(true);
    const loaded = getAgentSession(sessionId);
    expect(loaded?.pendingPlan?.kind).toBe("search_plan");
  });
});
