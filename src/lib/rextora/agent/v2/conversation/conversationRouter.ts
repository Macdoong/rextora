import { detectFollowUpKind } from "../../conversationContext";
import { parseIntent } from "../../intentParser";
import { isProposedActionExpired } from "../../proposedAction";
import type { AgentIntentType } from "../../types";
import {
  buildConversationContextView,
  buildWorkflowContextView,
  isCorrectionTurn,
} from "./conversationContext";
import { defaultClarification, modeRequiresProvider } from "./conversationPolicy";
import {
  hasDeicticReference,
  resolveConversationReference,
} from "./referenceResolver";
import type {
  ConversationRouteDecision,
  ConversationRouterInput,
  ConversationTopic,
} from "./conversationTypes";

const WRITE_INTENTS = new Set<AgentIntentType>([
  "prepare_search_plan",
  "prepare_backtest_plan",
  "prepare_paper_plan",
  "search_pause_request",
  "search_resume_request",
  "paper_start_request",
  "paper_pause_request",
  "paper_resume_request",
  "paper_stop_request",
  "results_promote_request",
  "strategy_rename_request",
  "strategy_archive_request",
  "strategy_restore_request",
  "strategy_delete_request",
]);

const READ_INTENTS = new Set<AgentIntentType>([
  "search_status",
  "backtest_summary",
  "risk_summary",
  "research_workspace",
  "research_analysis",
  "compare_strategies",
  "explain_strategy",
  "memory_recall",
]);

const QUESTION_RE =
  /[?？]|(?:뭐|무엇|왜|어떻게|어때|알려|설명|차이|의미|중요|맞아|인가|거야|건데|냐고)/i;
const SECRET_REQUEST_RE =
  /(?:api|API)\s*(?:키|key)|비밀\s*키|secret|token|토큰|credential|환경\s*변수.*보여/i;
const SAFE_MUTATION_RE =
  /SAFE.*(?:수정|변경|고쳐|덮어|삭제)|(?:수정|변경).*(?:SAFE\s*전략|SAFE\s*파일)/i;
const REAL_ORDER_RE =
  /(?:바이낸스|binance).*(?:실제\s*)?(?:주문|매수|매도)|(?:실제|실전).*(?:주문|매수|매도)|실전\s*매매.*(?:바로|시작|켜)|(?:^|\s)(?:live|라이브)\s*(?:시작|켜|활성|실행)/i;
const BLOCKED_INTENTS = new Set<AgentIntentType>([
  "start_live",
  "execute_trade",
  "modify_safe",
]);
const APPROVAL_WHY_RE =
  /왜\s*(?:승인|허락)|승인(?:이|을|은)?\s*왜\s*(?:필요|해야)|승인하면\s*뭐/i;
const EXECUTION_REPORT_RE =
  /방금\s*(?:실제로\s*)?(?:뭘|무엇|뭐)\s*(?:했|한|실행)|(?:실제로|방금)\s*(?:뭘|무엇|뭐)\s*(?:했|한)/i;
const CURRENT_STATE_RE =
  /(?:현재|지금|최근).*(?:상태|진행|현황|어디까지|돌아가|대기|결과)|승인\s*대기.*(?:뭐|어떤)|진행\s*상황|진행\s*중인.*(?:일|작업|뭐)/i;
const NEXT_ACTION_RE =
  /(?:지금|현재|오늘).*(?:난|내가|저는)?\s*(?:뭘|무엇을|뭐부터|뭐를|뭐)\s*(?:해야|하면|할까)|다음(?:엔|에는|으로)?\s*(?:뭘|무엇을|뭐)|가장\s*좋은\s*다음|뭐부터\s*해야/i;
const ACTION_VERB_RE =
  /(?:탐색\s*해줘|탐색해줘|진행\s*해|진행해|시작해|돌려|취소하고|다시\s*해|(?:으로|로)\s*해|다른\s*패턴.*(?:해|써|바꿔)|준비해|변경해|바꿔|만들어\s*줘|만들어줘|백테스트\s*해|백테스트해|일시\s*정지|재개해|보관해|복원해|삭제해|승격해)/i;

