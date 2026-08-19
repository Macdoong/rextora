/**
 * Structured planning objects for the AI Trading Employee.
 * Plans are drafts only — never execute Search / Backtest / Paper / Live.
 */

import type { FactItem } from "./types";
import {
  createProposedAction,
  type ProposedAction,
  type ProposedActionType,
} from "./proposedAction";
import {
  buildSearchPlanDraft,
  searchPlanDraftToFacts,
  type SearchPlanDraft,
} from "./searchPlanDraft";
import type { PipelineLifecycleStage } from "./lifecycleStage";
import {
  LIFECYCLE_LABEL_KO,
  LIFECYCLE_NEXT_MILESTONE_KO,
} from "./lifecycleStage";
import { createTypedCommand, type TypedCommand } from "./typedCommand";

export type AgentPlanKind =
  | "search_plan"
  | "backtest_plan"
  | "paper_plan"
  | "risk_review"
  | "research_summary"
  | "approval_draft";

export interface PlanField {
  key: string;
  labelKo: string;
  value: string;
}

export interface AgentPlanDraft {
  kind: AgentPlanKind;
  titleKo: string;
  summaryKo: string;
  fields: PlanField[];
  estimatedScopeKo: string;
  /** Explicit: no engine has been started. */
  executionStarted: false;
  requiresApproval: boolean;
  validationOk: boolean;
  validationIssues: string[];
  proposedAction: ProposedAction;
  /** Secondary deep-link for "Open expert screen" without implying start. */
  reviewRoute: string;
  openRoute: string;
  /** Optional typed command executed only after explicit approval. */
  typedCommand?: TypedCommand | null;
}

function fact(
  labelKo: string,
  value: string,
  source: FactItem["source"] = "system_status",
): FactItem {
  return {
    labelKo,
    value,
    source,
    fetchedAt: new Date().toISOString(),
  };
}

function normalizeSymbol(raw?: string | null): string {
  if (!raw) return "BTCUSDT";
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.endsWith("USDT")) return s;
  if (["BTC", "ETH", "SOL", "BNB", "XRP"].includes(s)) return `${s}USDT`;
  return "BTCUSDT";
}

function normalizeTimeframe(raw?: string | null): string {
  const allowed = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);
  if (raw && allowed.has(raw)) return raw;
  return "15m";
}

function makeAction(
  actionType: ProposedActionType,
  summary: string,
  reason: string,
  targetRoute: string,
  scope: {
    strategyId?: string | null;
    jobId?: string | null;
    runId?: string | null;
    symbol?: string | null;
    timeframe?: string | null;
  },
  parameters: Record<string, unknown>,
  risk: ProposedAction["riskLevel"] = "low",
): ProposedAction {
  return createProposedAction({
    actionType,
    summary,
    reason,
    targetRoute,
    strategyId: scope.strategyId ?? null,
    jobId: scope.jobId ?? null,
    runId: scope.runId ?? null,
    symbol: scope.symbol ?? null,
    timeframe: scope.timeframe ?? null,
    parameters: { draft: true, executionStarted: false, ...parameters },
    requiresApproval: true,
    riskLevel: risk,
    blockedReason: null,
  });
}

/** Wrap existing SearchPlanDraft into unified AgentPlanDraft. */
export function searchPlanToAgentPlan(draft: SearchPlanDraft): AgentPlanDraft {
  const typedCommand = draft.validationOk
    ? createTypedCommand({
        commandType: "create_strategy_search_job",
        parameters: { createBody: draft.createBody },
        symbol: draft.symbol,
        timeframe: draft.timeframe,
        factsSnapshot: [
          { labelKo: "심볼", value: draft.symbol },
          { labelKo: "타임프레임", value: draft.timeframe },
          {
            labelKo: "패턴",
            value: draft.patternLabelsKo.join(" + "),
          },
        ],
      })
    : null;
  return {
    kind: "search_plan",
    titleKo: "탐색 계획",
    summaryKo: `${draft.symbol} · ${draft.timeframe} 탐색 초안`,
    fields: [
      { key: "symbol", labelKo: "심볼", value: draft.symbol },
      { key: "timeframe", labelKo: "타임프레임", value: draft.timeframe },
      {
        key: "patterns",
        labelKo: "패턴",
        value: draft.patternLabelsKo.join(" + ") || "Order Block + FVG",
      },
      {
        key: "scope",
        labelKo: "예상 탐색 범위",
        value: draft.estimatedScopeKo,
      },
      {
        key: "started",
        labelKo: "실행 여부",
        value: "시작되지 않음",
      },
      {
        key: "command",
        labelKo: "승인 후 동작",
        value: typedCommand
          ? "기존 탐색 API로 작업 생성·시작"
          : "검증 실패 — 실행 불가",
      },
    ],
    estimatedScopeKo: draft.estimatedScopeKo,
    executionStarted: false,
    requiresApproval: true,
    validationOk: draft.validationOk,
    validationIssues: draft.validationIssues,
    proposedAction: draft.proposedAction,
    reviewRoute: draft.proposedAction.targetRoute,
    openRoute: "/strategy-search",
    typedCommand,
  };
}

