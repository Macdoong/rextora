/**
 * STEP 7 — Conversational Intelligence acceptance tests.
 * Natural Korean phrasing must complete a working session without coaching.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { detectGoal } from "../src/lib/rextora/agent/goalDetector";
import { buildAgentResponse } from "../src/lib/rextora/agent/agentResponseBuilder";
import {
  emptyEntityMemory,
  mergeEntityMemory,
} from "../src/lib/rextora/agent/conversationContext";
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

const BETA_PROMPTS = [
  "오늘 무엇을 해야 하지?",
  "좋은 전략을 찾아줘.",
  "왜 이 전략이 좋은 거야?",
  "백테스트 해볼까?",
  "Paper로 돌려볼까?",
  "현재 가장 위험한 부분은?",
  "다음 단계는?",
  "이 전략을 왜 추천했어?",
  "지금 승인하면 어떤 일이 일어나?",
] as const;

describe("STEP 7 natural language coverage", () => {
  it("detects goals for all beta prompts without unknown intent", () => {
    let entities = emptyEntityMemory();
    let unknownCount = 0;

    for (const query of BETA_PROMPTS) {
      const detected = detectGoal({ query, entities });
      if (detected.intent.type === "unknown") unknownCount += 1;
      expect(detected.intent.type).not.toBe("unknown");
      expect(detected.confidence).toBeGreaterThan(0.4);

      // Simulate memory after a plan for why/approval turns
      if (detected.intent.type === "prepare_search_plan") {
        const draft = buildSearchPlanDraft({ requestedSymbol: "BTC" });
        const plan = buildApprovalDraft(searchPlanToAgentPlan(draft));
        const response = buildAgentResponse(
          detected.intent,
          planDraftToFacts(plan),
          undefined,
          { symbol: "BTCUSDT" },
          {
            entities,
            explicitProposedAction: draft.proposedAction,
            explicitPlan: plan,
            goal: detected.goal,
          },
        );
        entities = response.entityMemory ?? entities;
      } else if (detected.intent.type === "recommend_next") {
        const facts = [
          fact("권장 다음 작업", "탐색 계획 준비"),
          fact("권장 사유", "완료된 탐색이 없습니다."),
          fact("권장 이동 경로", "/strategy-search"),
          fact("권장 작업 키", "open_search"),
          fact("완료됨", "0개"),
          fact("실행 중", "0개"),
          fact("활성 Paper 세션", "없음"),
          fact("최초 실행 모드", "HAS_DATA"),
        ];
        const response = buildAgentResponse(detected.intent, facts, undefined, null, {
          entities,
          goal: detected.goal,
        });
        entities = mergeEntityMemory(entities, null, {
          previousConclusion: response.conclusionKo,
          previousReason: response.explanationKo,
          previousRecommendation: response.recommendedActionKo ?? null,
          pendingProposedAction: response.proposedAction ?? null,
          pendingPlan: response.plan ?? null,
          pinnedObjectiveKo: response.pinnedObjectiveKo ?? null,
        });
      }
    }

    expect(unknownCount).toBe(0);
  });

  it("maps each beta phrase to the expected goal family", () => {
    const entities = mergeEntityMemory(emptyEntityMemory(), null, {
      previousConclusion: "탐색 결과 검토가 우선입니다.",
      previousReason: "완료된 탐색이 있습니다.",
      previousRecommendation: "탐색 결과 확인",
      pendingProposedAction: buildSearchPlanDraft({
        requestedSymbol: "BTC",
      }).proposedAction,
      pendingPlan: buildApprovalDraft(
        searchPlanToAgentPlan(buildSearchPlanDraft({ requestedSymbol: "BTC" })),
      ),
    });

    expect(detectGoal({ query: "오늘 무엇을 해야 하지?" }).goal).toMatch(
      /recommend_next|lifecycle_fallback/,
    );
    expect(detectGoal({ query: "좋은 전략을 찾아줘." }).goal).toBe(
      "prepare_search",
    );
    expect(
      detectGoal({ query: "왜 이 전략이 좋은 거야?", entities }).goal,
    ).toBe("explain_why");
    expect(detectGoal({ query: "백테스트 해볼까?" }).goal).toMatch(
      /prepare_backtest/,
    );
    expect(detectGoal({ query: "Paper로 돌려볼까?" }).goal).toMatch(
      /paper_start|prepare_paper/,
    );
    expect(detectGoal({ query: "현재 가장 위험한 부분은?" }).goal).toBe(
      "risk_review",
    );
    expect(detectGoal({ query: "다음 단계는?" }).goal).toMatch(
      /recommend_next|lifecycle_fallback/,
    );
    expect(
      detectGoal({ query: "이 전략을 왜 추천했어?", entities }).goal,
    ).toBe("explain_why");
    expect(
      detectGoal({ query: "지금 승인하면 어떤 일이 일어나?", entities }).goal,
    ).toBe("explain_approval");
  });
});

describe("approval consequence explanation", () => {
  it("explains that approval opens a screen and never auto-starts engines", () => {
    const draft = buildSearchPlanDraft({ requestedSymbol: "ETH" });
    const plan = buildApprovalDraft(searchPlanToAgentPlan(draft));
    const entities = mergeEntityMemory(emptyEntityMemory(), null, {
      pendingProposedAction: draft.proposedAction,
      pendingPlan: plan,
      previousConclusion: "탐색 계획을 준비했습니다.",
    });
    const detected = detectGoal({
      query: "지금 승인하면 어떤 일이 일어나?",
      entities,
    });
    expect(detected.intent.type).toBe("explain_approval");

    const facts = [
      fact("대기 제안", draft.proposedAction.summary),
      fact("계획 종류", plan.titleKo),
      fact("권장 다음 작업", draft.proposedAction.summary),
      fact("권장 이동 경로", draft.proposedAction.targetRoute),
      fact("실행 여부", "시작되지 않음 · 승인 시 화면만 열림"),
    ];
    const response = buildAgentResponse(detected.intent, facts, undefined, null, {
      entities,
      explicitProposedAction: draft.proposedAction,
      explicitPlan: plan,
      goal: detected.goal,
    });
    expect(response.conclusionKo).toMatch(/화면|열/);
    expect(response.explanationKo).toMatch(/자동|실행되지|시작되지/);
    expect(response.conversationState?.phase).toBe("explaining");
  });
});

describe("safety unchanged", () => {
  it("still blocks execute / SAFE / live", () => {
    expect(checkIntentSafety("execute_trade").allowed).toBe(false);
    expect(checkIntentSafety("modify_safe").allowed).toBe(false);
    expect(checkIntentSafety("start_live").allowed).toBe(false);
    expect(checkIntentSafety("explain_approval").allowed).toBe(true);
  });
});

describe("agent context strip contract", () => {
  it("is mounted on lifecycle pages", () => {
    const pages = [
      "app/strategy-search/page.tsx",
      "app/results/page.tsx",
      "app/backtest/page.tsx",
      "app/paper-trading/page.tsx",
      "app/live-trading/page.tsx",
    ];
    for (const rel of pages) {
      const src = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
      expect(src).toContain("AgentContextStrip");
    }
    const strip = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/agent/AgentContextStrip.tsx",
      ),
      "utf8",
    );
    expect(strip).toContain("agent-context-strip");
    expect(strip).toContain("MEMORY_KEY");
    expect(strip).toContain("requestOpenAssistant");
  });
});
