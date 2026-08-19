/**
 * Agent V2 Reasoning Engine — primary planner when enabled.
 */

import { listToolIds, listTools } from "../tools/registry";
import { emptyWorkspaceSnapshot } from "../session/sessionTypes";
import type {
  ReasoningEngineResult,
  ReasoningInput,
  ReasoningArtifact,
} from "./reasoningTypes";
import { getReasoningConfig, isReasoningPrimary } from "./reasoningConfig";
import { buildFallbackReasoning } from "./reasoningFallback";
import { callReasoningProvider } from "./reasoningProvider";
import { validateReasoningArtifact } from "./reasoningValidator";
import { isSafetyBlockIntent } from "./reasoningPolicy";
import { compareShadowReasoning, writeShadowAudit } from "./reasoningAudit";
import {
  buildCancelReplacePlan,
  buildNewSearchPlan,
  detectTimeframeChange,
  pickDifferentPatternCombo,
} from "./toolPlanBuilder";
import { patternIdsFromFacts } from "./reasoningFallback";
import { normalizeSearchCreateBody } from "../tools/execHandlers";
import type { AgentIntentType } from "../../types";
import type { AgentGoal } from "../../goalDetector";
import {
  dedupeReasoningRun,
  extractToolPlanFromPending,
  createReasoningRequestId,
} from "./reasoningRequestRegistry";
import {
  buildCancelReplacePlanProse,
  buildDifferentPatternProse,
  extractPlanContext,
} from "./conversationalProse";
import type { ToolPlanItem } from "./reasoningTypes";
import { sanitizePrimaryUserText } from "./userVisibleSanitizer";
import { writeReasoningLifecycleAudit } from "./reasoningLifecycleAudit";
import type { SessionProviderSelection } from "../providers/providerTypes";
import {
  resolveReasoningTaskProfile,
  isProviderBackedReadProfile,
  type ReasoningTaskProfile,
} from "./reasoningTaskProfile";

export function buildReasoningInput(input: {
  query: string;
  sessionId: string | null;
  intentType: AgentIntentType;
  goal: AgentGoal | null;
  facts: ReasoningInput["facts"];
  history: ReasoningInput["history"];
  context: ReasoningInput["context"];
  entities: ReasoningInput["entities"];
  workspace?: ReasoningInput["workspace"];
  lifecycleStage?: ReasoningInput["lifecycleStage"];
  pendingPlan?: ReasoningInput["pendingPlan"];
  pendingProposedAction?: ReasoningInput["pendingProposedAction"];
  /** Optional route-level capability boundary (for example read-only answers). */
  allowedToolIds?: string[];
  conversationMode?: string | null;
  taskProfile?: ReasoningTaskProfile;
}): ReasoningInput {
  const config = getReasoningConfig();
  const allowed =
    input.allowedToolIds === undefined
      ? null
      : new Set(input.allowedToolIds);
  const tools = listTools().filter((tool) => !allowed || allowed.has(tool.id));
  return {
    query: input.query,
    sessionId: input.sessionId,
    intentType: input.intentType,
    goal: input.goal,
    facts: input.facts.slice(0, config.maxFacts),
    history: input.history.slice(-config.maxHistoryTurns),
    context: input.context,
    entities: input.entities,
    workspace: input.workspace ?? null,
    lifecycleStage: input.lifecycleStage ?? input.entities.pipelineStage ?? null,
    availableToolIds: allowed ? tools.map((tool) => tool.id) : listToolIds(),
    toolMetadata: tools.map((t) => ({
      id: t.id,
      description: t.description,
      requiresApproval: t.requiresApproval,
      executionMode: t.executionMode,
    })),
    pendingPlan: input.pendingPlan ?? input.entities.pendingPlan ?? null,
    pendingProposedAction:
      input.pendingProposedAction ??
      input.entities.pendingProposedAction ??
      null,
    policiesKo: [
      "Live·실주문·SAFE 변경 금지",
      "Write 도구는 명시적 승인 필요",
      "검증된 사실만 인용",
      "완료 주장은 Tool 결과 전까지 금지",
    ],
    taskProfile:
      input.taskProfile ??
      resolveReasoningTaskProfile({
        conversationMode: input.conversationMode ?? null,
        factCount: input.facts.length,
        readToolCount: input.allowedToolIds?.length ?? 0,
      }),
  };
}

