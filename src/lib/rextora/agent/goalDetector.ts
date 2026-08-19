/**
 * Semantic goal detection for the AI Trading Employee.
 * Scores natural-language goals; almost never returns unknown.
 * Deterministic — no LLM, no I/O. Regex rules remain a high-confidence shortcut.
 */

import type { AgentIntent, AgentIntentType } from "./types";
import { parseIntent } from "./intentParser";
import type { ConversationEntityMemory } from "./conversationContext";
import { detectFollowUpKind } from "./conversationContext";
import type { PipelineLifecycleStage } from "./lifecycleStage";
import { classifyExecutionRequest } from "./executionRequestClassifier";

export type AgentGoal =
  | "recommend_next"
  | "prepare_search"
  | "prepare_backtest"
  | "prepare_paper"
  | "explain_why"
  | "explain_approval"
  | "explain_waiting"
  | "explain_rejection"
  | "continue_session"
  | "approve"
  | "cancel"
  | "risk_review"
  | "research_status"
  | "search_status"
  | "backtest_summary"
  | "compare"
  | "explain_strategy"
  | "paper_start"
  | "first_run"
  | "demo"
  | "blocked_execute"
  | "blocked_safe"
  | "blocked_live"
  | "lifecycle_fallback";

export interface GoalDetectionResult {
  goal: AgentGoal;
  intent: AgentIntent;
  confidence: number;
  /** How the goal was chosen. */
  method: "follow_up" | "regex" | "semantic" | "lifecycle_fallback";
  scores: Partial<Record<AgentGoal, number>>;
}

const GOAL_TO_INTENT: Record<AgentGoal, AgentIntentType> = {
  recommend_next: "recommend_next",
  prepare_search: "prepare_search_plan",
  prepare_backtest: "prepare_backtest_plan",
  prepare_paper: "prepare_paper_plan",
  explain_why: "follow_up_why",
  explain_approval: "explain_approval",
  explain_waiting: "explain_waiting",
  explain_rejection: "explain_rejection",
  continue_session: "continue_session",
  approve: "approve_pending",
  cancel: "cancel_pending",
  risk_review: "risk_summary",
  research_status: "research_workspace",
  search_status: "search_status",
  backtest_summary: "backtest_summary",
  compare: "compare_strategies",
  explain_strategy: "explain_strategy",
  paper_start: "paper_start_request",
  first_run: "first_run_help",
  demo: "demo_overview",
  blocked_execute: "execute_trade",
  blocked_safe: "modify_safe",
  blocked_live: "start_live",
  lifecycle_fallback: "recommend_next",
};

/** Token bags for semantic scoring (normalized lowercase). */
const GOAL_BAGS: Record<Exclude<AgentGoal, "lifecycle_fallback">, string[]> = {
  recommend_next: [
    "오늘", "지금", "해야", "할까", "무엇", "뭐", "다음", "단계", "추천",
    "할일", "할 일", "시작", "우선", "먼저", "뭐해", "어떻게", "진행",
    "today", "should", "next", "recommend", "what",
  ],
  prepare_search: [
    "탐색", "찾아", "찾아줘", "연구", "서치", "search", "전략 찾", "좋은 전략",
    "새 전략", "후보", "발굴", "스캔", "계획", "준비",
  ],
  prepare_backtest: [
    "백테스트", "backtest", "백테", "검증해", "시뮬", "시뮬레이션",
    "과거", "테스트해", "돌려볼", "해볼까",
  ],
  prepare_paper: [
    "모의", "페이퍼", "paper", "페이퍼로", "모의매매", "모의 매매",
  ],
  explain_why: [
    "왜", "이유", "근거", "설명", "어째서", "왜요", "왜지", "왜그래",
    "왜 추천", "왜 좋", "why", "reason",
  ],
  explain_approval: [
    "승인하면", "승인하면", "승인 하면", "승인시", "승인 시", "승인할 때",
    "어떤 일", "무슨 일", "일어나", "어떻게 되", "consequence", "approve하면",
    "진행하면", "열면",
  ],
  explain_waiting: [
    "왜 기다", "왜 대기", "기다리는", "대기 중", "왜 안 진행", "왜 안 시작",
    "waiting", "why wait",
  ],
  explain_rejection: [
    "왜 거부", "왜 탈락", "왜 차단", "거부 이유", "탈락 사유", "rejected",
    "why reject", "왜 막",
  ],
  continue_session: [
    "이어서", "이어 하자", "계속", "멈춘", "아까", "남겨둔", "이어서 진행",
    "continue", "pick up", "where we left",
  ],
  approve: ["진행해", "승인", "그렇게 해", "가자", "ok", "yes", "해줘", "실행해"],
  cancel: ["취소", "그만", "안 할래", "cancel", "버려", "철회"],
  risk_review: [
    "위험", "리스크", "risk", "mdd", "낙폭", "손실", "위험한", "위험 부분",
    "가장 위험", "취약",
  ],
  research_status: [
    "연구 현황", "연구현황", "워크스페이스", "현황", "어디에", "연구 상태",
    "research", "workspace",
  ],
  search_status: [
    "탐색 상태", "탐색상태", "진행 중", "어디까지", "search status", "진행상황",
  ],
  backtest_summary: [
    "백테스트 결과", "결과 요약", "요약해", "성과", "수익률", "승률",
  ],
  compare: ["비교", "vs", "versus", "차이", "어떤 게", "중에", "더 좋"],
  explain_strategy: [
    "전략 설명", "설명해", "뭐야", "뭔지", "어떻게 동작", "safe 전략",
  ],
  paper_start: [
    "paper로", "페이퍼로", "모의로", "모의매매 돌려", "paper 돌려",
  ],
  first_run: ["처음", "온보딩", "결과 왜 없", "시작 어떻게"],
  demo: ["데모", "demo", "예시"],
  blocked_execute: ["매수", "매도", "사줘", "팔아줘", "주문"],
  blocked_safe: ["safe 수정", "세이프 수정", "safe 변경"],
  blocked_live: ["실전 시작", "live 시작", "실전매매 시작"],
};

