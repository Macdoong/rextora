import type { AgentTurn } from "../../types";
import type { ConversationEntityMemory } from "../../conversationContext";
import type { PipelineLifecycleStage } from "../../lifecycleStage";
import type { ProposedAction } from "../../proposedAction";
import type {
  ConversationContextView,
  ConversationTopic,
  SelectedUiObject,
  WorkflowContextView,
} from "./conversationTypes";

const PRODUCT_RE =
  /(?:렉스토라|rextora).*(?:앱|서비스|제품|기능|뭐|무엇|목적|하는)|(?:앱|서비스|제품|기능).*(?:렉스토라|rextora)|앱\s*자체|앱\s*기능/i;
const CAPABILITY_RE =
  /(?:너|니가|네가|당신|에이전트|ai).*(?:뭘|무엇|뭐).*(?:할\s*수|할수|해\s*줄|해줄)|(?:너|니가|네가|당신|에이전트|ai).*(?:해줄\s*수|해\s*줄\s*수|할\s*수|할수).*(?:뭐|무엇|게)|(?:할\s*수\s*있|할수있|해줄\s*수\s*있).*(?:뭐|무엇)|능력|역할이\s*뭐|무슨\s*값.*(?:바꿀|변경)/i;
const NEXT_ACTION_RE =
  /(?:지금|현재|오늘).*(?:난|내가|저는)?\s*(?:뭘|무엇을|뭐부터|뭐를|뭐)\s*(?:해야|하면|할까)|다음(?:엔|에는|으로)?\s*(?:뭘|무엇을|뭐)|가장\s*좋은\s*다음|뭐부터\s*해야/i;
/** Typo-tolerant backtest token (exact + common misspellings). */
const BACKTEST_TOKEN_RE = /백\s*테\s*스\s*트|백태스트|백테슽|back\s*test|backtest/i;

export function topicFromText(text: string): ConversationTopic {
  const value = text.trim().toLowerCase();
  if (/현재\s*상태\s*말고.*(?:앱|기능|렉스토라|제품|서비스)/i.test(text)) {
    return "rextora_product";
  }
  if (PRODUCT_RE.test(value)) return "rextora_product";
  if (CAPABILITY_RE.test(value)) return "rextora_product";
  if (NEXT_ACTION_RE.test(value)) return "workspace_status";
  if (BACKTEST_TOKEN_RE.test(value)) {
    return /최근|결과|분석|위험|전략/.test(value)
      ? "backtest_analysis"
      : "feature_backtest";
  }
  if (/모의매매|모의\s*매매|페이퍼|paper/.test(value)) {
    return /현재|상태|진행|어때/.test(value)
      ? "paper_status"
      : "feature_paper";
  }
  if (/실전매매|실거래|live/.test(value)) return "feature_live";
  if (/연구|탐색|search/.test(value)) {
    return /현재|상태|어디까지|진행|돌아가/.test(value)
      ? "search_status"
      : /연구/.test(value)
        ? "unknown"
        : "feature_search";
  }
  // Memory/recall phrasing may contain "결과" without asking about the Results page.
  if (/(?:기억|배웠|학습|회상|remember|recall)/.test(value)) {
    return "workspace_status";
  }
  if (/결과|results|후보/.test(value)) return "feature_results";
  if (/\bmdd\b|최대\s*낙폭|낙폭/.test(value)) return "concept_mdd";
  if (/과적합|overfitt/.test(value)) return "concept_overfitting";
  if (/수수료|슬리피지|거래\s*비용|funding|펀딩/.test(value)) {
    return "concept_costs";
  }
  if (/오더\s*블럭|오더블럭|order\s*block/.test(value)) {
    return "concept_order_block";
  }
  if (/가격\s*불균형|fvg|fair\s*value\s*gap/.test(value)) {
    return "concept_fvg";
  }
  if (/승인/.test(value)) {
    return /현재|대기|뭐|어떤/.test(value)
      ? "approval_status"
      : "approval_control";
  }
  if (/최근.*전략.*(?:위험|리스크)|전략.*(?:위험|리스크)/.test(value)) {
    return "strategy_risk";
  }
  if (/전략.*(?:설명|뭐|어떻게)|그\s*전략/.test(value)) {
    return "strategy_explanation";
  }
  if (/현재\s*(?:진행|상태)|지금\s*뭐\s*(?:돌아|진행)|진행\s*상황|실패한\s*건\s*없/i.test(value)) {
    return "workspace_status";
  }
  return "unknown";
}

function previousAgentTurn(history: AgentTurn[]): AgentTurn | null {
  return [...history].reverse().find((turn) => turn.role === "agent") ?? null;
}

function previousUserTopic(history: AgentTurn[]): ConversationTopic | null {
  for (const turn of [...history].reverse()) {
    if (turn.role !== "user") continue;
    const topic = topicFromText(turn.content);
    if (topic !== "unknown") return topic;
  }
  const assistant = previousAgentTurn(history);
  if (!assistant) return null;
  const topic = topicFromText(assistant.content);
  return topic === "unknown" ? null : topic;
}

export function isSimplificationFollowUp(query: string): boolean {
  return /(?:좀\s*)?더\s*(?:쉽게|간단히)|쉽게\s*설명|무슨\s*말이야|초보자|한\s*줄로/i.test(
    query,
  );
}

export function isCorrectionTurn(query: string): boolean {
  return /^(?:아니|아냐|그거\s*말고|내\s*질문은|현재\s*상태\s*말고|내\s*질문에)/i.test(
    query.trim(),
  );
}

export function buildConversationContextView(input: {
  query: string;
  history: AgentTurn[];
  selectedUiObject?: SelectedUiObject | null;
  priorTopic?: ConversationTopic | null;
}): ConversationContextView {
  const explicitTopic = topicFromText(input.query);
  const priorTopic = previousUserTopic(input.history) ?? input.priorTopic ?? null;
  const simplification = isSimplificationFollowUp(input.query);
  const currentTopic =
    explicitTopic !== "unknown"
      ? explicitTopic
      : simplification && priorTopic
        ? priorTopic
        : "unknown";

  return {
    currentQuestion: input.query,
    currentTopic,
    previousTopic: priorTopic,
    previousRelevantTurn: previousAgentTurn(input.history),
    referenceCandidates: [],
    selectedUiObject: input.selectedUiObject ?? null,
    clarificationState: "none",
    confidence:
      explicitTopic !== "unknown" ? 0.96 : simplification && priorTopic ? 0.86 : 0.35,
  };
}

export function buildWorkflowContextView(input: {
  entities: ConversationEntityMemory;
  lifecycleStage: PipelineLifecycleStage | null;
  pendingApprovals: ProposedAction[];
}): WorkflowContextView {
  const approvals = input.pendingApprovals.filter(
    (approval, index, all) =>
      all.findIndex((candidate) => candidate.actionId === approval.actionId) ===
      index,
  );
  return {
    activeSearchJobId: input.entities.jobId,
    activeBacktestRunId: input.entities.runId,
    activePaperSessionId: input.entities.paperSessionId,
    pendingApprovals: approvals,
    lifecycleStage: input.lifecycleStage,
    executionState: null,
    monitoringState:
      input.lifecycleStage === "search_running" ||
      input.lifecycleStage === "paper_active"
        ? "active"
        : null,
  };
}