export function buildBacktestPlanDraft(input: {
  strategyId?: string | null;
  strategyLabel?: string | null;
  symbol?: string | null;
  timeframe?: string | null;
  runId?: string | null;
}): AgentPlanDraft {
  const symbol = normalizeSymbol(input.symbol ?? "BTCUSDT");
  const timeframe = normalizeTimeframe(input.timeframe);
  const strategyLabel = input.strategyLabel?.trim() || "선택 전략";
  const strategyId = input.strategyId?.trim() || null;
  const href = strategyId
    ? `/backtest?strategyId=${encodeURIComponent(strategyId)}&symbol=${encodeURIComponent(symbol)}`
    : `/backtest?symbol=${encodeURIComponent(symbol)}`;

  const proposedAction = makeAction(
    "open_backtest",
    "백테스트 계획 검토",
    "승인하면 기존 백테스트 API로 실행·저장합니다. 자동 실행되지 않습니다.",
    href,
    { strategyId, symbol, timeframe, runId: input.runId },
    { planKind: "backtest_plan", strategyLabel },
  );

  const typedCommand = strategyId
    ? createTypedCommand({
        commandType: "run_backtest",
        strategyId,
        symbol,
        timeframe,
        parameters: {
          strategyId,
          symbols: [symbol],
          timeframe,
          save: true,
        },
        factsSnapshot: [
          { labelKo: "전략", value: strategyLabel },
          { labelKo: "심볼", value: symbol },
          { labelKo: "타임프레임", value: timeframe },
        ],
      })
    : null;

  return {
    kind: "backtest_plan",
    titleKo: "백테스트 계획",
    summaryKo: `${strategyLabel} · ${symbol} ${timeframe}`,
    fields: [
      { key: "strategy", labelKo: "전략", value: strategyLabel },
      { key: "symbol", labelKo: "심볼", value: symbol },
      { key: "timeframe", labelKo: "타임프레임", value: timeframe },
      {
        key: "started",
        labelKo: "실행 여부",
        value: "시작되지 않음",
      },
      {
        key: "command",
        labelKo: "승인 후 동작",
        value: typedCommand
          ? "기존 백테스트 API 실행·저장"
          : "전략 선택 필요",
      },
    ],
    estimatedScopeKo: `${symbol} · ${timeframe} · 사용자 승인 후 실행`,
    executionStarted: false,
    requiresApproval: true,
    validationOk: Boolean(strategyId),
    validationIssues: strategyId ? [] : ["strategyId가 필요합니다"],
    proposedAction,
    reviewRoute: href,
    openRoute: "/backtest",
    typedCommand,
  };
}

