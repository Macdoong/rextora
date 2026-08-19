import { NextResponse } from "next/server";
import { fetchFactsForIntent } from "@/src/lib/rextora/agent/agentDataFetcher";
import {
  buildAgentResponse,
  buildLocalInterpretation,
} from "@/src/lib/rextora/agent/agentResponseBuilder";
import {
  checkIntentSafety,
  checkDataAuthenticity,
} from "@/src/lib/rextora/agent/safetyGuard";
import { callLLM } from "@/src/lib/rextora/agent/agentLLM";
import type {
  AgentLifecycleContext,
  AgentRequest,
  AgentErrorResponse,
  AgentResponse,
  AgentTurn,
} from "@/src/lib/rextora/agent/types";
import type { EvidencePackage } from "@/src/lib/rextora/agent/llmTypes";
import {
  buildBoundedConversationContext,
  emptyEntityMemory,
  mergeEntityMemory,
  sanitizeHistory,
  type ConversationEntityMemory,
} from "@/src/lib/rextora/agent/conversationContext";
import {
  isProposedActionExpired,
  type ProposedAction,
} from "@/src/lib/rextora/agent/proposedAction";
import { buildDecisionContext } from "@/src/lib/rextora/agent/decisionContext";
import {
  buildSearchPlanDraft,
  searchPlanDraftToFacts,
} from "@/src/lib/rextora/agent/searchPlanDraft";
import {
  buildApprovalDraft,
  buildBacktestPlanDraft,
  buildPaperPlanDraft,
  buildRiskReviewDraft,
  planDraftToFacts,
  searchPlanToAgentPlan,
  type AgentPlanDraft,
} from "@/src/lib/rextora/agent/planDrafts";
import { buildResearchWorkspaceSummary } from "@/src/lib/rextora/agent/researchWorkspace";
import { detectGoal } from "@/src/lib/rextora/agent/goalDetector";
import { workingStateFromEntities } from "@/src/lib/rextora/agent/conversationState";
import {
  classifyExecutionRequest,
  isDirectExecutionRequest,
} from "@/src/lib/rextora/agent/executionRequestClassifier";
import { executeApprovedCommand } from "@/src/lib/rextora/agent/commandExecutor";
import type { TypedCommand } from "@/src/lib/rextora/agent/typedCommand";
import { getCommand, saveCommand } from "@/src/lib/rextora/agent/commandStore";
import {
  buildReasoningInput,
  buildResponseFromReasoning,
  executeApprovedToolPlan,
  isReasoningActive,
  isReasoningPrimary,
  runReasoningEngine,
  compareShadowReasoning,
  writeShadowAudit,
  type ReasoningEngineResult,
  type ToolPlanItem,
} from "@/src/lib/rextora/agent/v2/reasoning";
import { resolveReasoningTaskProfile } from "@/src/lib/rextora/agent/v2/reasoning/reasoningTaskProfile";
import { inferLifecycleStage } from "@/src/lib/rextora/agent/lifecycleStage";
import { buildMissionTimeline } from "@/src/lib/rextora/agent/missionTimeline";
import {
  persistApprovedExecution,
  persistReasoningProposal,
} from "@/src/lib/rextora/agent/v2/orchestration";
import { latestPlanComparison } from "@/src/lib/rextora/agent/v2/planner";
import { searchVerifiedMemory } from "@/src/lib/rextora/agent/v2/memory";
import {
  claimApprovalExecution,
  findLatestSessionApprovalReceipt,
  isApprovalAlreadyExecuted,
  writeApprovalExecutionReceipt,
  type ApprovalExecutionReceipt,
} from "@/src/lib/rextora/agent/v2/approval/approvalExecutionStore";
import { getAgentSession, ensureAgentSession } from "@/src/lib/rextora/agent/v2/session/sessionStore";
import { sanitizeSessionId } from "@/src/lib/rextora/agent/v2/session/sessionPersistence";
import { executeTool } from "@/src/lib/rextora/agent/v2/tools/toolExecutor";
import {
  buildConversationContextView,
  composeConversationResponse,
  deterministicConversationAnswer,
  routeConversationTurn,
  safeConversationalFallback,
  type ConversationRouteDecision,
  type ConversationTopic,
  type SelectedUiObject,
} from "@/src/lib/rextora/agent/v2/conversation";

const ABSENT_ID_SENTINELS = new Set([
  "없음",
  "null",
  "undefined",
  "None",
  "-",
]);

function pickEntityId(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || ABSENT_ID_SENTINELS.has(trimmed)) return null;
  return trimmed.slice(0, max);
}

function sanitizeContext(
  raw: AgentRequest["context"],
): AgentLifecycleContext | null {
  if (!raw || typeof raw !== "object") return null;
  return {
    route: pickEntityId(raw.route),
    strategyId: pickEntityId(raw.strategyId),
    runId: pickEntityId(raw.runId),
    jobId: pickEntityId(raw.jobId),
    paperSessionId: pickEntityId(raw.paperSessionId),
    symbol: pickEntityId(raw.symbol),
    timeframe: pickEntityId(raw.timeframe),
  };
}

function sanitizeEntityMemory(
  raw: AgentRequest["entityMemory"],
  pending: ProposedAction | null,
): ConversationEntityMemory {
  const base = emptyEntityMemory();
  if (!raw || typeof raw !== "object") {
    return mergeEntityMemory(base, null, { pendingProposedAction: pending });
  }
  const pick = (v: unknown, max = 120): string | null => pickEntityId(v, max);
  const pendingPlan =
    raw.pendingPlan && typeof raw.pendingPlan === "object"
      ? (raw.pendingPlan as AgentPlanDraft)
      : null;
  return mergeEntityMemory(base, null, {
    strategyId: pick(raw.strategyId),
    strategyLabel: pick(raw.strategyLabel),
    jobId: pick(raw.jobId),
    runId: pick(raw.runId),
    symbol: pick(raw.symbol),
    timeframe: pick(raw.timeframe),
    paperSessionId: pick(raw.paperSessionId),
    lifecycleStage: pick(raw.lifecycleStage),
    previousRecommendation: pick(raw.previousRecommendation, 200),
    previousConclusion: pick(raw.previousConclusion, 280),
    previousReason: pick(raw.previousReason, 280),
    pendingProposedAction: pending,
    pendingPlan,
    pinnedObjectiveKo: pick(raw.pinnedObjectiveKo, 200),
    pipelineStage: raw.pipelineStage ?? null,
  });
}

function sanitizePendingAction(
  raw: AgentRequest["pendingProposedAction"],
): ProposedAction | null {
  if (!raw || typeof raw !== "object") return null;
  if (typeof raw.actionId !== "string" || typeof raw.targetRoute !== "string") {
    return null;
  }
  if (isProposedActionExpired(raw as ProposedAction)) return null;
  return raw as ProposedAction;
}

function sanitizeApprovalCandidate(raw: unknown): ProposedAction | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<ProposedAction>;
  if (
    typeof candidate.actionId !== "string" ||
    typeof candidate.targetRoute !== "string" ||
    typeof candidate.summary !== "string"
  ) {
    return null;
  }
  return candidate as ProposedAction;
}