export async function runReasoningEngine(
  input: ReasoningInput,
  options?: {
    turnId?: string | null;
    skipProvider?: boolean;
    sessionSelection?: SessionProviderSelection | null;
  },
): Promise<ReasoningEngineResult> {
  const turnId = options?.turnId ?? null;
  return dedupeReasoningRun({
    turnId,
    run: async () => {
      const reasoningRequestId = createReasoningRequestId();
      const taskProfile = input.taskProfile ?? "DIRECT_ANSWER";
      const providerBackedRead = isProviderBackedReadProfile(taskProfile);
      const skipProvider =
        options?.skipProvider === true ||
        input.intentType === "approve_pending" ||
        input.intentType === "search_pause_request" ||
        input.intentType === "search_resume_request" ||
        // Status must use deterministic monitor tools (search.status). Provider
        // prose without tools falsely leaves approval UI and empty toolIds.
        input.intentType === "search_status" ||
        input.intentType === "continue_session" ||
        input.intentType === "paper_start_request" ||
        input.intentType === "paper_pause_request" ||
        input.intentType === "paper_resume_request" ||
        input.intentType === "paper_stop_request" ||
        input.intentType === "strategy_rename_request" ||
        input.intentType === "strategy_archive_request" ||
        input.intentType === "strategy_restore_request" ||
        input.intentType === "strategy_delete_request" ||
        input.intentType === "results_promote_request" ||
        input.intentType === "compare_plans" ||
        (!providerBackedRead && input.intentType === "memory_recall");
      const deterministicResearch =
        !providerBackedRead && input.intentType === "research_analysis";
      const effectiveSkipProvider = skipProvider || deterministicResearch;
      writeReasoningLifecycleAudit({
        at: new Date().toISOString(),
        phase: "started",
        reasoningRequestId,
        turnId,
        providerAttempt: effectiveSkipProvider ? 0 : 1,
        provider: null,
        model: null,
        fallbackUsed: null,
        latencyMs: null,
        errorCategory: null,
      });
      try {
        const result = await runReasoningEngineInner(
          input,
          effectiveSkipProvider,
          options?.sessionSelection ?? null,
        );
        result.artifact.reasoningId = reasoningRequestId;
        writeReasoningLifecycleAudit({
          at: new Date().toISOString(),
          phase: "completed",
          reasoningRequestId,
          turnId,
          providerAttempt: effectiveSkipProvider ? 0 : 1,
          provider: result.artifact.provider,
          model: result.artifact.model,
          fallbackUsed: result.usedFallback,
          latencyMs: result.providerLatencyMs,
          errorCategory: result.providerErrorKo ? "provider_or_validation" : null,
        });
        return result;
      } catch (error) {
        writeReasoningLifecycleAudit({
          at: new Date().toISOString(),
          phase: "failed",
          reasoningRequestId,
          turnId,
          providerAttempt: effectiveSkipProvider ? 0 : 1,
          provider: null,
          model: null,
          fallbackUsed: null,
          latencyMs: null,
          errorCategory: error instanceof Error ? error.name : "unknown",
        });
        throw error;
      }
    },
  });
}

function buildSkippedProviderArtifact(input: ReasoningInput): ReasoningArtifact {
  const pendingPlan = extractToolPlanFromPending(input.pendingProposedAction);
  const toolPlan = (pendingPlan ?? []) as ToolPlanItem[];
  const reasoningId = createReasoningRequestId();

  if (input.intentType === "approve_pending" && toolPlan.length > 0) {
    const ctx = extractPlanContext(toolPlan);
    const isCancelReplace = toolPlan.some((s) => s.toolId === "search.cancel");
    const prose = isCancelReplace
      ? buildCancelReplacePlanProse({
          symbol: ctx.symbol?.replace("USDT", "") ?? "BTC",
          oldTimeframe: input.entities.timeframe ?? input.context?.timeframe ?? "15m",
          newTimeframe: ctx.timeframe,
          newPatterns: ctx.patterns,
        })
      : buildDifferentPatternProse({
          symbol: ctx.symbol?.replace("USDT", "") ?? "BTC",
          timeframe: ctx.timeframe,
          newPatterns: ctx.patterns,
        });

    return {
      reasoningId,
      sessionId: input.sessionId,
      goal: input.goal ?? "execute_approved_plan",
      userIntent: input.query,
      confidence: 1,
      currentStateSummary: "",
      verifiedFactRefs: [],
      assumptions: [],
      missingInformation: [],
      decision: prose.conclusionKo,
      decisionReason: prose.explanationKo,
      recommendedAction: "approved_execution",
      toolPlan: [],
      requiresApproval: false,
      riskLevel: "low",
      blockedReason: null,
      fallbackUsed: false,
      provider: "local",
      model: "approval_fast_path",
      createdAt: new Date().toISOString(),
      conclusionKo: prose.conclusionKo,
      explanationKo: prose.explanationKo,
    };
  }

  const fallback = buildFallbackReasoning(input);
  return { ...fallback, reasoningId, provider: "local", model: "deterministic" };
}

