import { describe, expect, it } from "vitest";
import { emptyEntityMemory } from "../src/lib/rextora/agent/conversationContext";
import type { PipelineLifecycleStage } from "../src/lib/rextora/agent/lifecycleStage";
import type { ProposedAction } from "../src/lib/rextora/agent/proposedAction";
import {
  deterministicConversationAnswer,
  routeConversationTurn,
  type ConversationRouteMode,
  type ConversationTopic,
} from "../src/lib/rextora/agent/v2/conversation";
import { countPrimaryTextLeaks } from "../src/lib/rextora/agent/v2/reasoning/primaryLeakDetector";
import { sanitizePrimaryUserParagraphs } from "../src/lib/rextora/agent/v2/reasoning/userVisibleSanitizer";

function approval(
  id: string,
  summary = "모의매매 준비",
  expiresAt = "2099-01-01T00:00:00.000Z",
): ProposedAction {
  return {
    actionId: id,
    actionType: "open_paper_approval",
    summary,
    reason: "검증된 계획",
    targetRoute: "/paper-trading",
    strategyId: "strategy_test",
    jobId: null,
    runId: "run_test",
    symbol: "BTCUSDT",
    timeframe: "15m",
    parameters: {},
    requiresApproval: true,
    riskLevel: "medium",
    blockedReason: null,
    createdAt: "2026-08-05T00:00:00.000Z",
    expiresAt,
  };
}

interface Profile {
  id: string;
  lifecycleStage: PipelineLifecycleStage | null;
  entities: ReturnType<typeof emptyEntityMemory>;
  approvals: ProposedAction[];
  history: Array<{
    role: "user" | "agent";
    content: string;
    timestamp: string;
  }>;
}

const base = emptyEntityMemory();
const profiles: Profile[] = [
  {
    id: "empty",
    lifecycleStage: "empty",
    entities: { ...base, pipelineStage: "empty" },
    approvals: [],
    history: [],
  },
  {
    id: "search-planned",
    lifecycleStage: "search_needed",
    entities: {
      ...base,
      pipelineStage: "search_needed",
      pendingProposedAction: approval("pa_search", "새 탐색 시작"),
    },
    approvals: [approval("pa_search", "새 탐색 시작")],
    history: [],
  },
  {
    id: "search-running",
    lifecycleStage: "search_running",
    entities: {
      ...base,
      pipelineStage: "search_running",
      jobId: "search_running_1",
    },
    approvals: [],
    history: [],
  },
  {
    id: "search-completed",
    lifecycleStage: "results_review",
    entities: {
      ...base,
      pipelineStage: "results_review",
      jobId: "search_done_1",
    },
    approvals: [],
    history: [],
  },
  {
    id: "backtest-available",
    lifecycleStage: "backtest_review",
    entities: {
      ...base,
      pipelineStage: "backtest_review",
      strategyId: "strategy_a",
      runId: "run_a",
    },
    approvals: [],
    history: [],
  },
  {
    id: "paper-pending",
    lifecycleStage: "paper_ready",
    entities: {
      ...base,
      pipelineStage: "paper_ready",
      pendingProposedAction: approval("pa_paper"),
      paperSessionId: "paper_pending_1",
    },
    approvals: [approval("pa_paper")],
    history: [],
  },
  {
    id: "paper-active",
    lifecycleStage: "paper_active",
    entities: {
      ...base,
      pipelineStage: "paper_active",
      paperSessionId: "paper_active_1",
    },
    approvals: [],
    history: [],
  },
  {
    id: "stale-expired-approval",
    lifecycleStage: "paper_ready",
    entities: { ...base, pipelineStage: "paper_ready" },
    approvals: [approval("pa_expired", "이전 모의매매 계획", "2000-01-01T00:00:00.000Z")],
    history: [],
  },
  {
    id: "multiple-approvals",
    lifecycleStage: "paper_ready",
    entities: {
      ...base,
      pipelineStage: "paper_ready",
      pendingProposedAction: approval("pa_one", "첫 번째 계획"),
    },
    approvals: [
      approval("pa_one", "첫 번째 계획"),
      approval("pa_two", "두 번째 계획"),
    ],
    history: [],
  },
  {
    id: "prior-different-strategy",
    lifecycleStage: "paper_active",
    entities: {
      ...base,
      pipelineStage: "paper_active",
      strategyId: "strategy_current",
      strategyLabel: "현재 전략",
    },
    approvals: [],
    history: [
      {
        role: "user",
        content: "이전 전략의 백테스트를 설명해줘",
        timestamp: "2026-08-05T00:00:00.000Z",
      },
      {
        role: "agent",
        content: "이전 전략의 백테스트 결과를 설명했습니다.",
        timestamp: "2026-08-05T00:00:01.000Z",
      },
    ],
  },
];

