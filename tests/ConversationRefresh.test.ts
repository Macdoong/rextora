import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAgentSession,
  patchAgentSession,
} from "../src/lib/rextora/agent/v2/session/sessionStore";

describe("ConversationRefresh", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-agent-refresh-"));
    process.env.REXTORA_AGENT_SESSIONS_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.REXTORA_AGENT_SESSIONS_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("GET-equivalent reload restores full conversation after PATCH", () => {
    const sessionId = "agent_refresh001";
    const now = new Date().toISOString();

    patchAgentSession({
      sessionId,
      updatedAt: now,
      conversationTurns: [
        {
          id: "t1",
          query: "오늘 무엇을 해야 하지?",
          response: null,
          error: null,
          timestamp: now,
        },
        {
          id: "t2",
          query: "좋은 전략을 찾아줘.",
          response: null,
          error: null,
          timestamp: now,
        },
      ],
      workspace: {
        pinnedObjective: "현재 목표: 실전 승인 게이트 검토",
        currentPage: "/dashboard",
      },
      missionTimeline: {
        currentObjectiveKo: "현재 목표: 실전 승인 게이트 검토",
        completed: [],
        pending: [],
        pendingApprovals: [
          {
            id: "pa-1",
            labelKo: "백테스트 계획 검토",
            status: "awaiting_approval",
          },
        ],
        nextRecommendation: null,
        lifecycleStage: "live_review",
        lifecycleLabelKo: "실전 검토",
        blockersKo: [],
        whyRecommendedKo: null,
        whyRejectedKo: null,
        whyWaitingKo: "승인 대기",
        progressPct: 80,
        updatedAt: now,
      },
    });

    const reloaded = getAgentSession(sessionId);
    expect(reloaded?.conversationTurns).toHaveLength(2);
    expect(reloaded?.workspace.pinnedObjective).toContain("실전 승인");
    expect(reloaded?.missionTimeline?.pendingApprovals).toHaveLength(1);
  });

  it("stale client patch loses to server snapshot on refresh conflict", () => {
    const sessionId = "agent_refresh002";
    const serverTime = new Date(Date.now() + 60_000).toISOString();
    const staleClientTime = new Date(Date.now() - 60_000).toISOString();

    patchAgentSession({
      sessionId,
      updatedAt: serverTime,
      workspace: { pinnedObjective: "서버 권위 목표" },
    });

    const conflict = patchAgentSession({
      sessionId,
      updatedAt: staleClientTime,
      workspace: { pinnedObjective: "오래된 클라이언트" },
    });

    expect(conflict.applied).toBe(false);
    expect(conflict.session.workspace.pinnedObjective).toBe("서버 권위 목표");

    const reloaded = getAgentSession(sessionId);
    expect(reloaded?.workspace.pinnedObjective).toBe("서버 권위 목표");
  });
});