export function buildPaperPlanDraft(input: {
  strategyId?: string | null;
  strategyLabel?: string | null;
  symbol?: string | null;
}): AgentPlanDraft {
  const strategyLabel = input.strategyLabel?.trim() || "Paper 후보 전략";
  const strategyId = input.strategyId?.trim() || null;
  const symbol = input.symbol ? normalizeSymbol(input.symbol) : null;
  const href = strategyId
    ? `/paper-trading?strategyId=${encodeURIComponent(strategyId)}`
    : "/paper-trading";

  const proposedAction = makeAction(
    "open_paper_approval",
    "모의매매 계획 검토",
    "승인하면 pending_approval Paper 세션만 준비합니다. 실행기는 시작하지 않습니다.",
    href,
    { strategyId, symbol },
    { planKind: "paper_plan", strategyLabel },
    "medium",
  );

  const typedCommand = strategyId
    ? createTypedCommand({
        commandType: "prepare_paper_session",
        strategyId,
        symbol,
        parameters: {
          strategyId,
          symbol,
        },
        factsSnapshot: [
          { labelKo: "전략", value: strategyLabel },
          { labelKo: "심볼", value: symbol ?? "전략 기본값" },
        ],
      })
    : null;

  return {
    kind: "paper_plan",
    titleKo: "모의매매 계획",
    summaryKo: `${strategyLabel} 모의매매 승인 초안`,
    fields: [
      { key: "strategy", labelKo: "전략", value: strategyLabel },
      {
        key: "symbol",
        labelKo: "심볼",
        value: symbol ?? "전략 기본값",
      },
      {
        key: "command",
        labelKo: "승인 후 동작",
        value: typedCommand
          ? "Paper pending_approval 세션 준비"
          : "전략 선택 필요",
      },
      {
        key: "started",
        labelKo: "실행 여부",
        value: "시작되지 않음",
      },
      {
        key: "live",
        labelKo: "실전 주문",
        value: "차단",
      },
    ],
    estimatedScopeKo: "승인 게이트 통과 후에만 세션 시작 가능",
    executionStarted: false,
    requiresApproval: true,
    validationOk: Boolean(strategyId),
    validationIssues: strategyId ? [] : ["strategyId가 필요합니다"],
    proposedAction,
    reviewRoute: href,
    openRoute: "/paper-trading",
    typedCommand,
  };
}

export function buildRiskReviewDraft(input: {
  mdd?: string | null;
  totalReturn?: string | null;
  symbol?: string | null;
  strategyLabel?: string | null;
}): AgentPlanDraft {
  const symbol = input.symbol ? normalizeSymbol(input.symbol) : "—";
  const mdd = input.mdd?.trim() || "검증 데이터 없음";
  const totalReturn = input.totalReturn?.trim() || "검증 데이터 없음";
  const strategyLabel = input.strategyLabel?.trim() || "대상 전략";
  const href = "/backtest";

  const proposedAction = makeAction(
    "open_backtest",
    "리스크 검토 열기",
    "저장된 백테스트 증거로 리스크를 검토합니다. 실행은 하지 않습니다.",
    href,
    { symbol: input.symbol },
    { planKind: "risk_review" },
  );

  return {
    kind: "risk_review",
    titleKo: "리스크 리뷰",
    summaryKo: `${strategyLabel} 리스크 요약`,
    fields: [
      { key: "strategy", labelKo: "전략", value: strategyLabel },
      { key: "symbol", labelKo: "심볼", value: symbol },
      { key: "return", labelKo: "총 수익률", value: totalReturn },
      { key: "mdd", labelKo: "최대 낙폭(MDD)", value: mdd },
      {
        key: "note",
        labelKo: "안내",
        value:
          totalReturn === "검증 데이터 없음"
            ? "검증된 증거가 없습니다."
            : "저장된 백테스트 수치만 사용합니다.",
      },
    ],
    estimatedScopeKo: "읽기 전용 리스크 검토",
    executionStarted: false,
    requiresApproval: false,
    validationOk: true,
    validationIssues: [],
    proposedAction,
    reviewRoute: href,
    openRoute: "/backtest",
  };
}