interface MatrixCase {
  id: string;
  profile: Profile;
  category: string;
  query: string;
  mode: ConversationRouteMode;
  topic: ConversationTopic;
  provider: boolean;
  reads: "none" | "some";
  writes: "none" | "some";
  approval: boolean;
  lifecycleInfluenced: boolean;
}

const cases: MatrixCase[] = [];

cases.push({
  id: "legacy-D-backtest-action",
  profile: profiles[4]!,
  category: "F action",
  query: "이 전략 백테스트까지 진행해.",
  mode: "PLAN_AND_APPROVE",
  topic: "feature_backtest",
  provider: true,
  reads: "some",
  writes: "some",
  approval: true,
  lifecycleInfluenced: false,
});

for (const profile of profiles) {
  cases.push(
    {
      id: `${profile.id}-product`,
      profile,
      category: "A product",
      query: "렉스토라는 뭐 하는 앱이야?",
      mode: "DIRECT_ANSWER",
      topic: "rextora_product",
      provider: true,
      reads: "none",
      writes: "none",
      approval: false,
      lifecycleInfluenced: false,
    },
    {
      id: `${profile.id}-concept`,
      profile,
      category: "C concept",
      query: "MDD가 왜 중요해?",
      mode: "DIRECT_ANSWER",
      topic: "concept_mdd",
      provider: true,
      reads: "none",
      writes: "none",
      approval: false,
      lifecycleInfluenced: false,
    },
    {
      id: `${profile.id}-state`,
      profile,
      category: "D current state",
      query: "현재 진행 상황 알려줘.",
      mode: "READ_AND_ANSWER",
      topic: (() => {
        const stage = profile.lifecycleStage;
        if (
          profile.entities.jobId ||
          stage === "search_running" ||
          stage === "search_needed" ||
          stage === "search_failed"
        ) {
          return "search_status";
        }
        if (
          profile.entities.paperSessionId ||
          stage === "paper_active" ||
          stage === "paper_ready"
        ) {
          return "paper_status";
        }
        if (profile.entities.runId || stage === "backtest_review") {
          return "backtest_analysis";
        }
        return "workspace_status";
      })(),
      provider: true,
      reads: "some",
      writes: "none",
      approval: false,
      lifecycleInfluenced: false,
    },
    {
      id: `${profile.id}-action`,
      profile,
      category: "F action",
      query: "새 전략을 탐색해줘.",
      mode: "PLAN_AND_APPROVE",
      topic: "workflow_action",
      provider: true,
      reads: "some",
      writes: "some",
      approval: true,
      lifecycleInfluenced: false,
    },
    {
      id: `${profile.id}-safety`,
      profile,
      category: "K safety",
      query: "바이낸스에 실제 주문 넣어.",
      mode: "SAFE_REFUSAL",
      topic: "safety",
      provider: false,
      reads: "none",
      writes: "none",
      approval: false,
      lifecycleInfluenced: false,
    },
    {
      id: `${profile.id}-deictic`,
      profile,
      category: "I ambiguous reference",
      query: "이건 뭐야?",
      mode:
        profile.id === "prior-different-strategy"
          ? "DIRECT_ANSWER"
          : "CLARIFY_REFERENCE",
      topic: "unknown",
      // Resolved deictic reference answers stay deterministic (no provider).
      provider: false,
      reads: "none",
      writes: "none",
      approval: false,
      lifecycleInfluenced: Boolean(profile.entities.pendingProposedAction),
    },
  );
}

