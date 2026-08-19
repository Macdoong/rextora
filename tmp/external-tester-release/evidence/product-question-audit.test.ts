import { describe, it } from "vitest";
import { parseIntent } from "@/src/lib/rextora/agent/intentParser";
import { detectGoal } from "@/src/lib/rextora/agent/goalDetector";
import { emptyEntityMemory } from "@/src/lib/rextora/agent/conversationContext";
import { classifyExecutionRequest } from "@/src/lib/rextora/agent/executionRequestClassifier";
import {
  containsForbiddenPrimaryText,
  sanitizePrimaryUserText,
} from "@/src/lib/rextora/agent/v2/reasoning/userVisibleSanitizer";
import { buildDecisionContext } from "@/src/lib/rextora/agent/decisionContext";
import { buildLocalInterpretation } from "@/src/lib/rextora/agent/agentResponseBuilder";
import { buildFallbackReasoning } from "@/src/lib/rextora/agent/v2/reasoning/reasoningFallback";
import { buildReasoningInput } from "@/src/lib/rextora/agent/v2/reasoning/reasoningEngine";

describe("product question audit", () => {
  const q1 = "이건 뭐하는거야?";
  const q2 = "아니 렉스토라가 뭐하는 앱이냐고";
  const paperCtx = {
    ...emptyEntityMemory(),
    pipelineStage: "paper_active" as const,
    lifecycleStage: "paper_active",
    paperSessionId: "paper_sess_demo",
    pendingProposedAction: {
      actionId: "pa_paper",
      actionType: "open_paper_approval" as const,
      summary: "모의매매 세션 준비",
      reason: "test",
      targetRoute: "/paper-trading",
      strategyId: "strat_x",
      jobId: null,
      runId: "bt_x",
      symbol: "BTCUSDT",
      timeframe: "15m",
      parameters: {},
      requiresApproval: true,
      riskLevel: "medium" as const,
      blockedReason: null,
      createdAt: new Date().toISOString(),
      expiresAt: null,
    },
    pendingPlan: null,
    previousConclusion: "모의매매 준비가 필요합니다.",
    previousRecommendation: "Paper approval pending",
  };

  for (const [label, q] of [
    ["turn1", q1],
    ["turn2", q2],
  ] as const) {
    it(`${label} intent paths`, () => {
      const parsed = parseIntent(q);
      const noCtx = detectGoal({ query: q });
      const paper = detectGoal({
        query: q,
        entities: paperCtx,
        lifecycleStage: "paper_active",
      });
      const exec = classifyExecutionRequest(q);
      console.log(JSON.stringify({ label, parsed, noCtx, paper, exec }, null, 2));
    });
  }

  it("response paths for paper ctx turn1", () => {
    const detected = detectGoal({
      query: q1,
      entities: paperCtx,
      lifecycleStage: "paper_active",
    });
    const facts = [
      {
        labelKo: "대기 제안",
        value: paperCtx.pendingProposedAction!.summary,
        source: "system_status" as const,
        fetchedAt: new Date().toISOString(),
      },
    ];
    const decision = buildDecisionContext(detected.intent.type, facts, paperCtx);
    const local = buildLocalInterpretation(detected.intent, facts, paperCtx);
    const input = buildReasoningInput({
      query: q1,
      sessionId: "audit_sess",
      intentType: detected.intent.type,
      goal: detected.goal,
      facts,
      history: [],
      context: null,
      entities: paperCtx,
      lifecycleStage: "paper_active",
      pendingPlan: null,
      pendingProposedAction: paperCtx.pendingProposedAction,
    });
    const fallback = buildFallbackReasoning(input);
    console.log(
      JSON.stringify(
        {
          intent: detected.intent.type,
          goal: detected.goal,
          method: detected.method,
          decision,
          local,
          fallbackConclusion: fallback.conclusionKo,
          fallbackExplanation: fallback.explanationKo,
        },
        null,
        2,
      ),
    );
  });

  it("sanitizer and UI leak vectors", () => {
    const samples = [
      "paper_active",
      "Paper approval state",
      "Paper approval pending",
      "현재 상황 · paper_active",
      "승인 설명 · pending approval",
    ];
    for (const s of samples) {
      const out = sanitizePrimaryUserText(s);
      console.log({ in: s, out, forbidden: containsForbiddenPrimaryText(out) });
    }
  });
});