function decision(
  input: Omit<
    ConversationRouteDecision,
    "providerExpected" | "lifecycleInfluencedRouting"
  > & {
    providerExpected?: boolean;
    lifecycleInfluencedRouting?: boolean;
  },
): ConversationRouteDecision {
  return {
    ...input,
    providerExpected:
      input.providerExpected ?? modeRequiresProvider(input.mode, input.topic),
    lifecycleInfluencedRouting: input.lifecycleInfluencedRouting ?? false,
  };
}

function readToolsForTopic(
  topic: ConversationTopic,
  input: ConversationRouterInput,
  legacyIntent?: AgentIntentType,
): string[] {
  if (legacyIntent === "memory_recall") return ["memory.recall"];
  if (legacyIntent === "research_analysis") return ["research.summary"];
  if (legacyIntent === "research_workspace") return ["research.summary"];
  if (legacyIntent === "compare_strategies") {
    return ["strategy.list", "backtest.list"];
  }
  switch (topic) {
    case "search_status":
      return input.entities.jobId ? ["search.status"] : ["search.list"];
    case "backtest_analysis":
    case "strategy_risk":
      return input.entities.runId
        ? ["backtest.detail", "strategy.detail"]
        : ["backtest.list", "strategy.list"];
    case "paper_status":
      return input.entities.paperSessionId
        ? ["paper.session"]
        : ["paper.status"];
    case "approval_status":
      return ["workspace.current"];
    case "workspace_status":
      return ["workspace.current", "lifecycle.current"];
    case "strategy_explanation":
      return input.entities.strategyId
        ? ["strategy.detail"]
        : ["strategy.list"];
    default:
      return ["workspace.current"];
  }
}

function legacyReadIntent(topic: ConversationTopic): AgentIntentType {
  if (topic === "search_status") return "search_status";
  if (topic === "backtest_analysis") return "backtest_summary";
  if (topic === "strategy_risk") return "risk_summary";
  if (topic === "strategy_explanation") return "explain_strategy";
  if (topic === "paper_status") return "paper_status";
  return "workspace_status";
}

function topicForReadIntent(
  intent: AgentIntentType,
  fallback: ConversationTopic,
): ConversationTopic {
  if (intent === "memory_recall") return "workspace_status";
  if (intent === "search_status") return "search_status";
  if (intent === "backtest_summary") return "backtest_analysis";
  if (intent === "risk_summary") return "strategy_risk";
  if (intent === "explain_strategy") return "strategy_explanation";
  if (intent === "research_analysis" || intent === "research_workspace") {
    return "backtest_analysis";
  }
  return fallback === "unknown" ? "workspace_status" : fallback;
}

function statusTopicForWorkspace(
  topic: ConversationTopic,
  input: ConversationRouterInput,
): ConversationTopic {
  if (topic !== "unknown" && topic !== "workspace_status") return topic;
  const stage =
    input.lifecycleStage ??
    input.entities.pipelineStage ??
    input.entities.lifecycleStage ??
    null;
  if (
    input.entities.jobId ||
    stage === "search_running" ||
    stage === "search_needed" ||
    stage === "search_failed"
  ) {
    return "search_status";
  }
  if (
    input.entities.paperSessionId ||
    stage === "paper_active" ||
    stage === "paper_ready"
  ) {
    return "paper_status";
  }
  if (input.entities.runId || stage === "backtest_review") {
    return "backtest_analysis";
  }
  return "workspace_status";
}

function actionTopic(intent: AgentIntentType): ConversationTopic {
  if (intent.startsWith("paper_") || intent === "prepare_paper_plan") {
    return "feature_paper";
  }
  if (intent === "prepare_backtest_plan") return "feature_backtest";
  if (intent.startsWith("strategy_")) return "strategy_explanation";
  return "workflow_action";
}

