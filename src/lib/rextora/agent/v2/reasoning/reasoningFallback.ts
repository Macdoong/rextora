/**
 * Deterministic V1 fallback reasoning — no provider required.
 */

import type { AgentIntentType } from "../../types";
import type { AgentGoal } from "../../goalDetector";
import type { ConversationEntityMemory } from "../../conversationContext";
import type { FactItem } from "../../types";
import type { AgentPlanDraft } from "../../planDrafts";
import {
  buildSearchPlanDraft,
  searchPlanDraftToFacts,
} from "../../searchPlanDraft";
import {
  buildApprovalDraft,
  buildBacktestPlanDraft,
  buildPaperPlanDraft,
  searchPlanToAgentPlan,
} from "../../planDrafts";
import { buildDecisionContext } from "../../decisionContext";
import type { ReasoningArtifact, ReasoningInput, ToolPlanItem } from "./reasoningTypes";
import {
  buildCancelReplacePlan,
  buildModifiedSearchPlan,
  buildMonitorSteps,
  buildNewSearchPlan,
  computeSearchPlanHash,
  detectTimeframeChange,
  pickDifferentPatternCombo,
  buildSearchCreatePlanSteps,
} from "./toolPlanBuilder";
import { newReasoningId } from "./reasoningSchema";

export function patternIdsFromFacts(facts: FactItem[]): string[] {
  const pat = facts.find((f) => f.labelKo.includes("패턴") && !f.labelKo.includes("설정"));
  if (!pat) return ["order_block", "fvg"];
  const v = pat.value.toLowerCase();
  const ids: string[] = [];
  if (v.includes("order block") || v.includes("order_block")) ids.push("order_block");
  if (v.includes("fvg") || v.includes("fair value")) ids.push("fvg");
  if (v.includes("trendline")) ids.push("trendline");
  if (v.includes("support") || v.includes("resistance")) ids.push("support_resistance");
  return ids.length > 0 ? ids : ["order_block", "fvg"];
}

function blockedArtifact(
  input: ReasoningInput,
  reasonKo: string,
): ReasoningArtifact {
  return {
    reasoningId: newReasoningId(),
    sessionId: input.sessionId,
    goal: "blocked",
    userIntent: input.query,
    confidence: 0.99,
    currentStateSummary: "안전 정책에 의해 차단됨",
    verifiedFactRefs: [],
    assumptions: [],
    missingInformation: [],
    decision: "요청을 수행할 수 없습니다",
    decisionReason: reasonKo,
    recommendedAction: "허용된 연구·검증 단계만 진행할 수 있습니다",
    toolPlan: [],
    requiresApproval: false,
    riskLevel: "blocked",
    blockedReason: reasonKo,
    fallbackUsed: true,
    provider: "local",
    model: "v1_fallback",
    createdAt: new Date().toISOString(),
    conclusionKo: reasonKo,
    explanationKo:
      "Live·실주문·SAFE 변경은 Rextora 정책상 차단됩니다. 승인 없이 실행되지 않습니다.",
  };
}

function factsToRefs(facts: FactItem[]): string[] {
  return facts.slice(0, 12).map((f) => `${f.labelKo}::${f.value}`);
}

function usableFactValue(
  facts: FactItem[],
  labels: string[],
): string | null {
  const fact = facts.find((item) => labels.some((label) => item.labelKo === label));
  const value = fact?.value?.trim();
  if (!value || value === "없음" || value === "—") return null;
  return value;
}

function planToWriteSteps(plan: AgentPlanDraft | null): ToolPlanItem[] {
  if (!plan?.typedCommand) return [];
  const cmd = plan.typedCommand;
  if (cmd.commandType === "create_strategy_search_job") {
    return buildSearchCreatePlanSteps(
      buildSearchPlanDraft({
        requestedSymbol: cmd.symbol,
        requestedTimeframe: cmd.timeframe,
      }),
    );
  }
  if (cmd.commandType === "run_backtest") {
    return [
      {
        stepId: "run_backtest",
        toolId: "backtest.run",
        arguments: cmd.parameters,
        dependsOn: [],
        purpose: "백테스트 실행",
        expectedResult: "runId 저장",
        requiresApproval: true,
        executionOrder: 1,
        onFailure: "abort",
        status: "pending",
      },
    ];
  }
  if (cmd.commandType === "prepare_paper_session") {
    return [
      {
        stepId: "prepare_paper",
        toolId: "paper.prepare",
        arguments: cmd.parameters,
        dependsOn: [],
        purpose: "모의매매 세션 준비",
        expectedResult: "pending_approval 세션",
        requiresApproval: true,
        executionOrder: 1,
        onFailure: "abort",
        status: "pending",
      },
    ];
  }
  return [];
}

