import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFallbackReasoning } from "../src/lib/rextora/agent/v2/reasoning/reasoningFallback";
import { buildReasoningInput, runReasoningEngine } from "../src/lib/rextora/agent/v2/reasoning/reasoningEngine";
import { emptyEntityMemory } from "../src/lib/rextora/agent/conversationContext";
import { reasoningToProposedAction } from "../src/lib/rextora/agent/v2/reasoning/reasoningResponseBuilder";
import { callReasoningProvider } from "../src/lib/rextora/agent/v2/reasoning/reasoningProvider";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.AI_AGENT_PROVIDER;
  delete process.env.GEMINI_API_KEY;
});

describe("AgentV2ProviderFallback", () => {
  it("builds exact approved pause and resume controls from verified job context", () => {
    const pauseInput = buildReasoningInput({
      query: "현재 작업 중지해",
      sessionId: null,
      intentType: "search_pause_request",
      goal: "pause_search",
      facts: [],
      history: [],
      context: { jobId: "search_exact" },
      entities: emptyEntityMemory(),
    });
    expect(buildFallbackReasoning(pauseInput).toolPlan[0]).toMatchObject({
      toolId: "search.pause",
      arguments: { jobId: "search_exact" },
      requiresApproval: true,
    });
    expect(buildFallbackReasoning({
      ...pauseInput,
      query: "다시 시작해",
      intentType: "search_resume_request",
    }).toolPlan[0]).toMatchObject({
      toolId: "search.start",
      arguments: { jobId: "search_exact" },
    });
  });

  it("falls back deterministically when provider unavailable", async () => {
    const input = buildReasoningInput({
      query: "새 전략 탐색해",
      sessionId: null,
      intentType: "prepare_search_plan",
      goal: "plan_search",
      facts: [],
      history: [],
      context: null,
      entities: emptyEntityMemory(),
    });
    const artifact = buildFallbackReasoning(input);
    expect(artifact.fallbackUsed).toBe(true);
    expect(artifact.provider).toBe("local");
    expect(artifact.conclusionKo).toBeTruthy();
    expect(artifact.toolPlan.length).toBeGreaterThan(0);
  });

  it("preserves verified Search identity when entity memory is empty", () => {
    const input = buildReasoningInput({
      query: "BTCUSDT 15분봉 새 탐색 계획을 준비해줘.",
      sessionId: null,
      intentType: "prepare_search_plan",
      goal: "plan_search",
      facts: [
        { labelKo: "초안 심볼", value: "BTCUSDT", source: "strategy_search_jobs", fetchedAt: new Date().toISOString() },
        { labelKo: "초안 타임프레임", value: "15m", source: "strategy_search_jobs", fetchedAt: new Date().toISOString() },
        { labelKo: "초안 패턴", value: "Order Block + Fair Value Gap", source: "strategy_search_jobs", fetchedAt: new Date().toISOString() },
      ],
      history: [],
      context: null,
      entities: emptyEntityMemory(),
    });

    const artifact = buildFallbackReasoning(input);
    const create = artifact.toolPlan.find((step) => step.toolId === "search.create");
    expect(create?.arguments.createBody).toMatchObject({
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      operatorPlan: { selectedSpaceIds: ["order_block", "fvg"] },
    });
  });

  it("blocks live requests in fallback", () => {
    const input = buildReasoningInput({
      query: "Live 시작해",
      sessionId: null,
      intentType: "start_live",
      goal: "blocked_live",
      facts: [],
      history: [],
      context: null,
      entities: emptyEntityMemory(),
    });
    const artifact = buildFallbackReasoning(input);
    expect(artifact.riskLevel).toBe("blocked");
    expect(artifact.toolPlan).toHaveLength(0);
  });

  it("prepares an executable paper plan from verified strategy facts", () => {
    const input = buildReasoningInput({
      query: "이 전략 모의매매까지 준비해.",
      sessionId: null,
      intentType: "prepare_paper_plan",
      goal: "prepare_paper",
      facts: [
        {
          labelKo: "후보 전략 ID",
          value: "SAFE_v44_i4060",
          source: "strategy_store",
          fetchedAt: new Date().toISOString(),
        },
        {
          labelKo: "후보 전략",
          value: "보호된 SAFE 전략",
          source: "strategy_store",
          fetchedAt: new Date().toISOString(),
        },
      ],
      history: [],
      context: null,
      entities: emptyEntityMemory(),
    });

    const artifact = buildFallbackReasoning(input);
    expect(artifact.requiresApproval).toBe(true);
    expect(artifact.toolPlan).toHaveLength(1);
    expect(artifact.toolPlan[0]?.toolId).toBe("paper.prepare");
    expect(artifact.toolPlan[0]?.arguments).toMatchObject({
      strategyId: "SAFE_v44_i4060",
    });
    expect(artifact.toolPlan[0]?.arguments).not.toHaveProperty("requireApproval");
    expect(reasoningToProposedAction(artifact)).toMatchObject({
      actionType: "open_paper_approval",
      targetRoute: "/paper-trading",
      strategyId: "SAFE_v44_i4060",
      requiresApproval: true,
    });
  });

  it("targets the persisted active job when status fallback uses verified facts", () => {
    const input = buildReasoningInput({
      query: "현재 연구가 어디까지 진행됐어?",
      sessionId: null,
      intentType: "search_status",
      goal: "monitor_search",
      facts: [
        {
          labelKo: "최근 작업 ID",
          value: "search_verified_active",
          source: "strategy_search_jobs",
          fetchedAt: new Date().toISOString(),
        },
      ],
      history: [],
      context: null,
      entities: emptyEntityMemory(),
    });

    const artifact = buildFallbackReasoning(input);
    expect(artifact.toolPlan).toHaveLength(1);
    expect(artifact.toolPlan[0]).toMatchObject({
      toolId: "search.status",
      arguments: { jobId: "search_verified_active" },
      requiresApproval: false,
    });
  });

  it("keeps status and continuation controls local and deterministic", async () => {
    const input = buildReasoningInput({
      query: "이어서 진행해",
      sessionId: "agent_provider_abort_safe",
      intentType: "continue_session",
      goal: "continue_session",
      facts: [{
        labelKo: "최근 작업 ID",
        value: "search_verified_active",
        source: "strategy_search_jobs",
        fetchedAt: new Date().toISOString(),
      }],
      history: [],
      context: { jobId: "search_verified_active" },
      entities: emptyEntityMemory(),
    });
    const result = await runReasoningEngine(input);
    expect(result.artifact.provider).toBe("local");
    expect(result.artifact.toolPlan[0]).toMatchObject({
      toolId: "search.status",
      arguments: { jobId: "search_verified_active" },
    });
  });

  it("converts an aborted provider response body into a fallback signal", async () => {
    process.env.AI_AGENT_PROVIDER = "gemini";
    process.env.GEMINI_API_KEY = "configured-test-key";
    vi.stubGlobal("fetch", vi.fn(async () => ({
      json: async () => {
        const error = new Error("body aborted");
        error.name = "AbortError";
        throw error;
      },
    })));
    const input = buildReasoningInput({
      query: "새 전략 탐색해",
      sessionId: null,
      intentType: "prepare_search_plan",
      goal: "plan_search",
      facts: [], history: [], context: null, entities: emptyEntityMemory(),
    });
    const result = await callReasoningProvider(input);
    expect(result.ok).toBe(false);
    expect(result.errorKo).toContain("시간 초과");
    expect(result.parsed.artifact).toBeNull();
  });
});