function sanitizeSelectedUiObject(
  raw: AgentRequest["selectedUiObject"],
): SelectedUiObject | null {
  if (!raw || typeof raw !== "object" || typeof raw.labelKo !== "string") {
    return null;
  }
  const allowed = new Set<SelectedUiObject["kind"]>([
    "product",
    "feature",
    "strategy",
    "search_job",
    "backtest",
    "paper_session",
    "approval",
    "assistant_statement",
    "unknown",
  ]);
  if (!allowed.has(raw.kind)) return null;
  return {
    kind: raw.kind,
    labelKo: raw.labelKo.trim().slice(0, 160),
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim().slice(0, 160)
        : null,
    descriptionKo:
      typeof raw.descriptionKo === "string" && raw.descriptionKo.trim()
        ? raw.descriptionKo.trim().slice(0, 280)
        : null,
  };
}

function attachConversationRoute(
  response: AgentResponse,
  route: ConversationRouteDecision,
  contextView: ReturnType<typeof buildConversationContextView>,
  originalEntities?: ConversationEntityMemory,
  sessionId?: string | null,
): AgentResponse {
  if (route.mode === "READ_AND_ANSWER") {
    response.proposedAction = null;
    response.plan = null;
    if (response.entityMemory) {
      const pending = originalEntities?.pendingProposedAction ?? null;
      const pendingId =
        typeof pending?.actionId === "string" ? pending.actionId.trim() : "";
      const alreadyExecuted = pendingId
        ? isApprovalAlreadyExecuted({
            sessionId: sessionId ?? null,
            approvalId: pendingId,
          })
        : null;
      const keepPending =
        pending && !pending.blockedReason && !alreadyExecuted ? pending : null;
      const keepPlan = keepPending
        ? (originalEntities?.pendingPlan ?? null)
        : null;
      response.entityMemory.pendingProposedAction = keepPending;
      response.entityMemory.pendingPlan = keepPlan;
      response.missionTimeline = buildMissionTimeline({
        entities: response.entityMemory,
        pendingAction: keepPending,
        pendingPlan: keepPlan,
      });
    }
  }
  response.conversationRoute = {
    mode: route.mode,
    topic: route.topic,
    confidence: route.confidence,
    resolvedReference: route.resolvedReference?.labelKo ?? null,
    needsWorkspaceFacts: route.needsWorkspaceFacts,
    requestedReadTools: route.requestedReadTools,
    requestedWriteTools: route.requestedWriteTools,
    requiresApproval: route.requiresApproval,
    providerExpected: route.providerExpected,
    lifecycleInfluencedRouting: route.lifecycleInfluencedRouting,
    reason: route.reason,
  };
  response.conversationContext = {
    currentTopic: contextView.currentTopic,
    previousTopic: contextView.previousTopic,
    clarificationState: contextView.clarificationState,
    confidence: contextView.confidence,
  };
  return response;
}

function readArgumentsForConversationTool(
  toolId: string,
  entities: ConversationEntityMemory,
): Record<string, unknown> {
  if (toolId === "search.status" || toolId === "search.result") {
    return entities.jobId ? { jobId: entities.jobId } : {};
  }
  if (toolId === "backtest.detail") {
    return entities.runId ? { runId: entities.runId } : {};
  }
  if (toolId === "strategy.detail") {
    return entities.strategyId ? { strategyId: entities.strategyId } : {};
  }
  if (toolId === "paper.session") {
    return entities.paperSessionId
      ? { sessionId: entities.paperSessionId }
      : {};
  }
  if (toolId.endsWith(".list")) return { limit: 20 };
  return {};
}

function extractPendingToolPlan(
  parameters: Record<string, unknown> | undefined,
): ToolPlanItem[] | null {
  if (!parameters || typeof parameters !== "object") return null;
  const raw = parameters.toolPlan;
  if (!Array.isArray(raw)) return null;
  const steps: ToolPlanItem[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    if (typeof obj.toolId !== "string") continue;
    steps.push({
      stepId: typeof obj.stepId === "string" ? obj.stepId : `step_${i + 1}`,
      toolId: obj.toolId,
      arguments:
        obj.arguments && typeof obj.arguments === "object"
          ? (obj.arguments as Record<string, unknown>)
          : {},
      dependsOn: Array.isArray(obj.dependsOn)
        ? obj.dependsOn.map(String)
        : [],
      purpose: typeof obj.purpose === "string" ? obj.purpose : "",
      expectedResult:
        typeof obj.expectedResult === "string" ? obj.expectedResult : "",
      requiresApproval: Boolean(obj.requiresApproval),
      executionOrder:
        typeof obj.executionOrder === "number" ? obj.executionOrder : i + 1,
      onFailure:
        obj.onFailure === "continue" || obj.onFailure === "retry_once"
          ? obj.onFailure
          : "abort",
      status: (() => {
        const rawStatus =
          obj.status === "running" ||
          obj.status === "succeeded" ||
          obj.status === "failed" ||
          obj.status === "skipped" ||
          obj.status === "blocked"
            ? obj.status
            : "pending";
        // Never allow approval-gated write steps to arrive pre-skipped.
        if (
          Boolean(obj.requiresApproval) &&
          (rawStatus === "skipped" || rawStatus === "blocked")
        ) {
          return "pending";
        }
        return rawStatus;
      })(),
    });
  }
  return steps.length > 0 ? steps : null;
}

function buildTerminalApprovalReplayResponse(input: {
  query: string;
  context: AgentLifecycleContext | null;
  entities: ConversationEntityMemory;
  receipt: ApprovalExecutionReceipt;
}) {
  const cleared = {
    ...input.entities,
    pendingProposedAction: null,
    pendingPlan: null,
    jobId: input.receipt.jobId ?? input.entities.jobId,
    runId: input.receipt.runId ?? input.entities.runId,
    paperSessionId: input.receipt.paperSessionId ?? input.entities.paperSessionId,
  };
  const response = buildAgentResponse(
    {
      type: "approve_pending",
      params: {},
      confidence: 1,
      rawQuery: input.query,
    },
    [
      {
        labelKo: "실행 상태",
        value: "skipped_idempotent",
        source: "system_status",
        fetchedAt: new Date().toISOString(),
      },
    ],
    {
      interpretationKo: input.receipt.summaryKo,
      source: "local",
    },
    input.context,
    {
      entities: cleared,
      explicitProposedAction: null,
      explicitPlan: null,
      goal: "approve",
    },
  );
  response.executionResult = {
    commandId: `approval_receipt_${input.receipt.approvalId}`,
    commandType: "tool_plan",
    executionStatus: "skipped_idempotent",
    resultReference: null,
    jobId: input.receipt.jobId,
    runId: input.receipt.runId,
    alreadyExecuted: true,
    summaryKo: input.receipt.summaryKo,
  };
  response.reasoningMeta = {
    reasoningId: `approval_replay_${input.receipt.approvalId}`,
    fallbackUsed: false,
    provider: "local",
    model: "approval_receipt_replay",
    validationOk: true,
    toolIds: [],
    verifiedFactRefs: [],
    requestHash: null,
    latencyMs: 0,
  };
  return response;
}