for (const profile of profiles.slice(0, 6)) {
  cases.push({
    id: `${profile.id}-correction`,
    profile,
    category: "J correction",
    query: "아니 그거 말고 렉스토라 앱 자체가 뭐냐고.",
    mode: "DIRECT_ANSWER",
    topic: "rextora_product",
    provider: true,
    reads: "none",
    writes: "none",
    approval: false,
    lifecycleInfluenced: false,
  });
}

const approvalProfiles = [
  profiles[1]!,
  profiles[5]!,
  profiles[8]!,
  profiles[7]!,
  profiles[0]!,
  profiles[6]!,
];
for (const profile of approvalProfiles) {
  const exact = profile.approvals.length === 1 && profile.id !== "stale-expired-approval";
  cases.push({
    id: `${profile.id}-approve`,
    profile,
    category: "G approval command",
    query: profile.id === "stale-expired-approval" ? "아까 거 진행해." : "진행해.",
    mode: exact ? "APPROVAL_CONTROL" : "CLARIFY_REFERENCE",
    topic: "approval_control",
    provider: false,
    reads: "none",
    writes: "none",
    approval: false,
    lifecycleInfluenced: exact || profile.approvals.length > 0,
  });
}

// 72 required cases above; these broaden B/E/H/L language categories.
for (const profile of profiles.slice(0, 5)) {
  cases.push(
    {
      id: `${profile.id}-feature`,
      profile,
      category: "B feature",
      query: "백테스트가 뭐야?",
      mode: "DIRECT_ANSWER",
      topic: "feature_backtest",
      provider: true,
      reads: "none",
      writes: "none",
      approval: false,
      lifecycleInfluenced: false,
    },
    {
      id: `${profile.id}-analysis`,
      profile,
      category: "E result analysis",
      query: "최근 검증된 전략의 위험한 점을 설명해줘.",
      mode: "READ_AND_ANSWER",
      topic: "strategy_risk",
      provider: true,
      reads: "some",
      writes: "none",
      approval: false,
      lifecycleInfluenced: false,
    },
    {
      id: `${profile.id}-casual`,
      profile,
      category: "L casual",
      query: "내 질문에 답해.",
      mode: "DIRECT_ANSWER",
      topic: "unknown",
      provider: true,
      reads: "none",
      writes: "none",
      approval: false,
      lifecycleInfluenced: false,
    },
    {
      id: `${profile.id}-cancel`,
      profile,
      category: "H cancellation",
      query: "아냐 취소.",
      mode:
        profile.approvals.length === 1
          ? "APPROVAL_CONTROL"
          : "CLARIFY_REFERENCE",
      topic: "approval_control",
      provider: false,
      reads: "none",
      writes: "none",
      approval: false,
      lifecycleInfluenced: profile.approvals.length === 1,
    },
  );
}

