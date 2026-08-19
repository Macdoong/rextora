/**
 * STEP 5 — AI Trading Employee commercial control plane contracts.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseIntent } from "../src/lib/rextora/agent/intentParser";
import { checkIntentSafety } from "../src/lib/rextora/agent/safetyGuard";
import { buildAgentResponse } from "../src/lib/rextora/agent/agentResponseBuilder";
import {
  detectFollowUpKind,
  emptyEntityMemory,
  mergeEntityMemory,
} from "../src/lib/rextora/agent/conversationContext";
import {
  buildApprovalDraft,
  buildBacktestPlanDraft,
  buildPaperPlanDraft,
  buildRiskReviewDraft,
  buildResearchSummaryDraft,
  planDraftToFacts,
  searchPlanToAgentPlan,
} from "../src/lib/rextora/agent/planDrafts";
import { buildSearchPlanDraft } from "../src/lib/rextora/agent/searchPlanDraft";
import {
  inferLifecycleStage,
  LIFECYCLE_NEXT_MILESTONE_KO,
} from "../src/lib/rextora/agent/lifecycleStage";
import type { FactItem } from "../src/lib/rextora/agent/types";

function fact(labelKo: string, value: string): FactItem {
  return {
    labelKo,
    value,
    source: "system_status",
    fetchedAt: new Date().toISOString(),
  };
}

describe("planning objects (draft only)", () => {
  it("builds Search / Backtest / Paper / Risk / Research / Approval plans without execution", () => {
    const search = buildSearchPlanDraft({ requestedSymbol: "BTC" });
    const searchPlan = searchPlanToAgentPlan(search);
    const approval = buildApprovalDraft(searchPlan);
    const backtest = buildBacktestPlanDraft({
      strategyLabel: "SAFE_v44_i4060",
      symbol: "BTCUSDT",
    });
    const paper = buildPaperPlanDraft({ strategyLabel: "SAFE_v44_i4060" });
    const risk = buildRiskReviewDraft({
      mdd: "12%",
      totalReturn: "8%",
      symbol: "BTCUSDT",
    });
    const research = buildResearchSummaryDraft({
      stage: "search_needed",
      jobsTotal: "0개",
      jobsCompleted: "0개",
      jobsRunning: "0개",
    });

    for (const plan of [approval, backtest, paper, risk, research]) {
      expect(plan.executionStarted).toBe(false);
      expect(plan.fields.some((f) => f.value.includes("시작되지 않음") || f.key === "milestone" || f.key === "note")).toBe(
        true,
      );
      expect(plan.proposedAction.targetRoute.startsWith("/")).toBe(true);
      expect(plan.proposedAction.parameters.draft).toBe(true);
    }

    expect(approval.kind).toBe("approval_draft");
    expect(search.proposedAction.requiresApproval).toBe(true);
    expect(planDraftToFacts(approval).some((f) => f.labelKo === "실행 여부")).toBe(
      true,
    );
  });
});

describe("lifecycle awareness", () => {
  it("maps verified facts to pipeline stages and milestones", () => {
    expect(
      inferLifecycleStage([fact("최초 실행 모드", "EMPTY")]),
    ).toBe("empty");
    expect(
      inferLifecycleStage([
        fact("실행 중", "1개"),
        fact("완료됨", "0개"),
      ]),
    ).toBe("search_running");
    expect(
      inferLifecycleStage([
        fact("완료됨", "2개"),
        fact("최근 백테스트 수", "0개"),
      ]),
    ).toBe("results_review");
    expect(
      inferLifecycleStage([
        fact("최근 백테스트 수", "3개"),
        fact("모의매매 가능 전략", "1개"),
        fact("활성 Paper 세션", "없음"),
      ]),
    ).toBe("paper_ready");
    expect(LIFECYCLE_NEXT_MILESTONE_KO.paper_ready).toMatch(/모의매매/);
  });
});

describe("workspace memory + cancel", () => {
  it("retains pending plan and clears on cancel", () => {
    const draft = buildSearchPlanDraft({ requestedSymbol: "ETH" });
    const plan = buildApprovalDraft(searchPlanToAgentPlan(draft));
    const first = buildAgentResponse(
      parseIntent("ETH 탐색 계획 준비해"),
      planDraftToFacts(plan),
      undefined,
      { symbol: "ETHUSDT" },
      {
        entities: emptyEntityMemory(),
        explicitProposedAction: draft.proposedAction,
        explicitPlan: plan,
      },
    );
    expect(first.plan?.kind).toBe("approval_draft");
    expect(first.entityMemory?.pendingPlan?.kind).toBe("approval_draft");
    expect(first.entityMemory?.pinnedObjectiveKo).toBeTruthy();
    expect(first.decision?.recommendedActionKo).toBeTruthy();
    expect(first.actions).toHaveLength(1);

    expect(detectFollowUpKind("취소")).toBe("cancel");
    const cancelled = buildAgentResponse(
      { type: "cancel_pending", params: {}, confidence: 1, rawQuery: "취소" },
      [fact("대기 제안", draft.proposedAction.summary)],
      undefined,
      null,
      {
        entities: mergeEntityMemory(emptyEntityMemory(), null, {
          pendingProposedAction: draft.proposedAction,
          pendingPlan: plan,
        }),
      },
    );
    expect(cancelled.proposedAction).toBeNull();
    expect(cancelled.plan).toBeNull();
    expect(cancelled.entityMemory?.pendingProposedAction).toBeNull();
    expect(cancelled.actions).toHaveLength(0);
    expect(cancelled.conclusionKo).toMatch(/취소/);
  });
});

describe("decision engine + one next action", () => {
  it("emits understanding/decision/reason and exactly one CTA", () => {
    const facts = [
      fact("권장 다음 작업", "탐색 계획 준비"),
      fact("권장 사유", "완료된 탐색이 없습니다."),
      fact("권장 이동 경로", "/strategy-search"),
      fact("권장 작업 키", "open_search"),
      fact("완료됨", "0개"),
      fact("실행 중", "0개"),
      fact("SAFE 전략", "SAFE_v44_i4060"),
      fact("활성 Paper 세션", "없음"),
      fact("최초 실행 모드", "HAS_DATA"),
    ];
    const response = buildAgentResponse(parseIntent("오늘 뭘 해야 해?"), facts);
    expect(response.conclusionKo).toMatch(/확인|연구|권/);
    expect(response.explanationKo.length).toBeGreaterThan(10);
    expect(response.decision?.situationKo).toBeTruthy();
    expect(response.decision?.meaningKo).toBeTruthy();
    expect(response.actions).toHaveLength(1);
    expect(response.lifecycleStage).toBeTruthy();
  });
});

describe("safety — never execute / never SAFE / never live", () => {
  it("blocks write intents and keeps plan intents read-only", () => {
    expect(checkIntentSafety("execute_trade").allowed).toBe(false);
    expect(checkIntentSafety("modify_safe").allowed).toBe(false);
    expect(checkIntentSafety("start_live").allowed).toBe(false);
    expect(checkIntentSafety("prepare_search_plan").allowed).toBe(true);
    expect(checkIntentSafety("prepare_backtest_plan").allowed).toBe(true);
    expect(checkIntentSafety("prepare_paper_plan").allowed).toBe(true);
    expect(checkIntentSafety("research_workspace").allowed).toBe(true);
    expect(checkIntentSafety("cancel_pending").allowed).toBe(true);
  });
});

describe("intent coverage for commercial workflow", () => {
  it("parses plan and workspace intents", () => {
    expect(parseIntent("BTC 탐색 계획 준비해").type).toBe("prepare_search_plan");
    expect(parseIntent("백테스트 계획 준비해").type).toBe(
      "prepare_backtest_plan",
    );
    expect(parseIntent("모의매매 계획 준비해").type).toBe("prepare_paper_plan");
    expect(parseIntent("연구 현황 알려줘").type).toBe("research_workspace");
    expect(parseIntent("계획 취소").type).toBe("cancel_pending");
  });
});

describe("UI commercial contracts", () => {
  it("ActionCard exposes Review / Open / Cancel approval trio", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/agent/ActionCard.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("agent-action-review");
    expect(src).toContain("agent-action-open");
    expect(src).toContain("agent-action-cancel");
    expect(src).toContain("계획 검토");
    expect(src).toContain("취소");
  });

  it("AgentMessage supports timestamps, streaming, pinned evidence/dev collapse", () => {
    const msg = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/agent/AgentMessage.tsx"),
      "utf8",
    );
    const panel = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/agent/AgentPanel.tsx"),
      "utf8",
    );
    expect(msg).toContain("agent-response-timestamp");
    expect(msg).toContain('data-streaming');
    expect(msg).toContain("StreamingAnswer");
    expect(msg).toContain("agent-dev-details");
    expect(msg).toContain("검증된 증거가 없습니다");
    expect(panel).toContain("agent-pinned-objective");
    expect(panel).toContain("AgentWorkspacePanel");
    expect(panel).toContain("ApprovalCenter");
    const workspacePanel = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/agent/AgentWorkspacePanel.tsx"),
      "utf8",
    );
    const approval = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/agent/ApprovalCenter.tsx"),
      "utf8",
    );
    expect(workspacePanel).toContain("agent-workspace-panel");
    expect(approval).toContain("agent-approval-center");
  });

  it("session persists workspace memory keys", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/agent/useAgentSession.ts"),
      "utf8",
    );
    const persist = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/agent/agentPersistence.ts"),
      "utf8",
    );
    expect(persist).toContain("rextora.agent.entityMemory");
    expect(persist).toContain("rextora.agent.sessionTurns");
    expect(persist).toContain("rextora.agent.workspace");
    expect(src).toContain("cancelPendingPlan");
    expect(src).toContain("resumeWhereLeftOff");
  });
});
