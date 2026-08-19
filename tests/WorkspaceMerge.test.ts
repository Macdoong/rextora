import { describe, expect, it } from "vitest";
import {
  buildWorkspaceSnapshot,
  mergeSessionPatch,
  mergeWorkspaceSnapshot,
} from "../src/lib/rextora/agent/v2/session/workspaceMerge";
import {
  createEmptySession,
  emptyWorkspaceSnapshot,
} from "../src/lib/rextora/agent/v2/session/sessionTypes";

describe("WorkspaceMerge", () => {
  it("server wins when client updatedAt is older", () => {
    const server = createEmptySession("agent_merge001");
    server.updatedAt = "2026-08-02T10:00:00.000Z";
    server.workspace.pinnedObjective = "서버 목표";

    const result = mergeSessionPatch(server, {
      sessionId: "agent_merge001",
      updatedAt: "2026-08-02T09:00:00.000Z",
      workspace: { pinnedObjective: "클라이언트 목표" },
    });

    expect(result.applied).toBe(false);
    expect(result.source).toBe("server");
    expect(result.record.workspace.pinnedObjective).toBe("서버 목표");
  });

  it("client wins when updatedAt is newer", () => {
    const server = createEmptySession("agent_merge002");
    server.updatedAt = "2026-08-02T09:00:00.000Z";

    const result = mergeSessionPatch(
      server,
      {
        sessionId: "agent_merge002",
        updatedAt: "2026-08-02T10:00:00.000Z",
        workspace: { pinnedObjective: "클라이언트 목표" },
      },
      "2026-08-02T10:00:01.000Z",
    );

    expect(result.applied).toBe(true);
    expect(result.record.workspace.pinnedObjective).toBe("클라이언트 목표");
  });

  it("server wins when updatedAt is equal", () => {
    const server = createEmptySession("agent_merge003");
    server.updatedAt = "2026-08-02T10:00:00.000Z";
    server.workspace.currentSymbol = "BTCUSDT";

    const result = mergeSessionPatch(server, {
      sessionId: "agent_merge003",
      updatedAt: "2026-08-02T10:00:00.000Z",
      workspace: { currentSymbol: "ETHUSDT" },
    });

    expect(result.applied).toBe(false);
    expect(result.record.workspace.currentSymbol).toBe("BTCUSDT");
  });

  it("mergeWorkspaceSnapshot preserves arrays when omitted", () => {
    const base = emptyWorkspaceSnapshot();
    base.currentBlockers = ["승인 대기"];
    const merged = mergeWorkspaceSnapshot(base, { currentPage: "/dashboard" }, "2026-08-02T11:00:00.000Z");
    expect(merged.currentPage).toBe("/dashboard");
    expect(merged.currentBlockers).toEqual(["승인 대기"]);
  });

  it("buildWorkspaceSnapshot maps lifecycle context and entity memory", () => {
    const ws = buildWorkspaceSnapshot({
      context: {
        route: "/backtest",
        strategyId: "custom_abc",
        jobId: "search_job_1",
        runId: "bt_run_1",
        symbol: "BTCUSDT",
        timeframe: "15m",
      },
      entityMemory: {
        strategyId: "custom_abc",
        strategyLabel: "Test",
        jobId: "search_job_1",
        runId: "bt_run_1",
        symbol: "BTCUSDT",
        timeframe: "15m",
        paperSessionId: null,
        lifecycleStage: null,
        previousRecommendation: "백테스트 검토",
        previousConclusion: null,
        previousReason: null,
        pendingProposedAction: null,
        pendingPlan: null,
        pinnedObjectiveKo: "현재 목표: 백테스트",
        pipelineStage: "backtest_review",
      },
    });
    expect(ws.currentPage).toBe("/backtest");
    expect(ws.currentStrategyId).toBe("custom_abc");
    expect(ws.currentSearchJobId).toBe("search_job_1");
    expect(ws.pinnedObjective).toBe("현재 목표: 백테스트");
    expect(ws.currentRecommendation).toBe("백테스트 검토");
  });
});