async function runReasoningEngineInner(
  input: ReasoningInput,
  skipProvider: boolean,
  sessionSelection: SessionProviderSelection | null = null,
): Promise<ReasoningEngineResult> {
  if (isSafetyBlockIntent(input.intentType)) {
    const artifact = buildFallbackReasoning(input);
    return {
      artifact,
      validation: {
        ok: true,
        artifact,
        issues: [],
        blocked: true,
        blockedReason: artifact.blockedReason,
      },
      usedFallback: true,
      providerErrorKo: null,
      providerLatencyMs: null,
    };
  }

  const pendingToolPlan = extractToolPlanFromPending(input.pendingProposedAction);
  if (
    skipProvider ||
    input.intentType === "cancel_pending" ||
    (input.intentType === "approve_pending" && pendingToolPlan && pendingToolPlan.length > 0)
  ) {
    let artifact = buildSkippedProviderArtifact(input);
    artifact = enrichPartialProviderPlan(artifact, input);
    applyConversationalProse(artifact, input);
    return {
      artifact,
      validation: { ok: true, artifact, issues: [], blocked: false, blockedReason: null },
      usedFallback: input.intentType !== "approve_pending",
      providerErrorKo: null,
      providerLatencyMs: null,
    };
  }

  const providerResult = await callReasoningProvider(input, {
    sessionSelection,
  });

  let artifact: ReasoningArtifact | null = providerResult.parsed.artifact;
  let usedFallback = false;
  let providerErrorKo = providerResult.errorKo;

  if (!providerResult.ok || !artifact) {
    artifact = buildFallbackReasoning(input);
    usedFallback = true;
    providerErrorKo = providerResult.errorKo ?? "provider_failed";
  } else {
    const validation = validateReasoningArtifact(artifact, input);
    if (!validation.ok || !validation.artifact) {
      artifact = buildFallbackReasoning(input);
      usedFallback = true;
      providerErrorKo =
        validation.issues.join("; ") || providerErrorKo;
    } else {
      artifact = validation.artifact;
      artifact.fallbackUsed = false;
      artifact.provider = providerResult.provider;
      artifact.model = providerResult.model;
    }
  }

  const validation = validateReasoningArtifact(artifact, input);

  artifact = enrichPartialProviderPlan(artifact, input);
  applyConversationalProse(artifact, input);

  const finalValidation = validateReasoningArtifact(artifact, input);

  return {
    artifact,
    validation: finalValidation.ok
      ? finalValidation
      : {
          ok: true,
          artifact,
          issues: finalValidation.issues,
          blocked: artifact.riskLevel === "blocked",
          blockedReason: artifact.blockedReason,
        },
    usedFallback,
    providerErrorKo,
    providerLatencyMs: providerResult.latencyMs ?? null,
  };
}

function isValidStrategyId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    /^[a-zA-Z0-9_-]+$/.test(value)
  );
}

function isPlaceholderStrategyId(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return true;
  if (!isValidStrategyId(value)) return true;
  return (
    /^<[^>]+>$/.test(value.trim()) || /확정|placeholder|TBD|TODO/i.test(value)
  );
}

function resolveKnownStrategyId(input: ReasoningInput): string | null {
  const candidates = [
    input.entities.strategyId,
    input.context?.strategyId,
    input.workspace?.currentStrategyId,
    ...input.facts
      .filter((fact) =>
        ["후보 전략 ID", "전략 ID", "선택 전략 ID"].includes(fact.labelKo),
      )
      .map((fact) => fact.value),
  ];
  for (const candidate of candidates) {
    if (isValidStrategyId(candidate)) return candidate;
  }
  return null;
}

