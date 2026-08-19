import { describe, expect, it } from "vitest";
import { emptyEntityMemory } from "../src/lib/rextora/agent/conversationContext";
import type { PipelineLifecycleStage } from "../src/lib/rextora/agent/lifecycleStage";
import type { ProposedAction } from "../src/lib/rextora/agent/proposedAction";
import {
  deterministicConversationAnswer,
  routeConversationTurn,
  type ConversationRouteMode,
} from "../src/lib/rextora/agent/v2/conversation";
import { countPrimaryTextLeaks } from "../src/lib/rextora/agent/v2/reasoning/primaryLeakDetector";
import { sanitizePrimaryUserParagraphs } from "../src/lib/rextora/agent/v2/reasoning/userVisibleSanitizer";
import type { AgentTurn } from "../src/lib/rextora/agent/types";

function pending(id: string): ProposedAction {
  return {
    actionId: id,
    actionType: "open_paper_approval",
    summary: `검토 계획 ${id}`,
    reason: "검증 계획",
    targetRoute: "/paper-trading",
    strategyId: "strategy_random",
    jobId: null,
    runId: "run_random",
    symbol: "BTCUSDT",
    timeframe: "15m",
    parameters: {},
    requiresApproval: true,
    riskLevel: "medium",
    blockedReason: null,
    createdAt: "2026-08-05T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  };
}

const productQueries = [
  "렉스토라 뭐하는 건데?",
  "이 앱 목적이 뭐야",
  "Rextora는 어떤 서비스인가요?",
  "렉스토라가 하는 일을 알려줘",
  "이거 말고 렉스토라 앱 자체 설명",
  "렉스토라 정체가 뭐임?",
  "이 앱은 어디에 쓰는 거야?",
  "렉스토라는 자동매매 봇이야?",
  "Rextora 앱 한 줄 소개해줘",
  "렉스토라 제품 목적이 궁금합니다",
];
const simpleQueries = [
  "좀 더 쉽게 설명해줘.",
  "초보자도 알게 쉽게 말해줘",
  "한 줄로 다시 말해봐",
  "무슨 말이야? 쉽게",
  "더 간단히 얘기해",
  "쉽게 풀어줘",
  "아주 쉽게 부탁해요",
  "짧게 다시 설명",
  "초딩도 알게 말해줘",
  "핵심만 쉽게",
];
const conceptQueries = [
  "백테스트가 뭐야?",
  "MDD 왜 중요함?",
  "과적합이 뭔가요?",
  "수수료랑 슬리피지는 왜 넣어?",
  "오더블럭이 뭐임?",
  "FVG가 뭔데?",
  "모의매매랑 백테스트 차이?",
  "최대 낙폭 뜻 알려줘",
  "거래 비용이 성과에 왜 영향 줘?",
  "Paper와 실전매매 차이가 뭐야?",
];
const stateQueries = [
  "현재 진행 상황 알려줘.",
  "지금 뭐 돌아가고 있음?",
  "현재 탐색 어디까지 갔어?",
  "요즘 승인 대기 뭐 있어?",
  "지금 모의매매 상태 어때?",
  "최근 상태만 알려주세요",
  "현재 워크스페이스 상황?",
  "진행중인 일 뭐임",
  "지금 작업 현황 브리핑",
  "현재 상태 체크해줘",
];
const actionQueries = [
  "새 전략을 탐색해줘.",
  "1시간봉으로 새 탐색 준비해",
  "현재 탐색 취소하고 다른 조합으로 다시 해",
  "이 전략 백테스트해.",
  "모의매매 준비해.",
  "새 후보 찾는 계획 만들어줘",
  "15분 말고 1시간으로 다시 해",
  "전략 검증 백테스트 돌려줘",
  "다른 패턴으로 탐색 시작해줘",
  "모의 매매 세션 준비해줘",
];
const correctionOrReference = [
  "아니 그거 말고 앱 자체가 뭐냐고.",
  "이건 뭐야?",
  "현재 상태 말고 렉스토라 기능을 설명해",
  "그거 위험하진 않아?",
  "왜 또 모의매매 얘기해? 앱 설명해",
  "이거 해야 돼?",
  "내 질문에 답해. 렉스토라가 뭐야?",
  "그 전략은?",
  "아니 워크플로 말고 제품 설명",
  "이게 대체 뭐하는 카드야?",
];

const lifecycleProfiles: Array<{
  stage: PipelineLifecycleStage;
  pending: ProposedAction[];
}> = [
  { stage: "empty", pending: [] },
  { stage: "search_needed", pending: [pending("pa_search")] },
  { stage: "search_running", pending: [] },
  { stage: "results_review", pending: [] },
  { stage: "backtest_review", pending: [] },
  { stage: "paper_ready", pending: [pending("pa_paper")] },
  { stage: "paper_active", pending: [] },
  { stage: "paper_active", pending: [pending("pa_active")] },
  { stage: "search_failed", pending: [] },
  { stage: "live_review", pending: [] },
];

function expectedConceptMode(): ConversationRouteMode {
  return "DIRECT_ANSWER";
}

describe("bounded randomized Korean conversation harness", () => {
  it("covers 60 distinct turns across 10 six-turn conversations", () => {
    const all = [
      ...productQueries,
      ...simpleQueries,
      ...conceptQueries,
      ...stateQueries,
      ...actionQueries,
      ...correctionOrReference,
    ];
    expect(all).toHaveLength(60);
    expect(new Set(all).size).toBe(60);
  });

  for (let index = 0; index < lifecycleProfiles.length; index += 1) {
    const profile = lifecycleProfiles[index]!;
    it(`conversation ${index + 1}: ${profile.stage}`, () => {
      const entityMemory = {
        ...emptyEntityMemory(),
        pipelineStage: profile.stage,
        lifecycleStage: profile.stage,
        jobId: profile.stage.startsWith("search") ? `search_${index}` : null,
        runId:
          profile.stage === "backtest_review" || profile.stage === "paper_ready"
            ? `run_${index}`
            : null,
        paperSessionId: profile.stage.startsWith("paper")
          ? `paper_${index}`
          : null,
        pendingProposedAction: profile.pending[0] ?? null,
      };
      const history: AgentTurn[] = [];
      const turns = [
        {
          query: productQueries[index]!,
          mode: "DIRECT_ANSWER" as const,
          noLifecycle: true,
        },
        {
          query: simpleQueries[index]!,
          mode: "DIRECT_ANSWER" as const,
          noLifecycle: true,
        },
        {
          query: conceptQueries[index]!,
          mode: expectedConceptMode(),
          noLifecycle: true,
        },
        {
          query: stateQueries[index]!,
          mode: "READ_AND_ANSWER" as const,
          noLifecycle: true,
        },
        {
          query: actionQueries[index]!,
          mode: "PLAN_AND_APPROVE" as const,
          noLifecycle: true,
        },
        {
          query: correctionOrReference[index]!,
          mode:
            /그거\s*위험/.test(correctionOrReference[index]!)
              ? ("DIRECT_ANSWER" as const)
              : /이건|이거|이게|그건|그거|그\s*전략|카드/.test(correctionOrReference[index]!) &&
            !/렉스토라|앱|제품|기능/.test(correctionOrReference[index]!)
              ? ("CLARIFY_REFERENCE" as const)
              : ("DIRECT_ANSWER" as const),
          noLifecycle: !/이건|이거|이게|그건|그거|그\s*전략|카드/.test(
            correctionOrReference[index]!,
          ),
        },
      ];

      for (let turnIndex = 0; turnIndex < turns.length; turnIndex += 1) {
        const turn = turns[turnIndex]!;
        const before = JSON.stringify({ entityMemory, pending: profile.pending });
        const route = routeConversationTurn({
          query: turn.query,
          history,
          entities: entityMemory,
          lifecycleStage: profile.stage,
          pendingApprovals: profile.pending,
        });
        expect(route.mode, turn.query).toBe(turn.mode);
        if (turn.noLifecycle) {
          expect(route.lifecycleInfluencedRouting).toBe(false);
        }
        if (route.mode === "DIRECT_ANSWER") {
          expect(route.requestedWriteTools).toHaveLength(0);
          expect(route.requiresApproval).toBe(false);
        }
        if (route.mode === "READ_AND_ANSWER") {
          expect(route.requestedReadTools.length).toBeGreaterThan(0);
          expect(route.requestedWriteTools).toHaveLength(0);
        }
        if (route.mode === "PLAN_AND_APPROVE") {
          expect(route.requiresApproval).toBe(true);
          expect(route.requestedWriteTools.length).toBeGreaterThan(0);
        }

        const answer = deterministicConversationAnswer({
          query: turn.query,
          route,
        });
        const assistantText = answer
          ? sanitizePrimaryUserParagraphs([
              answer.conclusionKo,
              answer.explanationKo,
            ])
          : "질문을 확인했습니다.";
        expect(countPrimaryTextLeaks(assistantText)).toBe(0);
        expect(JSON.stringify({ entityMemory, pending: profile.pending })).toBe(
          before,
        );

        history.push(
          {
            role: "user",
            content: turn.query,
            timestamp: `2026-08-05T00:00:${String(turnIndex * 2).padStart(2, "0")}.000Z`,
          },
          {
            role: "agent",
            content: assistantText,
            timestamp: `2026-08-05T00:00:${String(turnIndex * 2 + 1).padStart(2, "0")}.000Z`,
          },
        );
      }
    });
  }
});

