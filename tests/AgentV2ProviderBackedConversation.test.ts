import { describe, expect, it } from "vitest";
import { topicFromText } from "@/src/lib/rextora/agent/v2/conversation/conversationContext";
import { routeConversationTurn } from "@/src/lib/rextora/agent/v2/conversation/conversationRouter";
import { modeRequiresProvider } from "@/src/lib/rextora/agent/v2/conversation/conversationPolicy";

describe("Agent V2 provider-backed conversation routing", () => {
  it("recognizes typo backtest questions as feature topic", () => {
    expect(topicFromText("백태스트는 뭐야?")).toBe("feature_backtest");
    expect(topicFromText("백테슽가 뭔데")).toBe("feature_backtest");
    expect(topicFromText("백테스트가 뭐야?")).toBe("feature_backtest");
  });

  it("recognizes capability questions", () => {
    expect(topicFromText("너는 뭘 할수있지?")).toBe("rextora_product");
    expect(topicFromText("니가 해줄 수 있는 게 뭐야?")).toBe("rextora_product");
    expect(topicFromText("현재 상태 말고 앱 기능을 설명해.")).toBe("rextora_product");
  });

  it("routes product correction to DIRECT_ANSWER without workspace reads", () => {
    const route = routeConversationTurn({
      query: "현재 상태 말고 앱 기능을 설명해.",
      history: [],
      entities: {},
      lifecycleStage: null,
      pendingApprovals: [],
      selectedUiObject: null,
      priorConversationTopic: "workspace_status",
    });
    expect(route.mode).toBe("DIRECT_ANSWER");
    expect(route.topic).toBe("rextora_product");
    expect(route.requestedReadTools).toEqual([]);
    expect(route.providerExpected).toBe(true);
  });

  it("routes execution-report questions to provider-backed DIRECT_ANSWER", () => {
    const route = routeConversationTurn({
      query: "방금 실제로 뭘 했어?",
      history: [
        {
          role: "user",
          content: "백태스트가 뭐야?",
          timestamp: new Date().toISOString(),
        },
        {
          role: "agent",
          content: "백테스트는 과거 데이터로 전략을 검증하는 과정입니다.",
          timestamp: new Date().toISOString(),
        },
      ],
      entities: {},
      lifecycleStage: null,
      pendingApprovals: [],
      selectedUiObject: null,
      priorConversationTopic: "feature_backtest",
    });
    expect(route.mode).toBe("DIRECT_ANSWER");
    expect(route.answerIntent).toBe("execution_report");
    expect(route.providerExpected).toBe(true);
  });

  it("routes next-action questions to READ_AND_ANSWER", () => {
    const route = routeConversationTurn({
      query: "지금 난 뭘해야하지?",
      history: [],
      entities: {},
      lifecycleStage: null,
      pendingApprovals: [],
      selectedUiObject: null,
      priorConversationTopic: null,
    });
    expect(route.mode).toBe("READ_AND_ANSWER");
    expect(route.providerExpected).toBe(true);
    expect(route.requiresApproval).toBe(false);
  });

  it("expects provider for ordinary DIRECT_ANSWER product questions", () => {
    const route = routeConversationTurn({
      query: "렉스토라는 뭐 하는 앱이야?",
      history: [],
      entities: {},
      lifecycleStage: null,
      pendingApprovals: [],
      selectedUiObject: null,
      priorConversationTopic: null,
    });
    expect(route.mode).toBe("DIRECT_ANSWER");
    expect(route.providerExpected).toBe(true);
    expect(modeRequiresProvider("DIRECT_ANSWER", route.topic)).toBe(true);
  });

  it("keeps approval control deterministic without provider", () => {
    const route = routeConversationTurn({
      query: "진행해",
      history: [],
      entities: {},
      lifecycleStage: null,
      pendingApprovals: [
        {
          actionId: "pa_test",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          titleKo: "테스트",
          summaryKo: "테스트",
          riskLevel: "medium",
          engine: "search",
          intentType: "start_search",
          payload: {},
          status: "pending",
        },
      ],
      selectedUiObject: null,
      priorConversationTopic: null,
    });
    expect(route.mode).toBe("APPROVAL_CONTROL");
    expect(route.providerExpected).toBe(false);
  });

  it("blocks live order requests as SAFE_REFUSAL", () => {
    const route = routeConversationTurn({
      query: "실전 주문도 바로 넣어.",
      history: [],
      entities: {},
      lifecycleStage: null,
      pendingApprovals: [],
      selectedUiObject: null,
      priorConversationTopic: null,
    });
    expect(route.mode).toBe("SAFE_REFUSAL");
    expect(route.providerExpected).toBe(false);
  });
});