function normalize(query: string): string {
  return query
    .trim()
    .toLowerCase()
    .replace(/[?.!~…]+/g, " ")
    .replace(/\s+/g, " ");
}

function extractSymbol(query: string): string | null {
  const m = query.match(/\b(BTC|ETH|SOL|BNB|XRP|ADA|DOGE|AVAX|MATIC|DOT)[A-Z]*/i);
  return m ? m[1]!.toUpperCase() : null;
}

function scoreBags(normalized: string): Partial<Record<AgentGoal, number>> {
  const scores: Partial<Record<AgentGoal, number>> = {};
  for (const [goal, bag] of Object.entries(GOAL_BAGS) as Array<
    [Exclude<AgentGoal, "lifecycle_fallback">, string[]]
  >) {
    let score = 0;
    for (const token of bag) {
      if (normalized.includes(token.toLowerCase())) {
        score += token.length >= 4 ? 2 : 1;
      }
    }
    if (score > 0) scores[goal] = score;
  }
  return scores;
}

/** Boost/penalize based on conversation memory and pending plan. */
function applyContextBoosts(
  scores: Partial<Record<AgentGoal, number>>,
  entities?: ConversationEntityMemory | null,
): void {
  if (entities?.pendingProposedAction || entities?.pendingPlan) {
    scores.explain_approval = (scores.explain_approval ?? 0) + 1;
    scores.explain_waiting = (scores.explain_waiting ?? 0) + 1.5;
    scores.continue_session = (scores.continue_session ?? 0) + 1;
    scores.approve = (scores.approve ?? 0) + 0.5;
    scores.explain_why = (scores.explain_why ?? 0) + 0.5;
  }
  if (entities?.previousConclusion || entities?.pinnedObjectiveKo) {
    scores.explain_why = (scores.explain_why ?? 0) + 1;
    scores.continue_session = (scores.continue_session ?? 0) + 0.5;
  }
}

function pickBest(
  scores: Partial<Record<AgentGoal, number>>,
): { goal: AgentGoal; score: number } | null {
  let best: AgentGoal | null = null;
  let bestScore = 0;
  for (const [goal, score] of Object.entries(scores) as Array<[AgentGoal, number]>) {
    if (score > bestScore) {
      best = goal;
      bestScore = score;
    }
  }
  if (!best || bestScore < 1) return null;
  return { goal: best, score: bestScore };
}

function lifecycleFallbackIntent(
  stage: PipelineLifecycleStage | null | undefined,
  query: string,
): AgentIntent {
  const symbol = extractSymbol(query);
  const params: Record<string, string> = {};
  if (symbol) params.symbol = symbol;

  const execClass = classifyExecutionRequest(query);
  if (execClass.kind === "blocked") {
    return {
      type: execClass.intentType,
      params,
      confidence: 0.98,
      rawQuery: query,
    };
  }

  // Prefer actionable plan draft when user asked to "find/try" something
  const n = normalize(query);
  if (/찾아|탐색|연구|search/.test(n) || (/전략/.test(n) && !/실전|live|라이브/.test(n))) {
    return {
      type: "prepare_search_plan",
      params,
      confidence: 0.55,
      rawQuery: query,
    };
  }
  if (/백테스트|backtest|검증/.test(n)) {
    return {
      type: "prepare_backtest_plan",
      params,
      confidence: 0.55,
      rawQuery: query,
    };
  }
  if (/모의|paper|페이퍼/.test(n)) {
    return {
      type: "paper_start_request",
      params,
      confidence: 0.55,
      rawQuery: query,
    };
  }

  // Stage-aware default
  switch (stage) {
    case "empty":
    case "demo":
    case "search_needed":
    case "search_failed":
      return {
        type: "recommend_next",
        params,
        confidence: 0.5,
        rawQuery: query,
      };
    case "results_review":
      return {
        type: "recommend_next",
        params,
        confidence: 0.5,
        rawQuery: query,
      };
    case "backtest_needed":
    case "backtest_review":
      return {
        type: "prepare_backtest_plan",
        params,
        confidence: 0.5,
        rawQuery: query,
      };
    case "paper_ready":
    case "paper_active":
      return {
        type: "paper_start_request",
        params,
        confidence: 0.5,
        rawQuery: query,
      };
    case "live_review":
      return {
        type: "recommend_next",
        params,
        confidence: 0.5,
        rawQuery: query,
      };
    default:
      return {
        type: "recommend_next",
        params,
        confidence: 0.45,
        rawQuery: query,
      };
  }
}