function injectMissingSearchStart(artifact: ReasoningArtifact): ReasoningArtifact {
  const createStep = artifact.toolPlan.find((step) => step.toolId === "search.create");
  if (!createStep) return artifact;
  if (artifact.toolPlan.some((step) => step.toolId === "search.start")) return artifact;

  const createStepId = createStep.stepId || "create_search";
  const startStep: ToolPlanItem = {
    stepId: "start_search",
    toolId: "search.start",
    arguments: { jobId: `$${createStepId}.jobId` },
    dependsOn: [createStepId],
    purpose: "생성된 탐색 작업 시작",
    expectedResult: "running 상태",
    requiresApproval: true,
    executionOrder: createStep.executionOrder + 1,
    onFailure: "abort",
    status: "pending",
  };

  return {
    ...artifact,
    toolPlan: [...artifact.toolPlan, startStep],
    requiresApproval: true,
  };
}

function normalizeBacktestStrategyPlan(
  artifact: ReasoningArtifact,
  input: ReasoningInput,
): ReasoningArtifact {
  const resolved = resolveKnownStrategyId(input);
  if (!resolved || !artifact.toolPlan.some((step) => step.toolId === "backtest.run")) {
    return artifact;
  }

  const hasPlaceholder = artifact.toolPlan.some((step) => {
    if (step.toolId === "backtest.run" || step.toolId === "strategy.detail") {
      return isPlaceholderStrategyId(step.arguments?.strategyId);
    }
    return false;
  });
  if (!hasPlaceholder) return artifact;

  const backtestStep = artifact.toolPlan.find((step) => step.toolId === "backtest.run");
  if (!backtestStep) return artifact;

  const writeTools = new Set(
    artifact.toolPlan
      .filter((step) => step.requiresApproval)
      .map((step) => step.toolId),
  );
  const onlyBacktestLookup =
    [...writeTools].every((toolId) =>
      ["strategy.list", "strategy.detail", "backtest.run"].includes(toolId),
    ) && writeTools.has("backtest.run");

  if (onlyBacktestLookup) {
    return {
      ...artifact,
      toolPlan: [
        {
          ...backtestStep,
          arguments: { ...backtestStep.arguments, strategyId: resolved },
        },
      ],
      requiresApproval: true,
    };
  }

  return {
    ...artifact,
    toolPlan: artifact.toolPlan.map((step) => {
      if (
        step.toolId !== "backtest.run" &&
        step.toolId !== "strategy.detail" &&
        step.toolId !== "paper.prepare"
      ) {
        return step;
      }
      if (!isPlaceholderStrategyId(step.arguments?.strategyId)) return step;
      return {
        ...step,
        arguments: { ...step.arguments, strategyId: resolved },
      };
    }),
  };
}

function ensurePrepareSearchPlanSteps(
  artifact: ReasoningArtifact,
  input: ReasoningInput,
): ReasoningArtifact {
  if (input.intentType !== "prepare_search_plan") return artifact;
  if (artifact.toolPlan.some((step) => step.toolId === "search.create")) {
    return injectMissingSearchStart(artifact);
  }
  if (artifact.fallbackUsed || artifact.provider === "local") return artifact;

  const { steps, requestHash, planId } = buildNewSearchPlan({
    symbol: input.entities.symbol ?? input.context?.symbol,
    timeframe: input.entities.timeframe ?? input.context?.timeframe,
    patternSpaceIds: patternIdsFromFacts(input.facts),
  });
  return {
    ...artifact,
    toolPlan: steps,
    requestHash,
    planId,
    requiresApproval: true,
  };
}

export function normalizeProviderToolPlan(
  artifact: ReasoningArtifact,
  input: ReasoningInput,
): ReasoningArtifact {
  if (artifact.fallbackUsed || artifact.provider === "local") return artifact;
  let normalized = ensurePrepareSearchPlanSteps(artifact, input);
  normalized = normalizeBacktestStrategyPlan(normalized, input);
  normalized = injectMissingSearchStart(normalized);
  return normalized;
}