function writeToolsForIntent(
  intent: AgentIntentType,
  query: string,
): string[] {
  if (intent === "prepare_search_plan") {
    return /취소.*(?:다시|새|다른)|cancel.*replace/i.test(query)
      ? ["search.cancel", "search.create", "search.start"]
      : ["search.create", "search.start"];
  }
  if (intent === "prepare_backtest_plan") return ["backtest.run"];
  if (intent === "prepare_paper_plan") return ["paper.prepare"];
  if (intent === "search_pause_request") return ["search.pause"];
  if (intent === "search_resume_request") return ["search.start"];
  if (intent === "paper_start_request") return ["paper.approve_start"];
  if (intent === "paper_pause_request") return ["paper.pause"];
  if (intent === "paper_resume_request") return ["paper.resume"];
  if (intent === "paper_stop_request") return ["paper.stop"];
  if (intent === "results_promote_request") return ["results.promote"];
  if (intent === "strategy_rename_request") return ["strategy.rename"];
  if (intent === "strategy_archive_request") return ["strategy.archive"];
  if (intent === "strategy_restore_request") return ["strategy.restore"];
  if (intent === "strategy_delete_request") return ["strategy.delete"];
  return [];
}

export function routeConversationTurn(
  input: ConversationRouterInput,
): ConversationRouteDecision {
  const query = input.query.trim();
  const conversation = buildConversationContextView({
    ...input,
    priorTopic: input.priorConversationTopic,
  });
  const workflow = buildWorkflowContextView({
    entities: input.entities,
    lifecycleStage: input.lifecycleStage,
    pendingApprovals: input.pendingApprovals,
  });
  const resolvedReference = resolveConversationReference(input);
  const validApprovals = workflow.pendingApprovals.filter(
    (approval) => !isProposedActionExpired(approval),
  );
  const controlQuery = query.replace(/[?.!,。！？]+$/g, "").trim();
  const followUp =
    /^(?:아냐\s*)?(?:그거\s*)?취소$/i.test(controlQuery)
      ? "cancel"
      : detectFollowUpKind(controlQuery);
  const parsedIntent = parseIntent(query);

  // Safety boundaries are authoritative and precede all conversational routing.
  if (SECRET_REQUEST_RE.test(query)) {
    return decision({
      mode: "SAFE_REFUSAL",
      topic: "safety",
      resolvedReference,
      confidence: 0.99,
      needsWorkspaceFacts: false,
      requestedReadTools: [],
      requestedWriteTools: [],
      requiresApproval: false,
      answerIntent: "secret_exposure_refusal",
      reason: "credential exposure is never allowed",
      legacyIntent: "unknown",
      clarificationQuestionKo: null,
      providerExpected: false,
    });
  }
  if (SAFE_MUTATION_RE.test(query)) {
    return decision({
      mode: "SAFE_REFUSAL",
      topic: "safety",
      resolvedReference,
      confidence: 0.99,
      needsWorkspaceFacts: false,
      requestedReadTools: [],
      requestedWriteTools: [],
      requiresApproval: false,
      answerIntent: "safe_mutation_refusal",
      reason: "protected SAFE strategy mutation requested",
      legacyIntent: "modify_safe",
      clarificationQuestionKo: null,
      providerExpected: false,
    });
  }
  if (
    BLOCKED_INTENTS.has(parsedIntent.type) ||
    REAL_ORDER_RE.test(query) ||
    (conversation.currentTopic === "feature_live" &&
      ACTION_VERB_RE.test(query))
  ) {
    const legacyIntent: AgentIntentType =
      parsedIntent.type === "modify_safe" ||
      parsedIntent.type === "start_live" ||
      parsedIntent.type === "execute_trade"
        ? parsedIntent.type
        : /SAFE/i.test(query)
          ? "modify_safe"
          : /주문|매수|매도|order/i.test(query)
            ? "execute_trade"
            : "start_live";
    return decision({
      mode: "SAFE_REFUSAL",
      topic: "safety",
      resolvedReference,
      confidence: 0.99,
      needsWorkspaceFacts: false,
      requestedReadTools: [],
      requestedWriteTools: [],
      requiresApproval: false,
      answerIntent:
        legacyIntent === "modify_safe"
          ? "safe_mutation_refusal"
          : legacyIntent === "execute_trade"
            ? "real_order_refusal"
            : "live_activation_refusal",
      reason: "blocked live, real-order, or SAFE mutation request",
      legacyIntent,
      clarificationQuestionKo: null,
      providerExpected: false,
    });
  }

  // Plan diffs must stay deterministic — never free-form provider chat.
  if (
    parsedIntent.type === "compare_plans" ||
    /(?:방금|이전|최근).*(?:계획|설정).*(?:무엇|뭐|어떻게).*(?:달라|차이)/i.test(
      query,
    ) ||
    /(?:계획|설정).*(?:차이|달라진|비교)/i.test(query)
  ) {
    return decision({
      mode: "READ_AND_ANSWER",
      topic: "workspace_status",
      resolvedReference,
      confidence: 0.95,
      needsWorkspaceFacts: true,
      requestedReadTools: ["workspace.current"],
      requestedWriteTools: [],
      requiresApproval: false,
      answerIntent: "compare_plans",
      reason: "plan comparison uses persisted plan ledger diffs",
      legacyIntent: "compare_plans",
      clarificationQuestionKo: null,
      providerExpected: false,
      lifecycleInfluencedRouting: true,
    });
  }

  // Research requests remain grounded in the research brain. Action phrasing
  // may produce an approval plan; analytical phrasing remains read-only.
  if (parsedIntent.type === "research_analysis") {
    const explicitResearchMutation =
      /연구.*(?:해줘|진행)|찾아\s*줘|다른\s*설정.*다시|다시\s*해/i.test(
        query,
      );
    const asksForAnalysis =
      /무엇|뭐|어떤|왜|인지|원인.*설명|근거.*설명/i.test(query);
    const researchAction =
      explicitResearchMutation ||
      (ACTION_VERB_RE.test(query) && !asksForAnalysis);
    const researchTopic: ConversationTopic =
      /MDD|수수료|슬리피지|실패|원인|위험|리스크/i.test(query)
        ? "strategy_risk"
        : "backtest_analysis";
    return decision({
      mode: researchAction ? "PLAN_AND_APPROVE" : "READ_AND_ANSWER",
      topic: researchTopic,
      resolvedReference,
      confidence: parsedIntent.confidence,
      needsWorkspaceFacts: true,
      requestedReadTools: ["research.summary"],
      requestedWriteTools: researchAction
        ? ["search.create", "search.start"]
        : [],
      requiresApproval: researchAction,
      answerIntent: researchAction
        ? "research_plan"
        : "grounded_research_answer",
      reason: researchAction
        ? "research action requires a typed approved plan"
        : "research analysis requires persisted evidence",
      legacyIntent: "research_analysis",
      clarificationQuestionKo: null,
      providerExpected: true,
      lifecycleInfluencedRouting: false,
    });
  }

  // Memory recall may contain feature nouns like "결과"; keep it above
  // feature-page DIRECT_ANSWER short-circuits. Other read intents wait until
  // after product/concept and explicit action routing.
  if (parsedIntent.type === "memory_recall") {
    return decision({
      mode: "READ_AND_ANSWER",
      topic: "workspace_status",
      resolvedReference,
      confidence: parsedIntent.confidence,
      needsWorkspaceFacts: true,
      requestedReadTools: ["memory.recall"],
      requestedWriteTools: [],
      requiresApproval: false,
      answerIntent: "memory_recall_answer",
      reason: "memory recall outranks feature keyword shortcuts",
      legacyIntent: "memory_recall",
      clarificationQuestionKo: null,
      providerExpected: true,
      lifecycleInfluencedRouting: false,
    });
  }

  // Explicit present-turn product/concept meaning outranks every workflow state.
  if (
    conversation.currentTopic === "rextora_product" ||
    conversation.currentTopic.startsWith("concept_") ||
    (conversation.currentTopic.startsWith("feature_") &&
      QUESTION_RE.test(query) &&
      !ACTION_VERB_RE.test(query))
  ) {
    return decision({
      mode: "DIRECT_ANSWER",
      topic: conversation.currentTopic,
      resolvedReference,
      confidence: conversation.confidence,
      needsWorkspaceFacts: false,
      requestedReadTools: [],
      requestedWriteTools: [],
      requiresApproval: false,
      answerIntent: isCorrectionTurn(query)
        ? "corrected_direct_answer"
        : "stable_domain_answer",
      reason: "explicit current-turn product or concept question",
      legacyIntent: "unknown",
      clarificationQuestionKo: null,
      lifecycleInfluencedRouting: false,
    });
  }

  if (APPROVAL_WHY_RE.test(query)) {
    return decision({
      mode: "DIRECT_ANSWER",
      topic: "approval_control",
      resolvedReference,
      confidence: 0.94,
      needsWorkspaceFacts: false,
      requestedReadTools: [],
      requestedWriteTools: [],
      requiresApproval: false,
      answerIntent: "approval_concept",
      reason: "conceptual approval question",
      legacyIntent: "explain_approval",
      clarificationQuestionKo: null,
      providerExpected: false,
    });
  }

  if (EXECUTION_REPORT_RE.test(query)) {
    return decision({
      mode: "DIRECT_ANSWER",
      topic: "rextora_product",
      resolvedReference,
      confidence: 0.94,
      needsWorkspaceFacts: false,
      requestedReadTools: [],
      requestedWriteTools: [],
      requiresApproval: false,
      answerIntent: "execution_report",
      reason: "user asked what the agent just did in this conversation",
      legacyIntent: "unknown",
      clarificationQuestionKo: null,
      providerExpected: true,
    });
  }

  // Approval controls require an unambiguous, currently valid target.
  // When the client sends an explicit live pendingProposedAction, that is the
  // approval target — do not clarify against stale workspace approval copies.
  if (followUp === "approve" || /아까\s*(?:거|것|계획).*(?:진행|승인)/i.test(query)) {
    const explicitPending =
      input.entities.pendingProposedAction &&
      !isProposedActionExpired(input.entities.pendingProposedAction)
        ? input.entities.pendingProposedAction
        : null;
    // A legacy single-pending mirror is only authoritative when the workflow
    // does not report multiple valid approvals. Multiple live targets must be
    // clarified to prevent executing the wrong write.
    const approveTargets =
      explicitPending && validApprovals.length <= 1
        ? [explicitPending]
        : validApprovals;
    if (approveTargets.length === 1) {
      return decision({
        mode: "APPROVAL_CONTROL",
        topic: "approval_control",
        resolvedReference: {
          kind: "approval",
          labelKo: approveTargets[0]!.summary,
          id: approveTargets[0]!.actionId,
          source: "workflow_state",
          confidence: 0.98,
        },
        confidence: 0.98,
        needsWorkspaceFacts: false,
        requestedReadTools: [],
        requestedWriteTools: [],
        requiresApproval: false,
        answerIntent: "approve_exact_pending",
        reason: explicitPending
          ? "explicit client pending approval"
          : "exactly one valid pending approval",
        legacyIntent: "approve_pending",
        clarificationQuestionKo: null,
        providerExpected: false,
        lifecycleInfluencedRouting: true,
      });
    }
    const stale = input.pendingApprovals.length > 0 && validApprovals.length === 0;
    return decision({
      mode: "CLARIFY_REFERENCE",
      topic: "approval_control",
      resolvedReference: null,
      confidence: stale ? 0.9 : 0.55,
      needsWorkspaceFacts: false,
      requestedReadTools: [],
      requestedWriteTools: [],
      requiresApproval: false,
      answerIntent: stale ? "stale_approval" : "ambiguous_approval",
      reason: stale
        ? "referenced approval is expired or terminal"
        : `${validApprovals.length} valid approvals prevent exact execution`,
      legacyIntent: "unknown",
      clarificationQuestionKo: stale
        ? "이전 승인은 더 이상 실행할 수 없습니다. 같은 조건으로 새 계획을 준비할까요?"
        : defaultClarification("approval_control"),
      providerExpected: false,
      lifecycleInfluencedRouting: input.pendingApprovals.length > 0,
    });
  }

  if (followUp === "cancel") {
    if (validApprovals.length === 1) {
      return decision({
        mode: "APPROVAL_CONTROL",
        topic: "approval_control",
        resolvedReference: {
          kind: "approval",
          labelKo: validApprovals[0]!.summary,
          id: validApprovals[0]!.actionId,
          source: "workflow_state",
          confidence: 0.98,
        },
        confidence: 0.98,
        needsWorkspaceFacts: false,
        requestedReadTools: [],
        requestedWriteTools: [],
        requiresApproval: false,
        answerIntent: "cancel_exact_pending",
        reason: "exactly one valid pending approval",
        legacyIntent: "cancel_pending",
        clarificationQuestionKo: null,
        providerExpected: false,
        lifecycleInfluencedRouting: true,
      });
    }
    return decision({
      mode: "CLARIFY_REFERENCE",
      topic: "approval_control",
      resolvedReference: null,
      confidence: 0.55,
      needsWorkspaceFacts: false,
      requestedReadTools: [],
      requestedWriteTools: [],
      requiresApproval: false,
      answerIntent: "ambiguous_cancel",
      reason: "cancel target is not unique",
      legacyIntent: "unknown",
      clarificationQuestionKo: "어떤 계획을 취소할지 선택해 주세요.",
      providerExpected: false,
    });
  }

  // Current-state and next-action guidance use canonical read tools, never approval.
  if (
    /(?:방금\s*(?:보고|말한|언급)|그\s*수치|수치는\s*어디).*(?:수치|숫자|값|지표|결과)/i.test(query) ||
    /(?:수치|숫자|값).*(?:어디|출처)/i.test(query)
  ) {
    return decision({
      mode: "READ_AND_ANSWER",
      topic: "workspace_status",
      resolvedReference,
      confidence: 0.86,
      needsWorkspaceFacts: true,
      requestedReadTools: readToolsForTopic("workspace_status", input),
      requestedWriteTools: [],
      requiresApproval: false,
      answerIntent: "metric_provenance_answer",
      reason: "metric provenance question requires grounded facts",
      legacyIntent: "follow_up_why",
      clarificationQuestionKo: null,
      providerExpected: true,
    });
  }

  if (
    (!ACTION_VERB_RE.test(query) &&
      (CURRENT_STATE_RE.test(query) || NEXT_ACTION_RE.test(query))) ||
    (!ACTION_VERB_RE.test(query) &&
      [
        "workspace_status",
        "search_status",
        "backtest_analysis",
        "paper_status",
        "approval_status",
        "strategy_risk",
      ].includes(conversation.currentTopic))
  ) {
    const topic = statusTopicForWorkspace(
      conversation.currentTopic,
      input,
    );
    return decision({
      mode: "READ_AND_ANSWER",
      topic,
      resolvedReference,
      confidence: 0.9,
      needsWorkspaceFacts: true,
      requestedReadTools: readToolsForTopic(topic, input),
      requestedWriteTools: [],
      requiresApproval: false,
      answerIntent: "grounded_workspace_answer",
      reason: "question requires persisted Rextora state",
      legacyIntent: legacyReadIntent(topic),
      clarificationQuestionKo: null,
      providerExpected: true,
      lifecycleInfluencedRouting: false,
    });
  }

  if (
    WRITE_INTENTS.has(parsedIntent.type) ||
    (ACTION_VERB_RE.test(query) &&
      /탐색|백테스트|모의매매|전략|결과|후보|패턴|1\s*시간|시간봉/i.test(query))
  ) {
    const legacyIntent =
      WRITE_INTENTS.has(parsedIntent.type)
        ? parsedIntent.type
        : /백테스트/.test(query)
          ? "prepare_backtest_plan"
          : /모의매매|페이퍼|paper/i.test(query)
            ? "prepare_paper_plan"
            : "prepare_search_plan";
    return decision({
      mode: "PLAN_AND_APPROVE",
      topic: actionTopic(legacyIntent),
      resolvedReference,
      confidence:
        parsedIntent.type !== "unknown" ? parsedIntent.confidence : 0.78,
      needsWorkspaceFacts: true,
      requestedReadTools: readToolsForTopic("workspace_status", input),
      requestedWriteTools: writeToolsForIntent(legacyIntent, query),
      requiresApproval: true,
      answerIntent: "build_typed_plan",
      reason: "explicit state-changing operating request",
      legacyIntent,
      clarificationQuestionKo: null,
      providerExpected: true,
      lifecycleInfluencedRouting: false,
    });
  }

  if (READ_INTENTS.has(parsedIntent.type)) {
    const topic = topicForReadIntent(
      parsedIntent.type,
      conversation.currentTopic,
    );
    return decision({
      mode: "READ_AND_ANSWER",
      topic,
      resolvedReference,
      confidence: parsedIntent.confidence,
      needsWorkspaceFacts: true,
      requestedReadTools: readToolsForTopic(topic, input, parsedIntent.type),
      requestedWriteTools: [],
      requiresApproval: false,
      answerIntent: "grounded_workspace_answer",
      reason: "explicit read intent",
      legacyIntent: parsedIntent.type,
      clarificationQuestionKo: null,
      providerExpected: true,
    });
  }

  if (hasDeicticReference(query)) {
    if (followUp === "why" && input.history.length > 0) {
      const topic = statusTopicForWorkspace(conversation.currentTopic, input);
      return decision({
        mode: "READ_AND_ANSWER",
        topic,
        resolvedReference:
          resolvedReference ?? {
            kind: "product",
            labelKo: "직전 추천",
            id: null,
            source: "recent_assistant_turn",
            confidence: 0.82,
          },
        confidence: 0.88,
        needsWorkspaceFacts: true,
        requestedReadTools: readToolsForTopic(topic, input),
        requestedWriteTools: [],
        requiresApproval: false,
        answerIntent: "explain_prior_recommendation",
        reason: "follow-up why with prior conversation context",
        legacyIntent: "follow_up_why",
        clarificationQuestionKo: null,
        providerExpected: true,
      });
    }
    if (
      /방금\s*(?:보고|말한|언급).*(?:수치|숫자|값|지표|결과)/i.test(query)
    ) {
      return decision({
        mode: "READ_AND_ANSWER",
        topic: "workspace_status",
        resolvedReference,
        confidence: 0.86,
        needsWorkspaceFacts: true,
        requestedReadTools: readToolsForTopic("workspace_status", input),
        requestedWriteTools: [],
        requiresApproval: false,
        answerIntent: "metric_provenance_answer",
        reason: "metric provenance question requires grounded facts",
        legacyIntent: "follow_up_why",
        clarificationQuestionKo: null,
        providerExpected: true,
      });
    }
    if (
      resolvedReference &&
      resolvedReference.source !== "workflow_state" &&
      resolvedReference.confidence >= 0.75
    ) {
      return decision({
        mode: "DIRECT_ANSWER",
        topic: conversation.currentTopic,
        resolvedReference,
        confidence: resolvedReference.confidence,
        needsWorkspaceFacts: false,
        requestedReadTools: [],
        requestedWriteTools: [],
        requiresApproval: false,
        answerIntent: "resolved_reference_answer",
        reason: "deictic reference resolved above workflow state",
        legacyIntent: "unknown",
        clarificationQuestionKo: null,
        providerExpected: false,
      });
    }
    return decision({
      mode: "CLARIFY_REFERENCE",
      topic: conversation.currentTopic,
      resolvedReference,
      confidence: resolvedReference?.confidence ?? 0.35,
      needsWorkspaceFacts: false,
      requestedReadTools: [],
      requestedWriteTools: [],
      requiresApproval: false,
      answerIntent: "clarify_ambiguous_reference",
      reason: "reference confidence is insufficient",
      legacyIntent: "unknown",
      clarificationQuestionKo:
        resolvedReference?.kind === "approval"
          ? `현재 화면의 ‘${resolvedReference.labelKo}’ 승인 카드를 말씀하시는 건가요?`
          : defaultClarification(conversation.currentTopic),
      providerExpected: false,
      lifecycleInfluencedRouting:
        resolvedReference?.source === "workflow_state",
    });
  }

  // Unknown questions remain conversational; lifecycle state is background only.
  return decision({
    mode: "DIRECT_ANSWER",
    topic: conversation.currentTopic,
    resolvedReference,
    confidence: QUESTION_RE.test(query) ? 0.62 : 0.52,
    needsWorkspaceFacts: false,
    requestedReadTools: [],
    requestedWriteTools: [],
    requiresApproval: false,
    answerIntent: "provider_conversation",
    reason: "unknown conversational turn must not become lifecycle execution",
    legacyIntent: "unknown",
    clarificationQuestionKo: null,
    providerExpected: true,
    lifecycleInfluencedRouting: false,
  });
}