/**
 * Detect operator goal from natural language + session memory.
 * Unknown is avoided — falls back to lifecycle-aware recommend/plan.
 */
export function detectGoal(input: {
  query: string;
  entities?: ConversationEntityMemory | null;
  lifecycleStage?: PipelineLifecycleStage | null;
}): GoalDetectionResult {
  const query = input.query.trim();
  const entities = input.entities;
  const scores = scoreBags(normalize(query));
  applyContextBoosts(scores, entities);

  // 1) Explicit follow-ups (session-aware)
  const follow = detectFollowUpKind(query);
  if (follow === "cancel") {
    return {
      goal: "cancel",
      intent: {
        type: "cancel_pending",
        params: {},
        confidence: 0.95,
        rawQuery: query,
      },
      confidence: 0.95,
      method: "follow_up",
      scores,
    };
  }
  if (follow === "approve") {
    return {
      goal: "approve",
      intent: {
        type: "approve_pending",
        params: {},
        confidence: 0.9,
        rawQuery: query,
      },
      confidence: 0.9,
      method: "follow_up",
      scores,
    };
  }
  if (follow === "why" && entities?.previousConclusion) {
    return {
      goal: "explain_why",
      intent: {
        type: "follow_up_why",
        params: {},
        confidence: 0.9,
        rawQuery: query,
      },
      confidence: 0.9,
      method: "follow_up",
      scores,
    };
  }

  // Safety-first: Live / real-order execution before plans or recommendations.
  const execClass = classifyExecutionRequest(query);
  if (execClass.kind === "blocked") {
    const goal =
      execClass.intentType === "start_live" ? "blocked_live" : "blocked_execute";
    return {
      goal,
      intent: {
        type: execClass.intentType,
        params: {},
        confidence: 0.98,
        rawQuery: query,
      },
      confidence: 0.98,
      method: "regex",
      scores,
    };
  }
  if (execClass.kind === "explanatory") {
    const goal =
      execClass.intentType === "explain_approval"
        ? "explain_approval"
        : execClass.intentType === "explain_rejection"
          ? "explain_rejection"
          : execClass.intentType === "risk_summary"
            ? "risk_review"
            : "recommend_next";
    return {
      goal,
      intent: {
        type: execClass.intentType,
        params: {},
        confidence: 0.9,
        rawQuery: query,
      },
      confidence: 0.9,
      method: "semantic",
      scores,
    };
  }

  const n = normalize(query);

  // Research evidence questions must win before broad "find" / "backtest"
  // semantic shortcuts so their persisted-evidence contract is preserved.
  const earlyResearchIntent = parseIntent(query);
  if (earlyResearchIntent.type === "research_analysis" || earlyResearchIntent.type === "memory_recall") {
    return {
      goal: "recommend_next",
      intent: earlyResearchIntent,
      confidence: earlyResearchIntent.confidence,
      method: "regex",
      scores,
    };
  }

  // Continue where we left off
  if (
    /이어서|이어\s*하자|계속\s*(하자|해|진행)|멈춘\s*(데|곳|지점)|아까\s*(그거|거)|남겨둔|continue\s*where|pick\s*up/.test(
      n,
    ) ||
    (scores.continue_session ?? 0) >= 2
  ) {
    return {
      goal: "continue_session",
      intent: {
        type: "continue_session",
        params: {},
        confidence: 0.9,
        rawQuery: query,
      },
      confidence: 0.9,
      method: "semantic",
      scores,
    };
  }

  // Why waiting
  if (
    /왜\s*(기다|대기)|왜\s*안\s*(진행|시작)|waiting|why\s*wait/.test(n) ||
    (scores.explain_waiting ?? 0) >= 2
  ) {
    return {
      goal: "explain_waiting",
      intent: {
        type: "explain_waiting",
        params: {},
        confidence: 0.88,
        rawQuery: query,
      },
      confidence: 0.88,
      method: "semantic",
      scores,
    };
  }

  // Approval consequence — before generic why/recommend
  if (
    /승인\s*하면|승인하면|승인시|승인\s*시|어떤\s*일|무슨\s*일|일어나|consequence|진행하면\s*어떻게|열면\s*어떻게/.test(
      n,
    ) ||
    (scores.explain_approval ?? 0) >= 2
  ) {
    return {
      goal: "explain_approval",
      intent: {
        type: "explain_approval",
        params: {},
        confidence: 0.88,
        rawQuery: query,
      },
      confidence: 0.88,
      method: "semantic",
      scores,
    };
  }

  // Paraphrased why about recommendation / strategy quality
  if (
    /왜\s*(이\s*)?(전략|추천|그거|저것|설정)|왜\s*좋|좋은\s*거(야|죠|니)|어째서/.test(
      n,
    ) &&
    (entities?.previousConclusion || entities?.pendingProposedAction)
  ) {
    return {
      goal: "explain_why",
      intent: {
        type: "follow_up_why",
        params: {},
        confidence: 0.85,
        rawQuery: query,
      },
      confidence: 0.85,
      method: "semantic",
      scores,
    };
  }

  // Natural "what should I do" variants (including 하지/할까요)
  if (
    /(오늘|지금).*(무엇|뭐|뭘).*(해야|하면|할까|하지)|무엇을\s*해야|뭘\s*해야|다음\s*단계|무엇을\s*하면/.test(
      n,
    )
  ) {
    return {
      goal: "recommend_next",
      intent: {
        type: "recommend_next",
        params: {},
        confidence: 0.9,
        rawQuery: query,
      },
      confidence: 0.9,
      method: "semantic",
      scores,
    };
  }

  // Find good strategy → search plan
  if (/좋은\s*전략|전략을?\s*찾|찾아\s*줘|찾아줘|전략\s*발굴|후보\s*찾/.test(n)) {
    const symbol = extractSymbol(query);
    return {
      goal: "prepare_search",
      intent: {
        type: "prepare_search_plan",
        params: symbol ? { symbol } : {},
        confidence: 0.88,
        rawQuery: query,
      },
      confidence: 0.88,
      method: "semantic",
      scores,
    };
  }

  // Backtest try variants
  if (/백테스트\s*(해|해볼|돌|검증)|backtest\s*(할까|해|run)/.test(n)) {
    const symbol = extractSymbol(query);
    return {
      goal: "prepare_backtest",
      intent: {
        type: "prepare_backtest_plan",
        params: symbol ? { symbol } : {},
        confidence: 0.88,
        rawQuery: query,
      },
      confidence: 0.88,
      method: "semantic",
      scores,
    };
  }

  // 2) High-confidence regex parser
  const regexIntent = parseIntent(query);
  if (regexIntent.type !== "unknown" && regexIntent.confidence >= 0.6) {
    const goal =
      (Object.entries(GOAL_TO_INTENT).find(
        ([, intentType]) => intentType === regexIntent.type,
      )?.[0] as AgentGoal | undefined) ?? "recommend_next";
    return {
      goal,
      intent: regexIntent,
      confidence: regexIntent.confidence,
      method: "regex",
      scores,
    };
  }

  // 3) Semantic bag winner
  const best = pickBest(scores);
  if (best && best.score >= 2) {
    // Prefer explain_why over recommend when both score and we have prior context
    let goal = best.goal;
    if (
      (scores.explain_why ?? 0) >= (scores.recommend_next ?? 0) &&
      entities?.previousConclusion &&
      /왜|이유|근거/.test(n)
    ) {
      goal = "explain_why";
    }
    // Disambiguate paper vs prepare_paper
    if (goal === "prepare_paper" && /돌려|시작|실행|해보/.test(n)) {
      goal = "paper_start";
    }
    if (goal === "prepare_backtest" && /결과|요약|어때/.test(n)) {
      goal = "backtest_summary";
    }

    const intentType = GOAL_TO_INTENT[goal];
    const symbol = extractSymbol(query);
    const params: Record<string, string> = {};
    if (symbol) params.symbol = symbol;
    const confidence = Math.min(0.92, 0.5 + best.score * 0.08);
    return {
      goal,
      intent: {
        type: intentType,
        params,
        confidence,
        rawQuery: query,
      },
      confidence,
      method: "semantic",
      scores,
    };
  }

  // 4) Lifecycle-aware fallback — never leave the user stranded
  const fallback = lifecycleFallbackIntent(input.lifecycleStage, query);
  return {
    goal: "lifecycle_fallback",
    intent: fallback,
    confidence: fallback.confidence,
    method: "lifecycle_fallback",
    scores,
  };
}
