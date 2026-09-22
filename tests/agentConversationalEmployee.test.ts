/**
 * Conversational AI Trading Employee — contract tests (Conversations A–F).
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseIntent } from "../src/lib/rextora/agent/intentParser";
import { checkIntentSafety } from "../src/lib/rextora/agent/safetyGuard";
import { buildAgentResponse } from "../src/lib/rextora/agent/agentResponseBuilder";
import { buildDecisionContext } from "../src/lib/rextora/agent/decisionContext";
import {
  detectFollowUpKind,
  emptyEntityMemory,
  mergeEntityMemory,
  sanitizeHistory,
  stripInternalIdsFromProse,
} from "../src/lib/rextora/agent/conversationContext";
import {
  createProposedAction,
  isProposedActionExpired,
  proposedActionToCardAction,
} from "../src/lib/rextora/agent/proposedAction";
import {
  buildSearchPlanDraft,
  searchPlanDraftToFacts,
} from "../src/lib/rextora/agent/searchPlanDraft";
import type { FactItem } from "../src/lib/rextora/agent/types";

function fact(labelKo: string, value: string): FactItem {
  return {
    labelKo,
    value,
    source: "system_status",
    fetchedAt: new Date().toISOString(),
  };
}

describe("conversational response hierarchy", () => {
  it("returns conclusion + explanation + one action, hides IDs in prose", () => {
    const facts = [
      fact("권장 다음 작업", "탐색 결과 검토"),
      fact("권장 사유", "완료된 탐색 결과가 있고 미검토 후보가 있습니다."),
      fact("권장 이동 경로", "/results"),
      fact("권장 작업 키", "view_results"),
      fact("완료됨", "3개"),
      fact("최초 실행 모드", "HAS_DATA"),
      fact("탐색 작업 ID", "search_f199146b-7fec-48ab-8063-747e0c484b07"),
    ];
    const intent = parseIntent("지금 뭘 해야 해?");
    const response = buildAgentResponse(intent, facts, undefined, {
      jobId: "search_f199146b-7fec-48ab-8063-747e0c484b07",
    });

    expect(response.conclusionKo.length).toBeGreaterThan(8);
    expect(response.explanationKo.length).toBeGreaterThan(8);
    expect(response.actions).toHaveLength(1);
    expect(response.conclusionKo).not.toMatch(/search_[a-f0-9-]+/i);
    expect(response.explanationKo).not.toMatch(/search_[a-f0-9-]+/i);
    expect(response.proposedAction?.actionType).toBeTruthy();
    expect(response.facts.some((f) => f.labelKo === "탐색 작업 ID")).toBe(true);
  });

  it("strips internal identifiers from operator prose", () => {
    const cleaned = stripInternalIdsFromProse(
      "작업 search_abc123-def 와 strat_xyz789 를 확인하세요 paramsHash=7893ca3f0e30",
    );
    expect(cleaned).not.toMatch(/search_abc/);
    expect(cleaned).not.toMatch(/strat_xyz/);
    expect(cleaned).not.toMatch(/7893ca3f0e30/);
  });

  it("preserves the active conversational job during continuation", () => {
    const entities = mergeEntityMemory(emptyEntityMemory(), null, {
      jobId: "search_exact_active",
    });
    const response = buildAgentResponse(
      parseIntent("이어서 진행해"),
      [fact("최근 작업 ID", "search_unrelated_history")],
      undefined,
      { route: "/dashboard", jobId: "search_unrelated_context" },
      { entities },
    );
    expect(response.entityMemory.jobId).toBe("search_exact_active");
  });

  it("uses the approved execution job instead of stale page context", () => {
    const entities = mergeEntityMemory(emptyEntityMemory(), null, {
      jobId: "search_approved_result",
    });
    const response = buildAgentResponse(
      parseIntent("진행해"),
      [fact("작업 ID", "search_approved_result")],
      undefined,
      { route: "/dashboard", jobId: "search_stale_page" },
      { entities },
    );
    expect(response.entityMemory.jobId).toBe("search_approved_result");
  });
});

describe("Conversation A — recommend → why → approve", () => {
  it("resolves multi-turn pending navigation without fabrication", () => {
    const facts = [
      fact("권장 다음 작업", "탐색 결과 확인"),
      fact("권장 사유", "완료된 후보가 있지만 아직 백테스트 검증이 끝나지 않았습니다."),
      fact("권장 이동 경로", "/results?jobId=search_demo"),
      fact("권장 작업 키", "view_results"),
      fact("완료됨", "2개"),
    ];
    const first = buildAgentResponse(parseIntent("지금 뭘 해야 해?"), facts);
    expect(first.conclusionKo).toMatch(/탐색|결과|검토/);
    expect(first.proposedAction).toBeTruthy();

    const entities = mergeEntityMemory(emptyEntityMemory(), null, {
      previousConclusion: first.conclusionKo,
      previousReason: first.explanationKo,
      previousRecommendation: first.recommendedActionKo ?? null,
      pendingProposedAction: first.proposedAction ?? null,
    });

    expect(detectFollowUpKind("왜?")).toBe("why");
    const whyDecision = buildDecisionContext("follow_up_why", facts, entities);
    expect(whyDecision.explanationKo).toMatch(/탐색|결과|검토/);
    expect(whyDecision.explanationKo).toContain(
      (entities.previousConclusion ?? "검토").replace(/\.+$/, ""),
    );
    const whyResponse = buildAgentResponse(
      {
        type: "follow_up_why",
        params: {},
        confidence: 0.9,
        rawQuery: "왜?",
      },
      facts,
      undefined,
      null,
      { entities },
    );
    expect(whyResponse.actions[0]?.href).toBe(first.proposedAction?.targetRoute);

    expect(detectFollowUpKind("그럼 진행해")).toBe("approve");
    const approve = buildAgentResponse(
      {
        type: "approve_pending",
        params: {},
        confidence: 0.9,
        rawQuery: "그럼 진행해",
      },
      [
        fact("권장 다음 작업", first.proposedAction!.summary),
        fact("권장 사유", first.proposedAction!.reason),
        fact("권장 이동 경로", first.proposedAction!.targetRoute),
      ],
      undefined,
      null,
      { entities, explicitProposedAction: first.proposedAction },
    );
    expect(approve.actions).toHaveLength(1);
    expect(approve.actions[0]?.href).toContain("/results");
    expect(approve.safetyBlocked).toBe(false);
  });
});

describe("Conversation B — search plan draft", () => {
  it("proposes validated draft and never auto-executes", () => {
    expect(parseIntent("새로운 전략 탐색해").type).toBe("prepare_search_plan");
    const draft = buildSearchPlanDraft({
      requestedSymbol: "ETH",
      missingSymbolHint: "ETH",
    });
    expect(draft.symbol).toBe("ETHUSDT");
    expect(draft.timeframe).toBe("15m");
    expect(draft.patternSpaceIds).toEqual(
      expect.arrayContaining(["order_block", "fvg"]),
    );
    expect(draft.proposedAction.actionType).toBe("prepare_search_plan");
    expect(draft.proposedAction.requiresApproval).toBe(true);
    expect(draft.proposedAction.parameters.draft).toBe(true);

    const facts = searchPlanDraftToFacts(draft);
    const response = buildAgentResponse(
      parseIntent("새로운 전략 탐색해"),
      facts,
      undefined,
      null,
      { explicitProposedAction: draft.proposedAction },
    );
    expect(response.actions[0]?.href).toContain("/strategy-search");
    expect(response.actions[0]?.requiresApproval).toBe(true);
    expect(JSON.stringify(response)).not.toMatch(/startStrategySearch|runSearchJob/);
  });

  it("explains settings from draft evidence", () => {
    const draft = buildSearchPlanDraft({ requestedSymbol: "ETHUSDT" });
    const ethWhy = draft.whySettings.find((w) => w.key === "symbol");
    expect(ethWhy?.reasonKo.length).toBeGreaterThan(5);
    const facts = searchPlanDraftToFacts(draft);
    expect(facts.some((f) => f.labelKo.startsWith("설정 이유:"))).toBe(true);
  });
});

describe("Conversation C — compare with missing evidence", () => {
  it("refuses comparison when ETH data missing", () => {
    const facts = [
      fact("비교 가능", "아니오 — ETH 검증 백테스트 없음"),
      fact("비교 심볼 A", "BTC"),
      fact("비교 심볼 B", "ETH"),
    ];
    const decision = buildDecisionContext("compare_strategies", facts);
    expect(decision.conclusionKo).toMatch(/비교할 수 없/);
    expect(decision.recommendedActionKo).toMatch(/백테스트/);
    const response = buildAgentResponse(
      parseIntent("BTC와 ETH 중 뭐가 더 좋아?"),
      facts,
    );
    expect(response.actions[0]?.type).toBe("open_backtest");
  });
});

describe("Conversation D — Paper approval only", () => {
  it("opens paper approval and never starts automatically", () => {
    expect(parseIntent("수익 가장 좋은 전략 Paper로 돌려").type).toBe(
      "paper_start_request",
    );
    const facts = [
      fact("후보 전략", "연구후보 A"),
      fact("후보 전략 ID", "strat_demo_1"),
      fact("후보 Paper 자격", "가능"),
      fact("활성 Paper 세션", "없음"),
    ];
    const response = buildAgentResponse(
      parseIntent("수익 가장 좋은 전략 Paper로 돌려"),
      facts,
    );
    expect(response.actions).toHaveLength(1);
    expect(response.actions[0]?.type).toBe("open_paper");
    expect(response.actions[0]?.requiresApproval).toBe(true);
    expect(response.actions[0]?.href).toContain("/paper-trading");
    expect(response.conclusionKo).toMatch(/자동 시작하지|승인/);
    // Absence facts must never become persisted entity IDs.
    expect(response.scope.paperSessionId).toBeNull();
    expect(response.entityMemory?.paperSessionId ?? null).toBeNull();
  });

  it("prefers pending approval session over creating another", () => {
    const facts = [
      fact("후보 전략", "연구후보 A"),
      fact("후보 Paper 자격", "가능"),
      fact("Paper 세션 상태", "pending_approval"),
    ];
    const decision = buildDecisionContext("paper_start_request", facts);
    expect(decision.conclusionKo).toMatch(/대기|승인/);
  });
});

describe("Conversation E — execute_trade block", () => {
  it("blocks BTC buy with no live action card", () => {
    const intent = parseIntent("BTC 매수해");
    expect(intent.type).toBe("execute_trade");
    expect(checkIntentSafety(intent.type).allowed).toBe(false);
    const response = buildAgentResponse(intent, [], undefined, null, {
      safetyBlocked: true,
      safetyReasonKo: checkIntentSafety(intent.type).reasonKo,
    });
    expect(response.safetyBlocked).toBe(true);
    expect(response.actions).toHaveLength(0);
    expect(JSON.stringify(response.actions)).not.toMatch(/live-trading/);
  });
});

describe("Conversation F — SAFE modify block", () => {
  it("blocks SAFE modification", () => {
    const intent = parseIntent("SAFE 수정해");
    expect(intent.type).toBe("modify_safe");
    expect(checkIntentSafety(intent.type).allowed).toBe(false);
    expect(checkIntentSafety(intent.type).reasonKo).toMatch(/폐기|사용할 수 없습니다/);
  });
});

describe("proposed action expiry and bounded context", () => {
  it("expires stale proposed actions", () => {
    const action = createProposedAction({
      actionType: "open_results",
      summary: "결과 열기",
      reason: "test",
      targetRoute: "/results",
      strategyId: null,
      jobId: null,
      runId: null,
      symbol: null,
      timeframe: null,
      parameters: {},
      requiresApproval: false,
      riskLevel: "low",
      blockedReason: null,
      ttlMs: 1,
    });
    expect(isProposedActionExpired(action, Date.now() + 50)).toBe(true);
  });

  it("bounds history length and characters", () => {
    const history = sanitizeHistory(
      Array.from({ length: 20 }, (_, i) => ({
        role: i % 2 === 0 ? ("user" as const) : ("agent" as const),
        content: "x".repeat(500),
        timestamp: new Date().toISOString(),
      })),
    );
    expect(history.length).toBeLessThanOrEqual(6);
    expect(history.every((h) => h.content.length <= 280)).toBe(true);
  });

  it("maps proposed action to a single card action", () => {
    const pa = createProposedAction({
      actionType: "open_paper_approval",
      summary: "모의매매 승인 열기",
      reason: "승인 필요",
      targetRoute: "/paper-trading?strategyId=x",
      strategyId: "x",
      jobId: null,
      runId: null,
      symbol: "BTCUSDT",
      timeframe: "15m",
      parameters: {},
      requiresApproval: true,
      riskLevel: "medium",
      blockedReason: null,
    });
    const card = proposedActionToCardAction(pa);
    expect(card.type).toBe("open_paper");
    expect(card.requiresApproval).toBe(true);
  });
});

describe("UI hierarchy source contract", () => {
  it("keeps evidence collapsed and conversational answer primary", () => {
    const message = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/agent/AgentMessage.tsx"),
      "utf8",
    );
    expect(message).toContain("근거 자세히 보기");
    expect(message).toContain("agent-conversational-answer");
    expect(message).toContain("agent-evidence-toggle");
    expect(message).toContain("useState(false)");
    expect(message).not.toContain("분석 범위");
    expect(message).not.toContain("검증된 사실");
    expect(message).not.toContain("AI 해석");
  });

  it("panel uses conversational employee branding", () => {
    const panel = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/agent/AgentPanel.tsx"),
      "utf8",
    );
    expect(panel).toContain("AI 트레이딩 직원");
    expect(panel).toContain("agent-new-conversation");
    expect(panel).toContain("stopResponse");
  });
});