function applyConversationalProse(
  artifact: ReasoningArtifact,
  input: ReasoningInput,
): void {
  if (artifact.riskLevel === "blocked") return;
  const wantsCancelReplace =
    /취소.*다시|cancel.*replace|다시\s*해|1\s*시간/i.test(input.query);
  const wantsDifferent = /다른\s*패턴|different\s*pattern/i.test(input.query);

  if (wantsCancelReplace && artifact.toolPlan.some((s) => s.toolId === "search.cancel")) {
    const ctx = extractPlanContext(artifact.toolPlan);
    const prev =
      input.workspace?.currentPatterns && input.workspace.currentPatterns.length > 0
        ? input.workspace.currentPatterns
        : patternIdsFromFacts(input.facts);
    const prose = buildCancelReplacePlanProse({
      symbol:
        ctx.symbol?.replace("USDT", "") ??
        input.entities.symbol?.replace("USDT", "") ??
        "BTC",
      oldTimeframe: input.entities.timeframe ?? input.context?.timeframe ?? "15m",
      newTimeframe: ctx.timeframe ?? "1h",
      oldPatterns: prev,
      newPatterns: ctx.patterns,
    });
    artifact.conclusionKo = prose.conclusionKo;
    artifact.explanationKo = prose.explanationKo;
    artifact.recommendedAction = prose.recommendedActionKo;
    artifact.decision = prose.conclusionKo;
    artifact.decisionReason = prose.explanationKo;
    return;
  }

  if (wantsDifferent && artifact.toolPlan.some((s) => s.toolId === "search.create")) {
    const ctx = extractPlanContext(artifact.toolPlan);
    const prose = buildDifferentPatternProse({
      symbol: ctx.symbol?.replace("USDT", "") ?? "BTC",
      timeframe: ctx.timeframe ?? input.context?.timeframe ?? "15m",
      newPatterns: ctx.patterns,
    });
    artifact.conclusionKo = prose.conclusionKo;
    artifact.explanationKo = prose.explanationKo;
    artifact.decision = prose.conclusionKo;
    artifact.decisionReason = prose.explanationKo;
    return;
  }

  if (artifact.conclusionKo) {
    artifact.conclusionKo = sanitizePrimaryUserText(artifact.conclusionKo);
  }
  if (artifact.explanationKo) {
    artifact.explanationKo = sanitizePrimaryUserText(artifact.explanationKo);
  }
  artifact.decision = sanitizePrimaryUserText(artifact.decision);
  artifact.decisionReason = sanitizePrimaryUserText(artifact.decisionReason);
}

