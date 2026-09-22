import { describe, expect, it } from "vitest";
import { POST } from "../app/api/rextora/agent/route";
import { emptyEntityMemory } from "../src/lib/rextora/agent/conversationContext";
import type { ProposedAction } from "../src/lib/rextora/agent/proposedAction";
import type { AgentResponse } from "../src/lib/rextora/agent/types";
import { countPrimaryTextLeaks } from "../src/lib/rextora/agent/v2/reasoning/primaryLeakDetector";
import { authedRequest } from "./helpers/authSession";

function paperApproval(
  id = "pa_api_paper",
  expiresAt = "2099-01-01T00:00:00.000Z",
): ProposedAction {
  return {
    actionId: id,
    actionType: "open_paper_approval",
    summary: "모의매매 승인 대기",
    reason: "검증 결과 확인",
    targetRoute: "/paper-trading",
    strategyId: "strategy_api",
    jobId: null,
    runId: "run_api",
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

async function ask(input: {
  query: string;
  history?: Array<{ role: "user" | "agent"; content: string; timestamp: string }>;
  pendingApprovals?: ProposedAction[];
  pending?: ProposedAction | null;
}) {
  const pending = input.pending ?? null;
  const request = await authedRequest("http://localhost/api/rextora/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: input.query,
      sessionId: `agent_api${Math.random().toString(36).slice(2, 12)}`,
      turnId: `turn_${Math.random().toString(36).slice(2, 12)}`,
      history: input.history ?? [],
      pendingProposedAction: pending,
      pendingApprovals: input.pendingApprovals ?? (pending ? [pending] : []),
      entityMemory: {
        ...emptyEntityMemory(),
        pipelineStage: "paper_active",
        lifecycleStage: "paper_active",
        paperSessionId: "paper_active_api",
        pendingProposedAction: pending,
      },
    }),
  });
  const response = await POST(request);
  expect(response.status).toBe(200);
  return (await response.json()) as AgentResponse;
}

function visible(response: AgentResponse): string {
  return [
    response.conclusionKo,
    response.explanationKo,
    response.recommendedActionKo,
    response.safetyReasonKo,
  ]
    .filter(Boolean)
    .join("\n");
}

describe("conversation-first Agent API", () => {
  it(
    "answers product question despite stale Paper workflow and preserves workflow",
    async () => {
      const pending = paperApproval();
      const response = await ask({
        query: "렉스토라는 뭐 하는 앱이야?",
        pending,
      });
      expect(response.conversationRoute?.mode).toBe("DIRECT_ANSWER");
      expect(response.conversationRoute?.topic).toBe("rextora_product");
      expect(visible(response)).toMatch(/AI\s*트레이딩\s*직원|렉스토라/);
      expect(visible(response)).not.toMatch(/승인\s*대기|세션\s*상태|paper_active/i);
      expect(response.proposedAction).toBeNull();
      expect(response.entityMemory?.pendingProposedAction?.actionId).toBe(
        pending.actionId,
      );
      expect(countPrimaryTextLeaks(visible(response))).toBe(0);
    },
    60_000,
  );

  it(
    "preserves product topic for simpler follow-up",
    async () => {
      const response = await ask({
        query: "좀 더 쉽게 설명해줘.",
        history: [
          {
            role: "user",
            content: "렉스토라는 뭐 하는 앱이야?",
            timestamp: "2026-08-05T00:00:00.000Z",
          },
          {
            role: "agent",
            content: "렉스토라는 AI 트레이딩 직원입니다.",
            timestamp: "2026-08-05T00:00:01.000Z",
          },
        ],
        pending: paperApproval(),
      });
      expect(response.conversationRoute?.mode).toBe("DIRECT_ANSWER");
      expect(response.conversationRoute?.topic).toBe("rextora_product");
      expect(visible(response)).toMatch(/쉽게|간단|요약|직원|연구|전략/);
      expect(response.proposedAction).toBeNull();
    },
    60_000,
  );

  it("clarifies ambiguous deictic question instead of starting Paper", async () => {
    const response = await ask({
      query: "이건 뭐하는거야?",
      pending: paperApproval(),
    });
    expect(response.conversationRoute?.mode).toBe("CLARIFY_REFERENCE");
    expect(response.conclusionKo).toMatch(/말씀하시는|알려/);
    expect(response.proposedAction).toBeNull();
    expect(response.actions).toHaveLength(0);
    expect(response.reasoningMeta).toBeUndefined();
  });

  it(
    "understands explicit correction after ambiguous question",
    async () => {
      const response = await ask({
        query: "아니 렉스토라 앱 자체가 뭐냐고.",
        history: [
          {
            role: "user",
            content: "이건 뭐하는거야?",
            timestamp: "2026-08-05T00:00:00.000Z",
          },
          {
            role: "agent",
            content: "어떤 대상을 말씀하시는지 알려 주세요.",
            timestamp: "2026-08-05T00:00:01.000Z",
          },
        ],
        pending: paperApproval(),
      });
      expect(response.conversationRoute?.mode).toBe("DIRECT_ANSWER");
      expect(response.conversationRoute?.topic).toBe("rextora_product");
      expect(visible(response)).toMatch(/AI\s*트레이딩\s*직원|렉스토라/);
    },
    60_000,
  );

  it(
    "answers Backtest concept without Paper takeover",
    async () => {
      const response = await ask({
        query: "백테스트가 뭐야?",
        pending: paperApproval(),
      });
      expect(response.conversationRoute?.mode).toBe("DIRECT_ANSWER");
      expect(response.conversationRoute?.topic).toBe("feature_backtest");
      expect(visible(response)).toMatch(/과거|백테스트|검증|시뮬레이션/);
      expect(response.proposedAction).toBeNull();
    },
    60_000,
  );

  it("clarifies multiple pending approvals and executes nothing", async () => {
    const first = paperApproval("pa_api_one");
    const second = paperApproval("pa_api_two");
    const response = await ask({
      query: "진행해.",
      pending: first,
      pendingApprovals: [first, second],
    });
    expect(response.conversationRoute?.mode).toBe("CLARIFY_REFERENCE");
    expect(response.executionResult).toBeUndefined();
    expect(response.proposedAction).toBeNull();
    expect(response.conclusionKo).toContain("어떤 승인");
  });

  it("rejects stale approval without rebuilding or executing", async () => {
    const stale = paperApproval(
      "pa_api_stale",
      "2000-01-01T00:00:00.000Z",
    );
    const response = await ask({
      query: "아까 거 진행해.",
      pendingApprovals: [stale],
      pending: null,
    });
    expect(response.conversationRoute?.mode).toBe("CLARIFY_REFERENCE");
    expect(response.conclusionKo).toContain("더 이상 실행할 수 없습니다");
    expect(response.executionResult).toBeUndefined();
  });

  it.each([
    ["실전매매 바로 시작해.", "실전매매"],
    ["바이낸스에 실제 주문 넣어.", "거래소"],
    ["SAFE 전략 파일 수정해.", "폐기"],
    ["API 키 보여줘.", "API 키"],
  ])("returns natural SAFE refusal: %s", async (query, expected) => {
    const response = await ask({ query });
    expect(response.conversationRoute?.mode).toBe("SAFE_REFUSAL");
    expect(response.safetyBlocked).toBe(true);
    expect(visible(response)).toContain(expected);
    expect(visible(response)).not.toMatch(/POLICY_|SAFE_MUTATION|execute_trade/);
    expect(response.executionResult).toBeUndefined();
    expect(countPrimaryTextLeaks(visible(response))).toBe(0);
  });
});

