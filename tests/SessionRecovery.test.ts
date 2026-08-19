import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAgentSession,
  patchAgentSession,
  resetAgentSession,
} from "../src/lib/rextora/agent/v2/session/sessionStore";

describe("SessionRecovery", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-agent-recover-"));
    process.env.REXTORA_AGENT_SESSIONS_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.REXTORA_AGENT_SESSIONS_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reset clears conversation and workspace fields", () => {
    const sessionId = "agent_recovery001";
    patchAgentSession({
      sessionId,
      updatedAt: new Date().toISOString(),
      conversationTurns: [
        {
          id: "t1",
          query: "테스트",
          response: null,
          error: null,
          timestamp: new Date().toISOString(),
        },
      ],
      workspace: { pinnedObjective: "목표" },
    });

    const reset = resetAgentSession(sessionId);
    expect(reset.conversationTurns).toHaveLength(0);
    expect(reset.workspace.pinnedObjective).toBeNull();
    expect(reset.pendingPlan).toBeNull();
  });

  it("bootstrap accepts client turns on empty server session", () => {
    const sessionId = "agent_recovery002";
    const patch = patchAgentSession({
      sessionId,
      updatedAt: new Date().toISOString(),
      conversationTurns: [
        {
          id: "t1",
          query: "오늘 무엇을 해야 하지?",
          response: null,
          error: null,
          timestamp: new Date().toISOString(),
        },
      ],
      entityMemory: {
        strategyId: "demo_strategy_btc_v1",
        strategyLabel: null,
        jobId: null,
        runId: null,
        symbol: "BTCUSDT",
        timeframe: "15m",
        paperSessionId: null,
        lifecycleStage: null,
        previousRecommendation: null,
        previousConclusion: null,
        previousReason: null,
        pendingProposedAction: null,
        pendingPlan: null,
        pinnedObjectiveKo: "현재 목표: 탐색",
        pipelineStage: "search_needed",
      },
    });
    expect(patch.applied).toBe(true);
    const loaded = getAgentSession(sessionId);
    expect(loaded?.conversationTurns).toHaveLength(1);
    expect(loaded?.entityMemory?.pinnedObjectiveKo).toContain("탐색");
  });
});
