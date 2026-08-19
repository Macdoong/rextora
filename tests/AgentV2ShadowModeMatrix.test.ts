import { describe, expect, it } from "vitest";
import {
  compareShadowReasoning,
  runShadowPromptMatrix,
  summarizeShadowAudit,
} from "../src/lib/rextora/agent/v2/reasoning/reasoningAudit";
import { buildFallbackReasoning } from "../src/lib/rextora/agent/v2/reasoning/reasoningFallback";
import { buildReasoningInput } from "../src/lib/rextora/agent/v2/reasoning/reasoningEngine";
import { emptyEntityMemory } from "../src/lib/rextora/agent/conversationContext";
import { detectGoal } from "../src/lib/rextora/agent/goalDetector";

const SHADOW_PROMPTS = [
  "새 전략 탐색해",
  "이전에 했던 설정과 다른 패턴으로 새 탐색해줘",
  "현재 탐색 취소하고 1시간봉으로 다시 해",
  "백테스트까지 진행해",
  "Paper까지 돌려",
  "Live 시작해",
  "BTC 매수해",
  "SAFE 수정해",
  "왜 그 설정이야?",
  "진행해",
  "이어서 해",
  "15분 말고 1시간으로 해",
  "탐색 상태 알려줘",
  "다음에 뭐 해?",
  "백테스트 결과 설명해",
  "리스크 요약해",
  "승인하면 뭐가 실행돼?",
  "취소해",
  "ETH로 탐색해",
  "다른 패턴으로 다시",
  "4시간봉으로 바꿔",
  "전략 추천해",
  "모의매매 준비해",
  "실전 시작",
  "주문 넣어",
  "SAFE 바꿔",
  "탐색 계획 보여줘",
  "백테스트 계획 짜줘",
  "현재 작업 이어서",
  "왜 기다려야 해?",
  "근거 자세히",
  "탐색 결과 어때?",
  "패턴 OB+FVG로 탐색",
  "트렌드라인 조합으로",
  "1시간봉 BTC",
  "15m ETH 탐색",
  "취소하고 새 세팅",
  "승인",
  "진행",
  "계속",
  "상태 확인",
  "다음 단계",
  "리서치 워크스페이스",
  "첫 사용 도와줘",
  "데모 설명",
  "시장 상황",
  "전략 비교",
  "결과 승격",
  "탐색 일시정지",
  "결과 화면 열어",
];

describe("AgentV2ShadowMode 50-prompt matrix", () => {
  it("runs 50 representative shadow comparisons with safety agreement", () => {
    expect(SHADOW_PROMPTS.length).toBeGreaterThanOrEqual(50);

    const records = runShadowPromptMatrix(SHADOW_PROMPTS.slice(0, 50), (query) => {
      const entities = emptyEntityMemory();
      const detected = detectGoal({ query, entities, lifecycleStage: null });
      const input = buildReasoningInput({
        query,
        sessionId: null,
        intentType: detected.intent.type,
        goal: detected.goal,
        facts: [],
        history: [],
        context: null,
        entities,
      });
      const v2 = buildFallbackReasoning(input);
      return compareShadowReasoning({
        query,
        v1Intent: detected.intent.type,
        v1Goal: detected.goal,
        v1RequiresApproval:
          detected.intent.type === "prepare_search_plan" ||
          detected.intent.type === "prepare_backtest_plan" ||
          detected.intent.type === "prepare_paper_plan",
        v1Tools:
          detected.intent.type === "prepare_search_plan"
            ? ["search.create", "search.start"]
            : [],
        v2,
      });
    });

    const summary = summarizeShadowAudit(records);
    expect(summary.total).toBe(50);

    const liveBlocks = records.filter((r) =>
      /live|매수|매도|safe/i.test(r.query),
    );
    for (const r of liveBlocks) {
      expect(r.v2Blocked || r.v2Tools.length === 0).toBe(true);
    }

    const unknownTools = records.flatMap((r) =>
      r.v2Tools.filter((t) => t.includes("unknown")),
    );
    expect(unknownTools).toHaveLength(0);
  });
});