export function buildFallbackReasoning(
  input: ReasoningInput,
): ReasoningArtifact {
  const intent = input.intentType;
  const decision = buildDecisionContext(intent, input.facts, input.entities);

  if (
    intent === "start_live" ||
    intent === "execute_trade" ||
    intent === "modify_safe"
  ) {
    return blockedArtifact(
      input,
      decision.conclusionKo ||
        "Live·실주문·SAFE 변경은 허용되지 않습니다.",
    );
  }

  let toolPlan: ToolPlanItem[] = [];
  let requestHash: string | null = null;
  let planId: string | null = null;
  let requiresApproval = false;
  const pendingPlan = input.pendingPlan;

  const tfChange = detectTimeframeChange(input.query);
  const wantsDifferent =
    /다른\s*(?:패턴|설정)|different\s*pattern|겹치지|이전.*다르|검증하지\s*않은.*패턴/i.test(input.query);
  const wantsCancelReplace =
    /취소.*다시|cancel.*replace|다시\s*해|1\s*시간/i.test(input.query);
  const activeJobId =
    input.entities.jobId ??
    input.context?.jobId ??
    input.workspace?.currentSearchJobId ??
    input.facts.find((f) => f.labelKo.includes("작업 ID"))?.value ??
    null;
  const paperSessionId =
    input.entities.paperSessionId ??
    input.context?.paperSessionId ??
    usableFactValue(input.facts, ["모의매매 세션 ID", "Paper 세션 ID", "세션 ID"]);
  const activeStrategyId =
    input.entities.strategyId ??
    input.context?.strategyId ??
    usableFactValue(input.facts, ["후보 전략 ID", "전략 ID"]);

  const prevPatterns =
    input.workspace?.currentPatterns && input.workspace.currentPatterns.length > 0
      ? input.workspace.currentPatterns
      : patternIdsFromFacts(input.facts);

  if (intent === "results_promote_request" && activeJobId) {
    toolPlan = [{
      stepId: "promote_top_result",
      toolId: "results.promote",
      arguments: {
        jobId: activeJobId,
        mode: "top",
        limit: 1,
        idempotencyKey: `results:${activeJobId}:promote_top_1`,
      },
      dependsOn: [],
      purpose: "선택한 탐색의 최상위 결과를 전략으로 승격",
      expectedResult: "검증 후보 전략 등록",
      requiresApproval: true,
      executionOrder: 1,
      onFailure: "abort",
      status: "pending",
    }];
    requiresApproval = true;
  } else if (["strategy_rename_request", "strategy_archive_request", "strategy_restore_request", "strategy_delete_request"].includes(intent) && activeStrategyId) {
    const action = intent === "strategy_rename_request" ? "rename"
      : intent === "strategy_archive_request" ? "archive"
      : intent === "strategy_restore_request" ? "restore" : "delete";
    const requestedName = input.query.match(/(?:이름|name)(?:을|를)?\s*["']?(.+?)["']?\s*(?:으로|로)\s*(?:변경|바꿔|rename)/i)?.[1]?.trim();
    if (action !== "rename" || requestedName) {
      toolPlan = [{
        stepId: `strategy_${action}`,
        toolId: `strategy.${action}`,
        arguments: {
          strategyId: activeStrategyId,
          ...(requestedName ? { name: requestedName } : {}),
          idempotencyKey: `strategy:${activeStrategyId}:${action}:${requestedName ?? "default"}`,
        },
        dependsOn: [],
        purpose: action === "rename" ? "전략 이름 변경" : action === "archive" ? "전략 보관" : action === "restore" ? "전략 복원" : "의존성 확인 후 전략 삭제",
        expectedResult: action === "rename" ? "새 이름 저장" : action === "archive" ? "전략 보관됨" : action === "restore" ? "전략 복원됨" : "허용된 경우에만 삭제",
        requiresApproval: true,
        executionOrder: 1,
        onFailure: "abort",
        status: "pending",
      }];
      requiresApproval = true;
    }
  } else if (["paper_start_request", "paper_pause_request", "paper_resume_request", "paper_stop_request"].includes(intent) && paperSessionId) {
    const action = intent === "paper_start_request" ? "approve_start"
      : intent === "paper_pause_request" ? "pause"
      : intent === "paper_resume_request" ? "resume" : "stop";
    toolPlan = [{
      stepId: `paper_${action}`,
      toolId: `paper.${action}`,
      arguments: {
        sessionId: paperSessionId,
        ...(activeStrategyId ? { strategyId: activeStrategyId } : {}),
        idempotencyKey: `paper:${paperSessionId}:${action}`,
      },
      dependsOn: [],
      purpose: action === "approve_start" ? "모의매매 명시적 승인 및 시작"
        : action === "pause" ? "모의매매 일시 정지"
        : action === "resume" ? "모의매매 재개" : "모의매매 종료",
      expectedResult: action === "approve_start" || action === "resume" ? "모의매매 활성"
        : action === "pause" ? "모의매매 일시 정지" : "모의매매 종료",
      requiresApproval: true,
      executionOrder: 1,
      onFailure: "abort",
      status: "pending",
    }];
    requiresApproval = true;
  } else if ((intent === "search_pause_request" || intent === "search_resume_request") && activeJobId) {
    const resume = intent === "search_resume_request";
    toolPlan = [{
      stepId: resume ? "resume_search" : "pause_search",
      toolId: resume ? "search.start" : "search.pause",
      arguments: { jobId: activeJobId },
      dependsOn: [],
      purpose: resume ? "현재 탐색 재개" : "현재 탐색 일시 정지",
      expectedResult: resume ? "탐색 진행 재개" : "탐색 일시 정지",
      requiresApproval: true,
      executionOrder: 1,
      onFailure: "abort",
      status: "pending",
    }];
    requiresApproval = true;
  } else if (wantsCancelReplace && activeJobId) {
    const { draft, requestHash: rh, planId: pid } = buildNewSearchPlan({
      symbol: input.entities.symbol ?? input.context?.symbol,
      timeframe: tfChange ?? "1h",
      excludePatternIds: prevPatterns,
    });
    toolPlan = buildCancelReplacePlan(activeJobId, draft);
    requestHash = rh;
    planId = pid;
    requiresApproval = true;
  } else if (wantsDifferent) {
    const { draft, requestHash: rh, planId: pid } = buildNewSearchPlan({
      symbol: input.entities.symbol ?? input.context?.symbol,
      timeframe: input.entities.timeframe ?? input.context?.timeframe,
      patternSpaceIds: pickDifferentPatternCombo(prevPatterns),
    });
    toolPlan = buildSearchCreatePlanSteps(draft);
    requestHash = rh;
    planId = pid;
    requiresApproval = true;
  } else if (intent === "prepare_search_plan" || intent === "research_workspace") {
    const verifiedSymbol = usableFactValue(input.facts, ["초안 심볼", "최근 작업 심볼"]);
    const verifiedTimeframe = usableFactValue(input.facts, ["초안 타임프레임", "최근 작업 타임프레임"]);
    if (tfChange && pendingPlan?.kind === "search_plan") {
      const base = buildSearchPlanDraft({
        requestedSymbol: input.entities.symbol ?? verifiedSymbol,
        requestedTimeframe: input.entities.timeframe ?? verifiedTimeframe,
        patternSpaceIds: input.workspace?.currentPatterns,
      });
      const modified = buildModifiedSearchPlan({
        base,
        timeframe: tfChange,
      });
      toolPlan = modified.steps;
      requestHash = modified.requestHash;
      planId = modified.planId;
      requiresApproval = true;
    } else {
      const { requestHash: rh, planId: pid, steps } = buildNewSearchPlan({
        symbol: input.entities.symbol ?? input.context?.symbol ?? verifiedSymbol,
        timeframe: input.entities.timeframe ?? input.context?.timeframe ?? verifiedTimeframe,
        patternSpaceIds: patternIdsFromFacts(input.facts),
      });
      toolPlan = steps;
      requestHash = rh;
      planId = pid;
      requiresApproval = true;
    }
  } else if (intent === "prepare_backtest_plan") {
    const strategyId =
      input.entities.strategyId ??
      input.context?.strategyId ??
      usableFactValue(input.facts, ["후보 전략 ID", "전략 ID"]);
    const plan = buildBacktestPlanDraft({
      strategyId,
      strategyLabel: input.entities.strategyLabel,
      symbol: input.entities.symbol ?? input.context?.symbol,
      timeframe: input.entities.timeframe ?? input.context?.timeframe,
      runId: input.entities.runId ?? input.context?.runId,
    });
    toolPlan = planToWriteSteps(buildApprovalDraft(plan));
    requiresApproval = true;
    requestHash = plan.typedCommand?.requestHash ?? null;
  } else if (intent === "prepare_paper_plan") {
    const strategyId =
      input.entities.strategyId ??
      input.context?.strategyId ??
      usableFactValue(input.facts, ["후보 전략 ID", "전략 ID"]);
    const plan = buildPaperPlanDraft({
      strategyId,
      strategyLabel:
        input.entities.strategyLabel ??
        usableFactValue(input.facts, ["후보 전략", "전략 이름"]),
      symbol: input.entities.symbol ?? input.context?.symbol,
    });
    toolPlan = planToWriteSteps(buildApprovalDraft(plan));
    requiresApproval = true;
    requestHash = plan.typedCommand?.requestHash ?? null;
  } else if (intent === "continue_session" || intent === "search_status") {
    const jobId =
      input.entities.jobId ??
      input.context?.jobId ??
      input.workspace?.currentSearchJobId ??
      usableFactValue(input.facts, ["최근 작업 ID", "실행 중 작업 ID", "탐색 작업 ID"]);
    if (jobId) {
      toolPlan = buildMonitorSteps(jobId);
    }
  } else if (pendingPlan && intent !== "research_analysis" && intent !== "compare_plans" && intent !== "memory_recall") {
    toolPlan = planToWriteSteps(pendingPlan);
    requiresApproval = pendingPlan.requiresApproval;
    requestHash = pendingPlan.typedCommand?.requestHash ?? null;
  }

  const planComparison = usableFactValue(input.facts, ["계획 차이 요약"]);
  const conclusionKo = intent === "compare_plans" && planComparison
    ? planComparison
    : decision.conclusionKo;
  const explanationKo = intent === "compare_plans"
    ? "서버에 저장된 최근 두 계획의 실제 실행 조건을 비교했습니다."
    : decision.explanationKo;

  return {
    reasoningId: newReasoningId(),
    sessionId: input.sessionId,
    goal: input.goal ?? intent,
    userIntent: input.query,
    confidence: 0.72,
    currentStateSummary: decision.situationKo,
    verifiedFactRefs: factsToRefs(input.facts),
    assumptions: [],
    missingInformation: decision.uncertaintyKo ? [decision.uncertaintyKo] : [],
    decision: conclusionKo,
    decisionReason: explanationKo,
    recommendedAction: decision.recommendedActionKo,
    toolPlan,
    requiresApproval,
    riskLevel: requiresApproval ? "medium" : "low",
    blockedReason: null,
    fallbackUsed: true,
    provider: "local",
    model: "v1_fallback",
    createdAt: new Date().toISOString(),
    conclusionKo,
    explanationKo,
    requestHash,
    planId,
  };
}

export function fallbackPlanFromReasoning(
  artifact: ReasoningArtifact,
  facts: FactItem[],
): AgentPlanDraft | null {
  const writeSteps = artifact.toolPlan.filter((s) => s.requiresApproval);
  if (writeSteps.length === 0) return null;

  const createStep = writeSteps.find((s) => s.toolId === "search.create");
  if (createStep) {
    const body = createStep.arguments.createBody;
    const draft = buildSearchPlanDraft({});
    if (body && typeof body === "object") {
      const b = body as Record<string, unknown>;
      const symbols = Array.isArray(b.symbols) ? b.symbols[0] : b.symbols;
      return searchPlanToAgentPlan(
        buildSearchPlanDraft({
          requestedSymbol: typeof symbols === "string" ? symbols : draft.symbol,
          requestedTimeframe:
            typeof b.timeframe === "string" ? b.timeframe : draft.timeframe,
        }),
      );
    }
    return searchPlanToAgentPlan(buildSearchPlanDraft({}));
  }

  const backtestStep = writeSteps.find((s) => s.toolId === "backtest.run");
  if (backtestStep) {
    const args = backtestStep.arguments;
    return buildApprovalDraft(
      buildBacktestPlanDraft({
        strategyId:
          typeof args.strategyId === "string" ? args.strategyId : null,
        symbol: typeof args.symbol === "string" ? args.symbol : null,
        timeframe:
          typeof args.timeframe === "string" ? args.timeframe : null,
      }),
    );
  }

  const paperStep = writeSteps.find((s) => s.toolId === "paper.prepare");
  if (paperStep) {
    const args = paperStep.arguments;
    return buildApprovalDraft(
      buildPaperPlanDraft({
        strategyId:
          typeof args.strategyId === "string" ? args.strategyId : null,
        symbol: typeof args.symbol === "string" ? args.symbol : null,
      }),
    );
  }

  void facts;
  return null;
}