function enrichPartialProviderPlan(
  artifact: ReasoningArtifact,
  input: ReasoningInput,
): ReasoningArtifact {
  artifact = normalizeProviderToolPlan(artifact, input);

  // Always expand shorthand provider createBody before approval/execution.
  if (artifact.toolPlan.some((s) => s.toolId === "search.create")) {
    artifact = {
      ...artifact,
      toolPlan: artifact.toolPlan.map((step) => {
        if (step.toolId !== "search.create") return step;
        const raw =
          (step.arguments?.createBody as Record<string, unknown> | undefined) ??
          (step.arguments as Record<string, unknown>);
        if (!raw || typeof raw !== "object") return step;
        return {
          ...step,
          arguments: {
            ...step.arguments,
            createBody: normalizeSearchCreateBody(raw),
          },
        };
      }),
    };
  }

  const wantsDifferent = /다른\s*패턴|different\s*pattern/i.test(input.query);
  if (wantsDifferent && artifact.toolPlan.some((s) => s.toolId === "search.create")) {
    const createStep = artifact.toolPlan.find((s) => s.toolId === "search.create");
    const body = (createStep?.arguments?.createBody ?? {}) as Record<string, unknown>;
    const op =
      body.operatorPlan && typeof body.operatorPlan === "object"
        ? (body.operatorPlan as Record<string, unknown>)
        : null;
    const current = Array.isArray(op?.selectedSpaceIds)
      ? op.selectedSpaceIds.filter((id): id is string => typeof id === "string")
      : [];
    const pendingPlan = extractToolPlanFromPending(
      input.pendingProposedAction,
    ) as ToolPlanItem[] | null;
    const pendingCreate = pendingPlan?.find(
      (s: ToolPlanItem) => s.toolId === "search.create",
    );
    const pendingBody = (pendingCreate?.arguments?.createBody ??
      null) as Record<string, unknown> | null;
    const pendingOp =
      pendingBody?.operatorPlan && typeof pendingBody.operatorPlan === "object"
        ? (pendingBody.operatorPlan as Record<string, unknown>)
        : null;
    const pendingPatterns = Array.isArray(pendingOp?.selectedSpaceIds)
      ? pendingOp.selectedSpaceIds.filter(
          (id): id is string => typeof id === "string",
        )
      : [];
    const prev =
      pendingPatterns.length > 0
        ? pendingPatterns
        : input.workspace?.currentPatterns &&
            input.workspace.currentPatterns.length > 0
          ? input.workspace.currentPatterns
          : patternIdsFromFacts(input.facts);
    const exclude = prev.length > 0 ? prev : current;
    if (exclude.length > 0) {
      const nextPatterns = pickDifferentPatternCombo(exclude);
      const nextKey = [...nextPatterns].sort().join("+");
      const excludeKey = [...exclude].sort().join("+");
      const currentKey = [...current].sort().join("+");
      if (nextKey !== excludeKey && nextKey !== currentKey) {
        const symbol =
          Array.isArray(body.symbols) && typeof body.symbols[0] === "string"
            ? body.symbols[0]
            : Array.isArray(pendingBody?.symbols) &&
                typeof pendingBody.symbols[0] === "string"
              ? pendingBody.symbols[0]
              : (input.entities.symbol ?? input.context?.symbol ?? "BTCUSDT");
        const timeframe =
          typeof body.timeframe === "string"
            ? body.timeframe
            : typeof pendingBody?.timeframe === "string"
              ? pendingBody.timeframe
              : (input.entities.timeframe ?? input.context?.timeframe ?? "15m");
        const rebuilt = buildNewSearchPlan({
          symbol,
          timeframe,
          patternSpaceIds: nextPatterns,
          excludePatternIds: exclude,
        });
        return {
          ...artifact,
          toolPlan: rebuilt.steps,
          requestHash: rebuilt.requestHash,
          planId: rebuilt.planId,
          requiresApproval: true,
        };
      }
    }
  }

  if (artifact.fallbackUsed || artifact.provider === "local") return artifact;
  const wantsCancelReplace =
    /취소.*다시|cancel.*replace|다시\s*해|1\s*시간/i.test(input.query);
  if (!wantsCancelReplace) return artifact;

  const activeJobId =
    input.entities.jobId ??
    input.context?.jobId ??
    input.workspace?.currentSearchJobId ??
    input.facts.find((f) => f.labelKo.includes("작업 ID"))?.value ??
    null;
  if (!activeJobId) return artifact;

  const cancelStep = artifact.toolPlan.find((s) => s.toolId === "search.cancel");
  const cancelJobId = cancelStep ? String(cancelStep.arguments?.jobId ?? "") : "";
  const hasCancel = Boolean(cancelStep);
  const hasCreate = artifact.toolPlan.some((s) => s.toolId === "search.create");
  const hasStart = artifact.toolPlan.some((s) => s.toolId === "search.start");
  const hasFullReplace = hasCancel && hasCreate && hasStart;
  const wrongCancelTarget = hasCancel && cancelJobId !== activeJobId;
  if (hasFullReplace && !wrongCancelTarget) return artifact;

  const prevPatterns =
    input.workspace?.currentPatterns && input.workspace.currentPatterns.length > 0
      ? input.workspace.currentPatterns
      : patternIdsFromFacts(input.facts);
  const tfChange = detectTimeframeChange(input.query);
  const { draft, requestHash, planId } = buildNewSearchPlan({
    symbol: input.entities.symbol ?? input.context?.symbol,
    timeframe: tfChange ?? "1h",
    excludePatternIds: prevPatterns,
  });
  return {
    ...artifact,
    toolPlan: buildCancelReplacePlan(activeJobId, draft),
    requestHash,
    planId,
    requiresApproval: true,
  };
}

export async function runShadowReasoningCompare(input: {
  reasoningInput: ReasoningInput;
  v1Intent: AgentIntentType;
  v1Goal: AgentGoal | null;
  v1RequiresApproval: boolean;
  v1Tools: string[];
}): Promise<ReasoningEngineResult> {
  const result = await runReasoningEngine(input.reasoningInput);
  const record = compareShadowReasoning({
    query: input.reasoningInput.query,
    v1Intent: input.v1Intent,
    v1Goal: input.v1Goal,
    v1RequiresApproval: input.v1RequiresApproval,
    v1Tools: input.v1Tools,
    v2: result.artifact,
  });
  writeShadowAudit(record);
  return result;
}

export function defaultWorkspace() {
  return emptyWorkspaceSnapshot();
}

export { isReasoningPrimary, getReasoningConfig };