export function buildResearchSummaryDraft(input: {
  stage: PipelineLifecycleStage;
  jobsTotal?: string | null;
  jobsCompleted?: string | null;
  jobsRunning?: string | null;
  topStrategy?: string | null;
  riskNote?: string | null;
  openApprovals?: string | null;
  blockedActions?: string | null;
}): AgentPlanDraft {
  const stageLabel = LIFECYCLE_LABEL_KO[input.stage];
  const milestone = LIFECYCLE_NEXT_MILESTONE_KO[input.stage];
  const top = input.topStrategy?.trim() || "검증된 주목 전략 없음";
  const href =
    input.stage === "results_review" || input.stage === "search_running"
      ? "/results"
      : input.stage === "paper_ready" || input.stage === "paper_active"
        ? "/paper-trading"
        : input.stage === "backtest_review" || input.stage === "backtest_needed"
          ? "/backtest"
          : "/strategy-search";

  const proposedAction = makeAction(
    href.includes("/results")
      ? "open_results"
      : href.includes("/paper")
        ? "open_paper_approval"
        : href.includes("/backtest")
          ? "open_backtest"
          : "open_search",
    "연구 요약 다음 단계",
    milestone,
    href,
    {},
    { planKind: "research_summary", stage: input.stage },
  );

  return {
    kind: "research_summary",
    titleKo: "연구 요약",
    summaryKo: `현재 단계: ${stageLabel}`,
    fields: [
      { key: "stage", labelKo: "라이프사이클", value: stageLabel },
      {
        key: "jobs",
        labelKo: "탐색 작업",
        value: `전체 ${input.jobsTotal ?? "—"} · 완료 ${input.jobsCompleted ?? "—"} · 실행 중 ${input.jobsRunning ?? "—"}`,
      },
      { key: "top", labelKo: "상위 전략", value: top },
      {
        key: "risk",
        labelKo: "리스크",
        value: input.riskNote?.trim() || "검증된 리스크 요약 없음",
      },
      {
        key: "approvals",
        labelKo: "열린 승인",
        value: input.openApprovals?.trim() || "없음",
      },
      {
        key: "blocked",
        labelKo: "차단된 작업",
        value:
          input.blockedActions?.trim() ||
          "실전 주문 · SAFE 수정 · 자동 실행",
      },
      { key: "milestone", labelKo: "다음 마일스톤", value: milestone },
    ],
    estimatedScopeKo: milestone,
    executionStarted: false,
    requiresApproval: true,
    validationOk: true,
    validationIssues: [],
    proposedAction,
    reviewRoute: href,
    openRoute: href,
  };
}

export function buildApprovalDraft(plan: AgentPlanDraft): AgentPlanDraft {
  return {
    kind: "approval_draft",
    titleKo: "승인 초안",
    summaryKo: `${plan.titleKo} 승인 대기`,
    fields: [
      { key: "plan", labelKo: "대상 계획", value: plan.titleKo },
      ...plan.fields.slice(0, 5),
      {
        key: "started",
        labelKo: "실행 여부",
        value: "시작되지 않음",
      },
      {
        key: "approve",
        labelKo: "승인 안내",
        value: plan.typedCommand
          ? "승인 시 기존 API로 정확히 한 번 실행 (Live/실주문 없음)"
          : "전문가 화면에서 확인 후 진행",
      },
    ],
    estimatedScopeKo: plan.estimatedScopeKo,
    executionStarted: false,
    requiresApproval: true,
    validationOk: plan.validationOk,
    validationIssues: plan.validationIssues,
    proposedAction: plan.proposedAction,
    reviewRoute: plan.reviewRoute,
    openRoute: plan.openRoute,
    typedCommand: plan.typedCommand ?? null,
  };
}

export function planDraftToFacts(plan: AgentPlanDraft): FactItem[] {
  const facts: FactItem[] = [
    fact("계획 종류", plan.titleKo),
    fact("계획 요약", plan.summaryKo),
    fact("계획 범위", plan.estimatedScopeKo),
    fact("실행 여부", "시작되지 않음"),
    fact(
      "계획 검증",
      plan.validationOk ? "통과" : `실패: ${plan.validationIssues[0] ?? "오류"}`,
    ),
    fact("권장 다음 작업", plan.proposedAction.summary),
    fact("권장 이동 경로", plan.reviewRoute),
    fact(
      "권장 작업 키",
      plan.kind === "search_plan"
        ? "open_search"
        : plan.kind === "backtest_plan" || plan.kind === "risk_review"
          ? "open_backtest"
          : plan.kind === "paper_plan"
            ? "open_paper"
            : "navigate",
    ),
    fact(
      "권장 사유",
      "에이전트는 엔진을 자동 실행하지 않습니다. 계획 검토 후 기존 화면에서 승인하세요.",
    ),
  ];
  for (const field of plan.fields) {
    facts.push(fact(`계획:${field.labelKo}`, field.value));
  }
  return facts;
}

/** Convenience: build search plan + unified wrapper. */
export function buildUnifiedSearchPlan(input: {
  requestedSymbol?: string | null;
  requestedTimeframe?: string | null;
  missingSymbolHint?: string | null;
}): { search: SearchPlanDraft; plan: AgentPlanDraft; facts: FactItem[] } {
  const search = buildSearchPlanDraft(input);
  const plan = searchPlanToAgentPlan(search);
  const approval = buildApprovalDraft(plan);
  return {
    search,
    plan: approval,
    facts: [...searchPlanDraftToFacts(search), ...planDraftToFacts(approval)],
  };
}