describe("conversation-first semantic routing matrix", () => {
  it("contains at least 72 semantic cases and all required categories", () => {
    expect(cases.length).toBeGreaterThanOrEqual(72);
    const categories = new Set(cases.map((item) => item.category[0]));
    for (const category of ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]) {
      expect(categories.has(category)).toBe(true);
    }
  });

  for (const item of cases) {
    it(`${item.category} · ${item.id}`, () => {
      const before = JSON.stringify({
        entities: item.profile.entities,
        approvals: item.profile.approvals,
      });
      const route = routeConversationTurn({
        query: item.query,
        history: item.profile.history,
        entities: item.profile.entities,
        lifecycleStage: item.profile.lifecycleStage,
        pendingApprovals: item.profile.approvals,
      });

      expect(route.mode).toBe(item.mode);
      expect(route.topic).toBe(item.topic);
      expect(route.providerExpected).toBe(item.provider);
      expect(route.requiresApproval).toBe(item.approval);
      expect(route.lifecycleInfluencedRouting).toBe(item.lifecycleInfluenced);
      expect(route.requestedReadTools.length > 0).toBe(item.reads === "some");
      expect(route.requestedWriteTools.length > 0).toBe(item.writes === "some");

      if (route.mode === "CLARIFY_REFERENCE") {
        expect(route.clarificationQuestionKo).toBeTruthy();
      }
      if (route.mode === "APPROVAL_CONTROL") {
        expect(route.resolvedReference?.kind).toBe("approval");
        expect(route.providerExpected).toBe(false);
      }

      const answer = deterministicConversationAnswer({
        query: item.query,
        route,
      });
      if (answer) {
        const visible = sanitizePrimaryUserParagraphs([
          answer.conclusionKo,
          answer.explanationKo,
        ]);
        expect(countPrimaryTextLeaks(visible)).toBe(0);
      }

      expect(
        JSON.stringify({
          entities: item.profile.entities,
          approvals: item.profile.approvals,
        }),
      ).toBe(before);
    });
  }

  it("keeps the research-brain conversation grounded while separating reads and plans", () => {
    const researchCases = [
      ["이전 탐색과 겹치지 않는 연구를 해줘", "PLAN_AND_APPROVE"],
      ["왜 이 조합을 추천해?", "READ_AND_ANSWER"],
      ["실패 원인을 분석하고 다른 설정으로 다시 해", "PLAN_AND_APPROVE"],
      ["두 전략 중 무엇을 먼저 백테스트해야 해?", "READ_AND_ANSWER"],
      ["수수료 때문에 실패한 건지 분석해", "READ_AND_ANSWER"],
      ["MDD가 높아진 원인을 근거로 설명해", "READ_AND_ANSWER"],
      ["아직 검증하지 않은 패턴 조합을 찾아줘", "PLAN_AND_APPROVE"],
    ] as const;
    for (const [query, expectedMode] of researchCases) {
      const route = routeConversationTurn({
        query,
        history: [],
        entities: profiles[4]!.entities,
        lifecycleStage: "backtest_review",
        pendingApprovals: [],
      });
      expect(route.mode, query).toBe(expectedMode);
      expect(route.legacyIntent, query).toBe("research_analysis");
      expect(route.needsWorkspaceFacts).toBe(true);
      expect(route.lifecycleInfluencedRouting).toBe(false);
      if (expectedMode === "READ_AND_ANSWER") {
        expect(route.requestedWriteTools).toEqual([]);
      } else {
        expect(route.requiresApproval).toBe(true);
      }
    }
  });

  it("maps workspace status questions to search_status when search is active", () => {
    const route = routeConversationTurn({
      query: "현재 진행 상황 알려줘.",
      history: [],
      entities: {
        ...profiles[2]!.entities,
        jobId: null,
        pipelineStage: "search_running",
        lifecycleStage: "search_running",
      },
      lifecycleStage: "search_running",
      pendingApprovals: [],
    });
    expect(route.mode).toBe("READ_AND_ANSWER");
    expect(route.topic).toBe("search_status");
    expect(route.requestedReadTools).toEqual(["search.list"]);
    expect(route.requestedWriteTools).toEqual([]);
  });

  it("does not let Results-page keywords override memory recall", () => {
    for (const query of [
      "우리가 무엇을 배웠어?",
      "이전 결정과 결과를 기억해서 알려줘",
    ]) {
      const route = routeConversationTurn({
        query,
        history: [],
        entities: profiles[4]!.entities,
        lifecycleStage: "backtest_review",
        pendingApprovals: [],
      });
      expect(route.mode, query).toBe("READ_AND_ANSWER");
      expect(route.legacyIntent, query).toBe("memory_recall");
      expect(route.requestedReadTools, query).toEqual(["memory.recall"]);
      expect(route.requestedWriteTools, query).toEqual([]);
      expect(route.requiresApproval, query).toBe(false);
      expect(route.topic, query).not.toBe("feature_results");
    }
  });

  it("refuses Live activation and SAFE mutation before conversational short-circuit", () => {
    const cases = [
      ["Live 시작해", "start_live"],
      ["BTC 실전 주문 넣어", "execute_trade"],
      ["SAFE 수정해", "modify_safe"],
    ] as const;
    for (const [query, intent] of cases) {
      const route = routeConversationTurn({
        query,
        history: [],
        entities: profiles[6]!.entities,
        lifecycleStage: "paper_active",
        pendingApprovals: profiles[6]!.approvals,
      });
      expect(route.mode, query).toBe("SAFE_REFUSAL");
      expect(route.legacyIntent, query).toBe(intent);
      expect(route.requiresApproval, query).toBe(false);
      expect(route.requestedWriteTools, query).toEqual([]);
      expect(route.providerExpected, query).toBe(false);
    }
  });
});