function buildEmptyApprovalResponse(input: {
  query: string;
  context: AgentLifecycleContext | null;
  entities: ConversationEntityMemory;
}) {
  const cleared = {
    ...input.entities,
    pendingProposedAction: null,
    pendingPlan: null,
  };
  const response = buildAgentResponse(
    {
      type: "approve_pending",
      params: {},
      confidence: 1,
      rawQuery: input.query,
    },
    [
      {
        labelKo: "대기 제안",
        value: "없음",
        source: "system_status",
        fetchedAt: new Date().toISOString(),
      },
    ],
    {
      interpretationKo:
        "승인할 대기 계획이 없습니다. 이미 실행된 승인을 다시 실행하지 않았습니다.",
      source: "local",
    },
    input.context,
    {
      entities: cleared,
      explicitProposedAction: null,
      explicitPlan: null,
      goal: "approve",
    },
  );
  response.reasoningMeta = {
    reasoningId: `approval_empty_${Date.now().toString(36)}`,
    fallbackUsed: false,
    provider: "local",
    model: "approval_empty",
    validationOk: true,
    toolIds: [],
    verifiedFactRefs: [],
    requestHash: null,
    latencyMs: 0,
  };
  return response;
}

/** POST /api/rextora/agent — AI Agent Control Plane entry point (read-only). */
export async function POST(request: Request) {
  let body: AgentRequest;
  try {
    body = await request.json();
  } catch {
    const err: AgentErrorResponse = {
      error: true,
      messageKo: "요청 형식이 올바르지 않습니다.",
    };
    return NextResponse.json(err, { status: 400 });
  }

  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) {
    const err: AgentErrorResponse = {
      error: true,
      messageKo: "질문을 입력해 주세요.",
    };
    return NextResponse.json(err, { status: 400 });
  }

  if (query.length > 500) {
    const err: AgentErrorResponse = {
      error: true,
      messageKo: "질문이 너무 깁니다. 500자 이내로 입력해 주세요.",
    };
    return NextResponse.json(err, { status: 400 });
  }

  const context = sanitizeContext(body.context);
  const pendingFromClient = sanitizePendingAction(
    body.pendingProposedAction ?? body.entityMemory?.pendingProposedAction,
  );
  const entities = sanitizeEntityMemory(body.entityMemory, pendingFromClient);
  const history: AgentTurn[] = sanitizeHistory(
    Array.isArray(body?.history) ? body.history : [],
  );
  const requestSessionId =
    typeof body.sessionId === "string" && body.sessionId.trim()
      ? body.sessionId.trim()
      : null;
  const serverSession = (() => {
    if (!requestSessionId) return null;
    try {
      return getAgentSession(requestSessionId);
    } catch {
      return null;
    }
  })();
  // Authoritative workspace facts fill gaps left by stale client entityMemory.
  if (serverSession?.workspace) {
    entities.jobId =
      entities.jobId ??
      pickEntityId(serverSession.workspace.currentSearchJobId);
    entities.runId =
      entities.runId ??
      pickEntityId(serverSession.workspace.currentBacktestRunId);
    entities.paperSessionId =
      entities.paperSessionId ??
      pickEntityId(serverSession.workspace.currentPaperSessionId);
    entities.strategyId =
      entities.strategyId ??
      pickEntityId(serverSession.workspace.currentStrategyId);
  }
  if (context?.jobId && !entities.jobId) entities.jobId = context.jobId;

  const rawProviderSelection = (
    body as AgentRequest & {
      providerSelection?: { provider?: string; model?: string };
    }
  ).providerSelection;
  const sessionSelection =
    rawProviderSelection &&
    (rawProviderSelection.provider === "openai" ||
      rawProviderSelection.provider === "gemini") &&
    typeof rawProviderSelection.model === "string" &&
    rawProviderSelection.model.trim()
      ? {
          provider: rawProviderSelection.provider as "openai" | "gemini",
          model: rawProviderSelection.model.trim(),
        }
      : null;

  const approvalCandidates = [
    ...(Array.isArray(body.pendingApprovals) ? body.pendingApprovals : []),
    ...(serverSession?.workspace.pendingApprovals ?? []),
    body.pendingProposedAction,
    body.entityMemory?.pendingProposedAction,
  ]
    .map(sanitizeApprovalCandidate)
    .filter((candidate): candidate is ProposedAction => Boolean(candidate))
    .filter(
      (candidate, index, all) =>
        all.findIndex((other) => other.actionId === candidate.actionId) === index,
    )
    .filter(
      (candidate) =>
        !isApprovalAlreadyExecuted({
          sessionId: requestSessionId,
          approvalId: candidate.actionId,
        }),
    );
  const selectedUiObject = sanitizeSelectedUiObject(body.selectedUiObject);
  const priorConversationTopic =
    typeof body.conversationContext?.currentTopic === "string"
      ? (body.conversationContext.currentTopic as ConversationTopic)
      : typeof serverSession?.reasoningContext?.currentTopic === "string"
        ? (serverSession.reasoningContext.currentTopic as ConversationTopic)
        : null;

  buildBoundedConversationContext({
    query,
    history,
    lifecycle: context,
    priorEntities: entities,
  });

  const conversationContextView = buildConversationContextView({
    query,
    history,
    selectedUiObject,
    priorTopic: priorConversationTopic,
  });
  const conversationRoute = routeConversationTurn({
    query,
    history,
    entities,
    lifecycleStage: entities.pipelineStage,
    pendingApprovals: approvalCandidates,
    selectedUiObject,
    priorConversationTopic,
  });

  // Exactly-once replay for bare "진행해" after an approval already finished.
  // Must NOT steal a fresh pending approval (e.g. cancel-replace) that has a
  // different actionId and has not been executed yet.
  const approvalReplayIntent =
    /^(그럼\s*)?(진행해|실행해|그렇게\s*해|승인|승인할게|해줘|가자|ok|okay|yes)$/i.test(
      query.trim(),
    ) || /^(진행|실행|승인)\s*(해|하자|할게|해줘)/i.test(query.trim());
  if (approvalReplayIntent && requestSessionId) {
    const freshPendingId =
      typeof pendingFromClient?.actionId === "string" &&
      pendingFromClient.actionId.trim()
        ? pendingFromClient.actionId.trim()
        : null;
    const freshPendingReceipt = freshPendingId
      ? isApprovalAlreadyExecuted({
          sessionId: requestSessionId,
          approvalId: freshPendingId,
        })
      : null;
    const shouldReplayLatest =
      !freshPendingId || Boolean(freshPendingReceipt);
    if (shouldReplayLatest) {
      const terminalReceipt =
        freshPendingReceipt ??
        findLatestSessionApprovalReceipt(requestSessionId);
      if (terminalReceipt) {
        const replayRoute = {
          ...conversationRoute,
          mode: "APPROVAL_CONTROL" as const,
          legacyIntent: "approve_pending" as const,
        };
        return NextResponse.json(
          attachConversationRoute(
            buildTerminalApprovalReplayResponse({
              query,
              context,
              entities,
              receipt: terminalReceipt,
            }),
            replayRoute,
            conversationContextView,
            entities,
          ),
        );
      }
    }
  }

  if (
    conversationRoute.mode === "DIRECT_ANSWER" ||
    conversationRoute.mode === "CLARIFY_REFERENCE" ||
    conversationRoute.mode === "SAFE_REFUSAL"
  ) {
    const latestExecutionReceipt =
      conversationRoute.answerIntent === "execution_report" && requestSessionId
        ? findLatestSessionApprovalReceipt(requestSessionId)
        : null;
    const grounded = deterministicConversationAnswer({
      query,
      route: conversationRoute,
      latestExecution: latestExecutionReceipt
        ? {
            summaryKo: latestExecutionReceipt.summaryKo,
            jobId: latestExecutionReceipt.jobId,
            runId: latestExecutionReceipt.runId,
            ok: latestExecutionReceipt.ok,
            executedAt: latestExecutionReceipt.executedAt,
            stepToolIds: latestExecutionReceipt.stepToolIds,
          }
        : null,
    });
    let answer = grounded;
    let providerMeta: AgentResponse["providerMeta"] | undefined;
    let interpretationSource: "local" | "llm" = "local";

    // Provider-backed primary path for ordinary DIRECT_ANSWER.
    // productKnowledge remains grounding context, not final authority.
    // CLARIFY_REFERENCE / SAFE_REFUSAL stay deterministic.
    // Persisted execution reports must not be overwritten by a provider that
    // lacks the receipt and fabricates a "did nothing" answer.
    const mayCallProvider =
      conversationRoute.mode === "DIRECT_ANSWER" &&
      conversationRoute.providerExpected &&
      conversationRoute.answerIntent !== "execution_report" &&
      isReasoningActive();

    if (mayCallProvider) {
      const groundingFacts = grounded
        ? [
            {
              labelKo: "제품 지식 근거",
              value: grounded.conclusionKo,
              source: "system_status" as const,
              fetchedAt: new Date().toISOString(),
            },
            {
              labelKo: "제품 지식 보충",
              value: grounded.explanationKo,
              source: "system_status" as const,
              fetchedAt: new Date().toISOString(),
            },
          ].filter((fact) => Boolean(fact.value?.trim()))
        : [];
      const conversationalEntities: ConversationEntityMemory = {
        ...entities,
        pendingProposedAction: null,
        pendingPlan: null,
        pipelineStage: null,
        lifecycleStage: null,
      };
      const conversationalReasoning = await runReasoningEngine(
        buildReasoningInput({
          query,
          sessionId: requestSessionId,
          intentType: "unknown",
          goal: null,
          facts: groundingFacts,
          history,
          context,
          entities: conversationalEntities,
          lifecycleStage: null,
          pendingPlan: null,
          pendingProposedAction: null,
          allowedToolIds: [],
          conversationMode: conversationRoute.mode,
          taskProfile: "DIRECT_ANSWER",
        }),
        {
          turnId: body.turnId ?? null,
          sessionSelection,
        },
      );
      const artifact = conversationalReasoning.artifact;
      if (
        !artifact.fallbackUsed &&
        artifact.toolPlan.length === 0 &&
        !artifact.requiresApproval &&
        artifact.riskLevel !== "blocked" &&
        (artifact.conclusionKo?.trim() || artifact.decision.trim())
      ) {
        answer = {
          conclusionKo: artifact.conclusionKo ?? artifact.decision,
          explanationKo:
            artifact.explanationKo ?? artifact.decisionReason,
          recommendedActionKo: null,
        };
        interpretationSource = "llm";
        providerMeta = {
          provider: artifact.provider,
          model: artifact.model,
          latencyMs: conversationalReasoning.providerLatencyMs ?? 0,
          errorKo: conversationalReasoning.providerErrorKo ?? undefined,
        };
      } else if (artifact.fallbackUsed) {
        providerMeta = {
          provider: artifact.provider,
          model: artifact.model,
          latencyMs: conversationalReasoning.providerLatencyMs ?? 0,
          errorKo: conversationalReasoning.providerErrorKo ?? undefined,
        };
        // Keep grounded/local answer when provider falls back.
        answer = grounded ?? answer;
        interpretationSource = "local";
      }
    }

    const response = composeConversationResponse({
      route: conversationRoute,
      answer:
        answer ?? safeConversationalFallback(query, conversationRoute),
      entities,
      contextView: conversationContextView,
      interpretationSource,
      providerMeta,
    });
    if (latestExecutionReceipt) {
      response.executionResult = {
        commandId: latestExecutionReceipt.approvalId,
        commandType: "tool_plan",
        executionStatus: latestExecutionReceipt.ok ? "succeeded" : "failed",
        resultReference: null,
        jobId: latestExecutionReceipt.jobId,
        runId: latestExecutionReceipt.runId,
        alreadyExecuted: true,
        summaryKo: latestExecutionReceipt.summaryKo,
      };
    }
    return NextResponse.json(
      attachConversationRoute(
        response,
        conversationRoute,
        conversationContextView,
        entities,
      ),
    );
  }

  const detected = detectGoal({
    query,
    entities,
    lifecycleStage: null,
  });
  let intent = {
    ...detected.intent,
    type: conversationRoute.legacyIntent,
  };
  let goal =
    conversationRoute.mode === "APPROVAL_CONTROL"
      ? conversationRoute.legacyIntent === "approve_pending"
        ? ("approve" as const)
        : ("cancel" as const)
      : detected.goal;

  // Defence-in-depth: never build plans/commands for direct Live/real-order requests.
  const execClass = classifyExecutionRequest(query);
  if (execClass.kind === "blocked") {
    intent = {
      type: execClass.intentType,
      params: {},
      confidence: 0.99,
      rawQuery: query,
    };
    goal =
      execClass.intentType === "start_live" ? "blocked_live" : "blocked_execute";
  }

  const priorWorkingState = workingStateFromEntities(entities);

  const safetyCheck = checkIntentSafety(intent.type);
  if (!safetyCheck.allowed) {
    const response = buildAgentResponse(
      intent,
      [],
      {
        interpretationKo: safetyCheck.reasonKo ?? "허용되지 않는 작업입니다.",
        source: "local",
      },
      context,
      {
        entities,
        safetyBlocked: true,
        safetyReasonKo: safetyCheck.reasonKo,
        goal,
        priorWorkingState,
      },
    );
    return NextResponse.json(
      attachConversationRoute(
        response,
        conversationRoute,
        conversationContextView,
        entities,
      ),
    );
  }

  if (conversationRoute.mode === "READ_AND_ANSWER") {
    for (const toolId of conversationRoute.requestedReadTools) {
      await executeTool({
        toolId,
        input: readArgumentsForConversationTool(toolId, entities),
        context: {
          sessionId: requestSessionId,
          approved: false,
          approvalId: null,
          lifecycleContext: context,
          entityMemory: entities,
        },
      });
    }
  }

  let facts = await fetchFactsForIntent(intent.type, intent.params, context);
  if (intent.type === "compare_plans") {
    const sid = (body as unknown as { sessionId?: unknown }).sessionId;
    const comparison = typeof sid === "string" ? latestPlanComparison(sid) : null;
    facts = [{
      labelKo: "계획 차이 요약",
      value: comparison?.summaryKo ?? "비교할 서버 계획을 찾지 못했습니다.",
      source: "system_status",
      fetchedAt: new Date().toISOString(),
    }];
  }
  if (intent.type === "memory_recall") {
    const sid = (body as unknown as { sessionId?: unknown }).sessionId;
    const entries = typeof sid === "string"
      ? searchVerifiedMemory(sid, query, 5)
      : [];
    facts = entries.flatMap((entry) => [
      {
        labelKo: "검증된 기억",
        value: entry.statementKo,
        source: "system_status" as const,
        fetchedAt: new Date().toISOString(),
      },
      {
        labelKo: "증거 참조",
        value: entry.evidenceRefs.map((ref) => `${ref.type}:${ref.id}`).join(", "),
        source: "system_status" as const,
        fetchedAt: new Date().toISOString(),
      },
    ]);
  }
  let explicitProposedAction: ProposedAction | null = null;
  let explicitPlan: AgentPlanDraft | null = null;
  let workspace = null;

  if (intent.type === "prepare_search_plan") {
    if (isDirectExecutionRequest(query)) {
      const blocked = checkIntentSafety(
        execClass.kind === "blocked" ? execClass.intentType : "start_live",
      );
      return NextResponse.json(
        buildAgentResponse(
          intent,
          [],
          {
            interpretationKo: blocked.reasonKo ?? "허용되지 않는 작업입니다.",
            source: "local",
          },
          context,
          {
            entities,
            safetyBlocked: true,
            safetyReasonKo: blocked.reasonKo,
            goal,
            priorWorkingState,
          },
        ),
      );
    }
    const draft = buildSearchPlanDraft({
      requestedSymbol:
        intent.params.symbol ?? context?.symbol ?? entities.symbol,
      requestedTimeframe: /1\s*시간\s*(?:봉)?/i.test(query)
        ? "1h"
        : /4\s*시간\s*(?:봉)?/i.test(query)
          ? "4h"
          : context?.timeframe ?? entities.timeframe,
      missingSymbolHint:
        intent.params.symbol ??
        (entities.symbol === "BTC" || entities.symbol === "BTCUSDT"
          ? "ETH"
          : null),
    });
    const plan = buildApprovalDraft(searchPlanToAgentPlan(draft));
    facts = [...searchPlanDraftToFacts(draft), ...planDraftToFacts(plan)];
    explicitProposedAction = draft.proposedAction;
    explicitPlan = plan;
  } else if (intent.type === "prepare_backtest_plan") {
    if (isDirectExecutionRequest(query)) {
      const blocked = checkIntentSafety("start_live");
      return NextResponse.json(
        buildAgentResponse(
          { type: "start_live", params: {}, confidence: 0.99, rawQuery: query },
          [],
          {
            interpretationKo: blocked.reasonKo ?? "허용되지 않는 작업입니다.",
            source: "local",
          },
          context,
          {
            entities,
            safetyBlocked: true,
            safetyReasonKo: blocked.reasonKo,
            goal: "blocked_live",
            priorWorkingState,
          },
        ),
      );
    }
    const plan = buildApprovalDraft(
      buildBacktestPlanDraft({
        strategyId: context?.strategyId ?? entities.strategyId,
        strategyLabel: entities.strategyLabel,
        symbol: intent.params.symbol ?? entities.symbol ?? context?.symbol,
        timeframe: entities.timeframe ?? context?.timeframe,
        runId: context?.runId ?? entities.runId,
      }),
    );
    facts = [...facts, ...planDraftToFacts(plan)];
    explicitProposedAction = plan.proposedAction;
    explicitPlan = plan;
  } else if (intent.type === "prepare_paper_plan") {
    if (isDirectExecutionRequest(query)) {
      const blocked = checkIntentSafety("start_live");
      return NextResponse.json(
        buildAgentResponse(
          { type: "start_live", params: {}, confidence: 0.99, rawQuery: query },
          [],
          {
            interpretationKo: blocked.reasonKo ?? "허용되지 않는 작업입니다.",
            source: "local",
          },
          context,
          {
            entities,
            safetyBlocked: true,
            safetyReasonKo: blocked.reasonKo,
            goal: "blocked_live",
            priorWorkingState,
          },
        ),
      );
    }
    const plan = buildApprovalDraft(
      buildPaperPlanDraft({
        strategyId: context?.strategyId ?? entities.strategyId,
        strategyLabel:
          entities.strategyLabel ??
          facts.find((f) => f.labelKo === "후보 전략")?.value,
        symbol: entities.symbol ?? context?.symbol,
      }),
    );
    facts = [...facts, ...planDraftToFacts(plan)];
    explicitProposedAction = plan.proposedAction;
    explicitPlan = plan;
  } else if (
    intent.type === "risk_summary" &&
    conversationRoute.mode !== "READ_AND_ANSWER"
  ) {
    const plan = buildRiskReviewDraft({
      mdd: facts.find((f) => f.labelKo === "최대 낙폭(MDD)")?.value,
      totalReturn: facts.find((f) => f.labelKo === "총 수익률")?.value,
      symbol: facts.find((f) => f.labelKo === "심볼")?.value ?? entities.symbol,
      strategyLabel: entities.strategyLabel,
    });
    facts = [...facts, ...planDraftToFacts(plan)];
    explicitProposedAction = plan.proposedAction;
    explicitPlan = plan;
  } else if (
    intent.type === "research_workspace" ||
    intent.type === "recommend_next" ||
    intent.type === "first_run_help" ||
    intent.type === "continue_session"
  ) {
    workspace = await buildResearchWorkspaceSummary({ context, entities });
    if (
      intent.type === "research_workspace" &&
      conversationRoute.mode === "PLAN_AND_APPROVE"
    ) {
      facts = [...facts, ...planDraftToFacts(workspace.plan)];
      explicitProposedAction = workspace.plan.proposedAction;
      explicitPlan = workspace.plan;
    }
    if (intent.type === "continue_session") {
      explicitPlan = entities.pendingPlan;
      explicitProposedAction = entities.pendingProposedAction;
    }
  } else if (intent.type === "follow_up_why" || intent.type === "explain_waiting") {
    if (facts.length === 0) {
      facts = await fetchFactsForIntent("recommend_next", {}, context);
    }
    explicitPlan = entities.pendingPlan;
    explicitProposedAction = entities.pendingProposedAction;
  } else if (intent.type === "explain_approval") {
    const pa = entities.pendingProposedAction;
    if (!pa && !entities.pendingPlan) {
      facts = [
        {
          labelKo: "대기 제안",
          value: "없음",
          source: "system_status",
          fetchedAt: new Date().toISOString(),
        },
        {
          labelKo: "실행 여부",
          value: "시작되지 않음",
          source: "system_status",
          fetchedAt: new Date().toISOString(),
        },
      ];
    } else {
      const action = pa ?? entities.pendingPlan?.proposedAction;
      facts = [
        {
          labelKo: "대기 제안",
          value: action?.summary ?? entities.pendingPlan?.titleKo ?? "승인 대기",
          source: "system_status",
          fetchedAt: new Date().toISOString(),
        },
        {
          labelKo: "계획 종류",
          value: entities.pendingPlan?.titleKo ?? action?.summary ?? "제안",
          source: "system_status",
          fetchedAt: new Date().toISOString(),
        },
        {
          labelKo: "권장 다음 작업",
          value: action?.summary ?? "계획 검토",
          source: "system_status",
          fetchedAt: new Date().toISOString(),
        },
        {
          labelKo: "권장 이동 경로",
          value:
            action?.targetRoute ??
            entities.pendingPlan?.reviewRoute ??
            "/dashboard",
          source: "system_status",
          fetchedAt: new Date().toISOString(),
        },
        {
          labelKo: "실행 여부",
          value: "시작되지 않음 · 승인 시 화면만 열림",
          source: "system_status",
          fetchedAt: new Date().toISOString(),
        },
        {
          labelKo: "승인 결과",
          value:
            "화면 이동만 수행합니다. Search/Backtest/Paper/Live 엔진은 자동 실행되지 않습니다.",
          source: "system_status",
          fetchedAt: new Date().toISOString(),
        },
      ];
      explicitProposedAction = action ?? null;
      explicitPlan = entities.pendingPlan;
    }
  } else if (intent.type === "approve_pending") {
    if (!entities.pendingProposedAction && !entities.pendingPlan?.typedCommand) {
      facts = [
        {
          labelKo: "대기 제안",
          value: "없음",
          source: "system_status",
          fetchedAt: new Date().toISOString(),
        },
      ];
    } else {
      const pa = entities.pendingProposedAction;
      const typed = entities.pendingPlan?.typedCommand ?? null;
      facts = [
        {
          labelKo: "대기 제안",
          value: pa?.summary ?? entities.pendingPlan?.titleKo ?? "승인 대기",
          source: "system_status",
          fetchedAt: new Date().toISOString(),
        },
        {
          labelKo: "권장 다음 작업",
          value: pa?.summary ?? entities.pendingPlan?.titleKo ?? "승인",
          source: "system_status",
          fetchedAt: new Date().toISOString(),
        },
        {
          labelKo: "권장 사유",
          value:
            pa?.reason ??
            (typed
              ? "승인된 명령을 기존 API로 실행합니다."
              : "화면만 엽니다."),
          source: "system_status",
          fetchedAt: new Date().toISOString(),
        },
        {
          labelKo: "권장 이동 경로",
          value:
            pa?.targetRoute ??
            entities.pendingPlan?.openRoute ??
            "/dashboard",
          source: "system_status",
          fetchedAt: new Date().toISOString(),
        },
        {
          labelKo: "실행 여부",
          value: typed
            ? "승인 시 기존 API 실행 (Live/실주문 없음)"
            : "시작되지 않음 · 화면만 열림",
          source: "system_status",
          fetchedAt: new Date().toISOString(),
        },
      ];
      explicitProposedAction = pa;
      explicitPlan = entities.pendingPlan;
    }
  } else if (intent.type === "cancel_pending") {
    facts = [
      {
        labelKo: "대기 제안",
        value: entities.pendingProposedAction?.summary ?? "없음",
        source: "system_status",
        fetchedAt: new Date().toISOString(),
      },
      {
        labelKo: "실행 여부",
        value: "시작되지 않음",
        source: "system_status",
        fetchedAt: new Date().toISOString(),
      },
    ];
  }

  const skipAuth =
    intent.type === "unknown" ||
    intent.type === "market_status" ||
    intent.type === "approve_pending" ||
    intent.type === "cancel_pending" ||
    intent.type === "follow_up_why" ||
    intent.type === "explain_approval" ||
    intent.type === "explain_waiting" ||
    intent.type === "continue_session";

  if (!skipAuth) {
    const authCheck = checkDataAuthenticity(facts.length);
    if (!authCheck.allowed) {
      // Authenticity failure → still try lifecycle recommend rather than dead-end
      const fallbackFacts = await fetchFactsForIntent(
        "recommend_next",
        {},
        context,
      );
      workspace = await buildResearchWorkspaceSummary({ context, entities });
      const response = buildAgentResponse(
        {
          type: "recommend_next",
          params: {},
          confidence: 0.4,
          rawQuery: query,
        },
        fallbackFacts,
        {
          interpretationKo:
            authCheck.reasonKo ?? "데이터를 가져올 수 없습니다.",
          source: "local",
        },
        context,
        {
          entities,
          workspace,
          goal: "lifecycle_fallback",
          priorWorkingState,
        },
      );
      return NextResponse.json(
        attachConversationRoute(
          response,
          conversationRoute,
          conversationContextView,
          entities,
        ),
      );
    }
  }

  let executionSummaryKo: string | null = null;
  let executedCommand: TypedCommand | null = null;
  let toolPlanExec: Awaited<ReturnType<typeof executeApprovedToolPlan>> | null =
    null;
  let reasoningResult: ReasoningEngineResult | null = null;

  const turnId = (() => {
    const tid = (body as unknown as { turnId?: unknown }).turnId;
    return typeof tid === "string" ? tid : null;
  })();

  const pendingToolPlan = extractPendingToolPlan(
    entities.pendingProposedAction?.parameters,
  );
  const approvalId =
    typeof entities.pendingProposedAction?.actionId === "string"
      ? entities.pendingProposedAction.actionId
      : null;

  // Terminal approval ledger — authoritative before any provider/tool path.
  if (intent.type === "approve_pending") {
    let priorReceipt = isApprovalAlreadyExecuted({
      sessionId: requestSessionId,
      approvalId,
    });
    if (!priorReceipt && !approvalId?.trim()) {
      priorReceipt = findLatestSessionApprovalReceipt(requestSessionId);
    }
    if (priorReceipt) {
      return NextResponse.json(
        attachConversationRoute(
          buildTerminalApprovalReplayResponse({
            query,
            context,
            entities,
            receipt: priorReceipt,
          }),
          conversationRoute,
          conversationContextView,
          entities,
        ),
      );
    }
    if (!pendingToolPlan && !entities.pendingPlan?.typedCommand) {
      return NextResponse.json(
        attachConversationRoute(
          buildEmptyApprovalResponse({ query, context, entities }),
          conversationRoute,
          conversationContextView,
          entities,
        ),
      );
    }
  }

  // Approval executes first — no provider round-trip before tool execution.
  if (intent.type === "approve_pending" && pendingToolPlan && isReasoningPrimary()) {
    const pendingPlanId = entities.pendingProposedAction?.parameters?.planId;
    const planId = typeof pendingPlanId === "string" ? pendingPlanId : null;
    if (approvalId) {
      const claim = claimApprovalExecution({
        approvalId,
        sessionId: requestSessionId,
        planId,
      });
      if (!claim.claimed) {
        return NextResponse.json(
          attachConversationRoute(
            buildTerminalApprovalReplayResponse({
              query,
              context,
              entities,
              receipt: claim.receipt,
            }),
            conversationRoute,
            conversationContextView,
            entities,
          ),
        );
      }
    }
    const exec = await executeApprovedToolPlan({
      plan: pendingToolPlan,
      sessionId: requestSessionId,
      approvalId,
    });
    toolPlanExec = exec;
    if (exec.jobId) entities.jobId = exec.jobId;
    if (exec.runId) entities.runId = exec.runId;
    if (exec.sessionId) entities.paperSessionId = exec.sessionId;
    if (requestSessionId) {
      persistApprovedExecution({
        sessionId: requestSessionId,
        planId,
        approvalId,
        ok: exec.ok,
        jobId: exec.jobId,
        runId: exec.runId,
        paperSessionId: exec.sessionId,
        executedSteps: exec.steps,
      });
    }
    if (approvalId) {
      writeApprovalExecutionReceipt({
        approvalId,
        sessionId: requestSessionId,
        planId,
        ok: exec.ok,
        jobId: exec.jobId,
        runId: exec.runId,
        paperSessionId: exec.sessionId,
        summaryKo: exec.summaryKo,
        executedAt: new Date().toISOString(),
        stepToolIds: exec.steps.map((step) => step.toolId),
      });
    }
    executionSummaryKo = exec.summaryKo;
    facts = [
      ...facts,
      {
        labelKo: "실행 상태",
        value: exec.ok ? "succeeded" : "failed",
        source: "system_status",
        fetchedAt: new Date().toISOString(),
      },
    ];
    if (exec.jobId) {
      facts.push({
        labelKo: "작업 ID",
        value: exec.jobId,
        source: "strategy_search_jobs",
        fetchedAt: new Date().toISOString(),
      });
    }
    if (exec.runId) {
      facts.push({
        labelKo: "실행 ID",
        value: exec.runId,
        source: "backtest_store",
        fetchedAt: new Date().toISOString(),
      });
    }
    explicitPlan = null;
    explicitProposedAction = null;
  }

  // Explicit approval → typed command (V1 path) before any provider call.
  if (
    intent.type === "approve_pending" &&
    !pendingToolPlan &&
    entities.pendingPlan?.typedCommand
  ) {
    const draft = entities.pendingPlan.typedCommand;
    const typedApprovalId =
      approvalId ??
      (typeof draft.commandId === "string" ? draft.commandId : null);
    if (typedApprovalId) {
      const claim = claimApprovalExecution({
        approvalId: typedApprovalId,
        sessionId: requestSessionId,
        planId: null,
      });
      if (!claim.claimed) {
        return NextResponse.json(
          attachConversationRoute(
            buildTerminalApprovalReplayResponse({
              query,
              context,
              entities,
              receipt: claim.receipt,
            }),
            conversationRoute,
            conversationContextView,
            entities,
          ),
        );
      }
    }
    // Never clobber a prior succeeded command with the pending draft —
    // that would break idempotency on repeated approval of the same plan.
    const priorSaved = getCommand(draft.commandId);
    if (
      !priorSaved ||
      (priorSaved.executionStatus !== "succeeded" &&
        priorSaved.executionStatus !== "skipped_idempotent")
    ) {
      saveCommand(draft);
    }
    const result = await executeApprovedCommand(draft);
    executedCommand = result.command;
    executionSummaryKo = result.summaryKo;
    if (typedApprovalId) {
      writeApprovalExecutionReceipt({
        approvalId: typedApprovalId,
        sessionId: requestSessionId,
        planId: null,
        ok:
          result.command.executionStatus === "succeeded" ||
          result.command.executionStatus === "skipped_idempotent",
        jobId: result.command.jobId,
        runId: result.command.runId,
        paperSessionId: null,
        summaryKo: result.summaryKo ?? "승인 실행 완료",
        executedAt: new Date().toISOString(),
        stepToolIds: [result.command.commandType],
      });
    }
    facts = [
      ...facts,
      {
        labelKo: "명령 유형",
        value: result.command.commandType,
        source: "system_status",
        fetchedAt: new Date().toISOString(),
      },
      {
        labelKo: "실행 상태",
        value: result.command.executionStatus,
        source: "system_status",
        fetchedAt: new Date().toISOString(),
      },
      {
        labelKo: "결과 참조",
        value: result.command.resultReference ?? "없음",
        source: "system_status",
        fetchedAt: new Date().toISOString(),
      },
      {
        labelKo: "멱등성",
        value: result.alreadyExecuted ? "기존 결과 재사용" : "신규 실행",
        source: "system_status",
        fetchedAt: new Date().toISOString(),
      },
    ];
    if (result.command.jobId) {
      facts.push({
        labelKo: "작업 ID",
        value: result.command.jobId,
        source: "strategy_search_jobs",
        fetchedAt: new Date().toISOString(),
      });
    }
    if (result.command.runId) {
      facts.push({
        labelKo: "실행 ID",
        value: result.command.runId,
        source: "backtest_store",
        fetchedAt: new Date().toISOString(),
      });
    }
    // Clear pending plan after approval attempt — force re-plan for changes.
    explicitPlan = null;
    explicitProposedAction = null;
  }

  const reasoningEntities =
    conversationRoute.mode === "READ_AND_ANSWER"
      ? {
          ...entities,
          pendingPlan: null,
          pendingProposedAction: null,
        }
      : entities;
  const reasoningInput = buildReasoningInput({
    query,
    sessionId: requestSessionId,
    intentType: intent.type,
    goal,
    facts,
    history,
    context,
    entities: reasoningEntities,
    lifecycleStage: inferLifecycleStage(facts),
    pendingPlan:
      conversationRoute.mode === "READ_AND_ANSWER"
        ? null
        : explicitPlan ?? entities.pendingPlan,
    pendingProposedAction:
      conversationRoute.mode === "READ_AND_ANSWER"
        ? null
        : explicitProposedAction ?? entities.pendingProposedAction,
    allowedToolIds:
      conversationRoute.mode === "READ_AND_ANSWER"
        ? conversationRoute.requestedReadTools
        : undefined,
    conversationMode: conversationRoute.mode,
    taskProfile: resolveReasoningTaskProfile({
      conversationMode: conversationRoute.mode,
      factCount: facts.length,
      readToolCount: conversationRoute.requestedReadTools.length,
    }),
  });

  if (isReasoningActive()) {
    // Approvals never call providers — terminal ledger + local fast path only.
    reasoningResult = await runReasoningEngine(reasoningInput, {
      turnId,
      sessionSelection,
      skipProvider:
        toolPlanExec != null ||
        executedCommand != null ||
        intent.type === "approve_pending",
    });
    if (conversationRoute.mode === "READ_AND_ANSWER") {
      const allowedReads = new Set(conversationRoute.requestedReadTools);
      reasoningResult.artifact.toolPlan =
        reasoningResult.artifact.toolPlan
          .filter(
            (step) =>
              allowedReads.has(step.toolId) && step.requiresApproval === false,
          )
          .map((step) => ({ ...step, requiresApproval: false }));
      reasoningResult.artifact.requiresApproval = false;
      reasoningResult.artifact.blockedReason = null;
    }
    if (
      reasoningInput.sessionId &&
      conversationRoute.mode === "PLAN_AND_APPROVE" &&
      intent.type !== "approve_pending" &&
      intent.type !== "cancel_pending"
    ) {
      try {
        const sid = sanitizeSessionId(reasoningInput.sessionId);
        ensureAgentSession(sid);
        persistReasoningProposal(sid, reasoningResult.artifact);
      } catch (err) {
        if (!(err instanceof Error && err.message === "INVALID_SESSION_ID")) {
          throw err;
        }
      }
    }
  }

  const localInterpretation = executionSummaryKo
    ? executionSummaryKo
    : buildLocalInterpretation(intent, facts, entities);
  const decision = buildDecisionContext(intent.type, facts, entities);
  if (executionSummaryKo) {
    decision.conclusionKo = executionSummaryKo.split("\n\n")[0] ?? executionSummaryKo;
    decision.explanationKo =
      executionSummaryKo.split("\n\n").slice(1).join("\n\n") ||
      (toolPlanExec?.ok
        ? "요청한 작업이 완료되었습니다."
        : "명령 실행에 실패했습니다. 상태를 확인하세요.");
    decision.recommendedActionKo =
      executedCommand?.jobId || toolPlanExec?.jobId
        ? "탐색 상태를 확인하세요."
        : executedCommand?.runId || toolPlanExec?.runId
          ? "백테스트 화면에서 저장된 실행을 확인하세요."
          : executedCommand?.commandType === "prepare_paper_session" ||
              toolPlanExec?.sessionId
            ? "모의매매 화면에서 별도 활성화 승인을 확인하세요."
            : decision.recommendedActionKo;
    decision.situationKo = "";
  }

  const evidencePackage: EvidencePackage = {
    intentType: intent.type,
    query,
    facts,
    history: history.slice(-6),
    decisionContext: {
      conclusionKo: decision.conclusionKo,
      explanationKo: decision.explanationKo,
      recommendedActionKo: decision.recommendedActionKo,
      whyBetterThanAlternativesKo: decision.whyBetterThanAlternativesKo,
      uncertaintyKo: decision.uncertaintyKo,
    },
  };

  const llmResult =
    executionSummaryKo || (isReasoningPrimary() && reasoningResult?.artifact)
    ? {
        interpretationKo: executionSummaryKo
          ? `${decision.conclusionKo}\n\n${decision.explanationKo}`
          : `${reasoningResult?.artifact.conclusionKo ?? reasoningResult?.artifact.decision ?? ""}\n\n${reasoningResult?.artifact.explanationKo ?? reasoningResult?.artifact.decisionReason ?? ""}`,
        source: "local" as const,
      }
    : await callLLM(evidencePackage, localInterpretation);

  if (
    isReasoningPrimary() &&
    reasoningResult?.artifact &&
    intent.type !== "cancel_pending"
  ) {
    const reasoningResponse = buildResponseFromReasoning({
      intentType: intent.type,
      facts,
      artifact: reasoningResult.artifact,
      context,
      entities,
      explicitPlan: explicitPlan ?? undefined,
      providerErrorKo: reasoningResult.providerErrorKo,
      executionSummaryKo: executionSummaryKo ?? undefined,
      validationOk: reasoningResult.validation.ok,
      latencyMs: reasoningResult.providerLatencyMs ?? 0,
    });
    if (executedCommand) {
      reasoningResponse.executionResult = {
        commandId: executedCommand.commandId,
        commandType: executedCommand.commandType,
        executionStatus: executedCommand.executionStatus,
        resultReference: executedCommand.resultReference,
        jobId: executedCommand.jobId,
        runId: executedCommand.runId,
        alreadyExecuted:
          executedCommand.executionStatus === "skipped_idempotent",
        summaryKo: executionSummaryKo,
      };
    } else if (toolPlanExec) {
      reasoningResponse.executionResult = {
        commandId: reasoningResult.artifact.reasoningId,
        commandType: "tool_plan",
        executionStatus: toolPlanExec.ok ? "succeeded" : "failed",
        resultReference: null,
        jobId: toolPlanExec.jobId,
        runId: toolPlanExec.runId,
        alreadyExecuted: false,
        summaryKo: executionSummaryKo,
      };
    }
    return NextResponse.json(
      attachConversationRoute(
        reasoningResponse,
        conversationRoute,
        conversationContextView,
        entities,
        requestSessionId,
      ),
    );
  }

  if (isReasoningActive() && !isReasoningPrimary() && reasoningResult) {
    const v1Tools =
      explicitPlan?.typedCommand?.commandType === "create_strategy_search_job"
        ? ["search.create", "search.start"]
        : explicitPlan?.typedCommand?.commandType === "run_backtest"
          ? ["backtest.run"]
          : explicitPlan?.typedCommand?.commandType === "prepare_paper_session"
            ? ["paper.prepare"]
            : [];
    writeShadowAudit(
      compareShadowReasoning({
        query,
        v1Intent: intent.type,
        v1Goal: goal,
        v1RequiresApproval: Boolean(explicitPlan?.requiresApproval),
        v1Tools,
        v2: reasoningResult.artifact,
      }),
    );
  }

  const response = buildAgentResponse(intent, facts, llmResult, context, {
    entities,
    explicitProposedAction,
    explicitPlan,
    workspace,
    goal,
    priorWorkingState,
    decisionOverride: executionSummaryKo
      ? {
          conclusionKo: decision.conclusionKo,
          explanationKo: decision.explanationKo,
          recommendedActionKo: decision.recommendedActionKo,
          situationKo: "승인된 명령 실행 결과",
        }
      : null,
  });
  if (executedCommand) {
    response.executionResult = {
      commandId: executedCommand.commandId,
      commandType: executedCommand.commandType,
      executionStatus: executedCommand.executionStatus,
      resultReference: executedCommand.resultReference,
      jobId: executedCommand.jobId,
      runId: executedCommand.runId,
      alreadyExecuted:
        executedCommand.executionStatus === "skipped_idempotent",
      summaryKo: executionSummaryKo,
    };
  }
  return NextResponse.json(
    attachConversationRoute(
      response,
      conversationRoute,
      conversationContextView,
      entities,
      requestSessionId,
    ),
  );
}
