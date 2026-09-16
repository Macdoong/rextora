/**
 * STEP 8 — Product Completion acceptance tests.
 * Global assistant, shared session, mission timeline, approval center.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "path";
import { detectGoal } from "../src/lib/rextora/agent/goalDetector";
import { buildAgentResponse } from "../src/lib/rextora/agent/agentResponseBuilder";
import {
  emptyEntityMemory,
} from "../src/lib/rextora/agent/conversationContext";
import {
  buildMissionTimeline,
  emptyMissionTimeline,
} from "../src/lib/rextora/agent/missionTimeline";
import {
  buildApprovalDraft,
  planDraftToFacts,
  searchPlanToAgentPlan,
} from "../src/lib/rextora/agent/planDrafts";
import { buildSearchPlanDraft } from "../src/lib/rextora/agent/searchPlanDraft";
import { checkIntentSafety } from "../src/lib/rextora/agent/safetyGuard";
import type { FactItem } from "../src/lib/rextora/agent/types";

function fact(labelKo: string, value: string): FactItem {
  return {
    labelKo,
    value,
    source: "system_status",
    fetchedAt: new Date().toISOString(),
  };
}

describe("STEP 8 product completion contracts", () => {
  it("keeps Research Brain questions ahead of broad search/backtest goals", () => {
    expect(detectGoal({ query: "두 전략 중 무엇을 먼저 백테스트해야 해?" }).intent.type)
      .toBe("research_analysis");
    expect(detectGoal({ query: "아직 검증하지 않은 패턴 조합을 찾아줘" }).intent.type)
      .toBe("research_analysis");
  });

  it("mounts global assistant shell and shared session provider", () => {
    const layout = fs.readFileSync(
      path.join(process.cwd(), "app/layout.tsx"),
      "utf8",
    );
    const globalShell = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/shell/GlobalShell.tsx"),
      "utf8",
    );
    const appShell = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/agent/AppShell.tsx"),
      "utf8",
    );
    const global = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/agent/GlobalAgentAssistant.tsx",
      ),
      "utf8",
    );
    const dashboard = fs.readFileSync(
      path.join(process.cwd(), "app/dashboard/page.tsx"),
      "utf8",
    );
    expect(layout).toContain("AppShellGate");
    expect(globalShell).toContain("AgentSessionProvider");
    expect(globalShell).toMatch(/<AgentSessionProvider[\s>]/);
    expect(appShell).not.toMatch(/import\s+\{[^}]*AgentSessionProvider/);
    expect(appShell).not.toMatch(/<AgentSessionProvider[\s>]/);
    expect(appShell).toContain("GlobalAgentAssistant");
    expect(appShell).toContain("ClientHydrated");
    expect(global).toContain("global-agent-fab");
    expect(dashboard).toContain("shared");
  });

  it("persists workspace beyond sessionStorage", () => {
    const persist = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/agent/agentPersistence.ts"),
      "utf8",
    );
    expect(persist).toContain("localStorage");
    expect(persist).toContain("rextora.agent.workspace");
    expect(persist).toContain("persistWorkspaceBundle");
  });

  it("detects continue / waiting / rejection explainability goals", () => {
    const continueGoal = detectGoal({ query: "이어서 하자" });
    expect(continueGoal.intent.type).toBe("continue_session");
    expect(continueGoal.intent.type).not.toBe("unknown");

    const waiting = detectGoal({
      query: "왜 기다리는 거야?",
      entities: {
        ...emptyEntityMemory(),
        pendingProposedAction: {
          actionId: "pa1",
          actionType: "prepare_search_plan",
          summary: "탐색 계획",
          reason: "테스트",
          targetRoute: "/strategy-search",
          strategyId: null,
          jobId: null,
          runId: null,
          symbol: "BTCUSDT",
          timeframe: "15m",
          parameters: {},
          requiresApproval: true,
          riskLevel: "low",
          blockedReason: null,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        },
      },
    });
    expect(waiting.intent.type).toBe("explain_waiting");

    const rejected = detectGoal({ query: "왜 거부됐어?" });
    expect(["explain_rejection", "follow_up_why", "recommend_next"]).toContain(
      rejected.intent.type,
    );
  });

  it("builds mission timeline with objective, approvals, next, blockers", () => {
    const draft = buildSearchPlanDraft({ requestedSymbol: "BTC" });
    const plan = buildApprovalDraft(searchPlanToAgentPlan(draft));
    const timeline = buildMissionTimeline({
      entities: {
        ...emptyEntityMemory(),
        pinnedObjectiveKo: "탐색 계획 승인",
        pipelineStage: "search_needed",
        pendingPlan: plan,
        pendingProposedAction: draft.proposedAction,
        previousReason: "완료된 탐색이 없습니다.",
      },
      pendingAction: draft.proposedAction,
      pendingPlan: plan,
    });
    expect(timeline.currentObjectiveKo).toBeTruthy();
    expect(timeline.pendingApprovals.length).toBeGreaterThan(0);
    expect(timeline.nextRecommendation?.status).toBe("next");
    expect(timeline.blockersKo.length).toBeGreaterThan(0);
    expect(timeline.whyWaitingKo).toMatch(/승인|엔진/);
    expect(emptyMissionTimeline().progressPct).toBeGreaterThan(0);
  });

  it("response includes mission timeline and never auto-executes", () => {
    const detected = detectGoal({ query: "좋은 전략을 찾아줘." });
    const draft = buildSearchPlanDraft({ requestedSymbol: "BTC" });
    const plan = buildApprovalDraft(searchPlanToAgentPlan(draft));
    const response = buildAgentResponse(
      detected.intent,
      planDraftToFacts(plan),
      undefined,
      { symbol: "BTCUSDT" },
      {
        entities: emptyEntityMemory(),
        explicitProposedAction: draft.proposedAction,
        explicitPlan: plan,
        goal: detected.goal,
      },
    );
    expect(response.missionTimeline).toBeTruthy();
    expect(response.missionTimeline?.pendingApprovals.length).toBeGreaterThan(0);
    expect(response.actions.length).toBeLessThanOrEqual(1);
    expect(response.plan?.requiresApproval).toBe(true);
    expect(JSON.stringify(response)).not.toMatch(/executionStarted":\s*true/);
  });

  it("continue session restores pending approval path", () => {
    const entities = {
      ...emptyEntityMemory(),
      pinnedObjectiveKo: "탐색 계획 승인",
      previousRecommendation: "탐색 계획 검토",
      previousConclusion: "탐색 계획을 준비했습니다.",
      previousReason: "완료된 탐색이 없습니다.",
      pendingProposedAction: {
        actionId: "pa-continue",
        actionType: "prepare_search_plan" as const,
        summary: "탐색 계획 검토",
        reason: "완료된 탐색이 없습니다.",
        targetRoute: "/strategy-search",
        strategyId: null,
        jobId: null,
        runId: null,
        symbol: "BTCUSDT",
        timeframe: "15m",
        parameters: {},
        requiresApproval: true,
        riskLevel: "low" as const,
        blockedReason: null,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    };
    const detected = detectGoal({ query: "이어서 하자", entities });
    const facts = [
      fact("권장 다음 작업", "탐색 계획 검토"),
      fact("권장 사유", "완료된 탐색이 없습니다."),
      fact("권장 이동 경로", "/strategy-search"),
    ];
    const response = buildAgentResponse(detected.intent, facts, undefined, null, {
      entities,
      goal: detected.goal,
    });
    expect(response.intentType).toBe("continue_session");
    expect(response.conclusionKo).toMatch(/이어서|검토/);
    expect(response.missionTimeline?.whyWaitingKo || response.explanationKo).toBeTruthy();
  });

  it("safety still blocks execution intents", () => {
    expect(checkIntentSafety("execute_trade").allowed).toBe(false);
    expect(checkIntentSafety("start_live").allowed).toBe(false);
    expect(checkIntentSafety("continue_session").allowed).toBe(true);
    expect(checkIntentSafety("explain_waiting").allowed).toBe(true);
  });

  it("lifecycle pages keep context strips that open global assistant", () => {
    const strip = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/agent/AgentContextStrip.tsx",
      ),
      "utf8",
    );
    expect(strip).toContain("requestOpenAssistant");
    expect(strip).toContain("이어서 대화");
    for (const rel of [
      "app/strategy-search/page.tsx",
      "app/results/page.tsx",
      "app/backtest/page.tsx",
      "app/paper-trading/page.tsx",
      "app/live-trading/page.tsx",
    ]) {
      expect(
        fs.readFileSync(path.join(process.cwd(), rel), "utf8"),
      ).toContain("AgentContextStrip");
    }
  });
});
