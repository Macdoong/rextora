/**
 * Conversational search-plan draft builder.
 * Creates a validated typed draft only — never starts a search job.
 */

import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
  SEARCHABLE_PATTERN_SPACE_OPTIONS,
  type StrategySearchOperatorFormState,
} from "@/components/rextora/strategySearch/formDefaults";
import { validateCreateSearchJobBody } from "../strategySearch/jobApiValidation";
import type { FactItem } from "./types";
import { createProposedAction, type ProposedAction } from "./proposedAction";

export interface SearchPlanDraft {
  symbol: string;
  timeframe: string;
  patternSpaceIds: string[];
  patternLabelsKo: string[];
  patternConfigLevel: "automatic" | "basic" | "expert";
  leverageMode: "automatic" | "fixed" | "range" | "disabled";
  depthProfile: string;
  estimatedScopeKo: string;
  whySettings: Array<{ key: string; value: string; reasonKo: string; source: "automatic" | "evidence" | "schema" }>;
  validationOk: boolean;
  validationIssues: string[];
  formState: StrategySearchOperatorFormState;
  createBody: unknown;
  proposedAction: ProposedAction;
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

/**
 * Build a draft search plan from conversation evidence.
 * Prefers filling missing-symbol gaps (e.g. ETH) when compare evidence is incomplete.
 */
export function buildSearchPlanDraft(input: {
  requestedSymbol?: string | null;
  requestedTimeframe?: string | null;
  missingSymbolHint?: string | null;
  preferPatterns?: boolean;
  depthProfile?: "fast" | "standard" | "deep";
  patternSpaceIds?: string[];
}): SearchPlanDraft {
  const missing = input.missingSymbolHint
    ? normalizeSymbol(input.missingSymbolHint)
    : null;
  const symbol = normalizeSymbol(input.requestedSymbol ?? missing ?? "ETHUSDT");
  const timeframe = normalizeTimeframe(input.requestedTimeframe ?? "15m");

  const patternSpaceIds = input.patternSpaceIds ?? ["order_block", "fvg"];
  const patternLabelsKo = SEARCHABLE_PATTERN_SPACE_OPTIONS.filter((o) =>
    patternSpaceIds.includes(o.id),
  ).map((o) => o.labelKo);

  const form = createDefaultOperatorFormState();
  form.symbol = symbol;
  form.timeframe = timeframe;
  form.depthProfile = input.depthProfile ?? form.depthProfile;
  form.autoStrategyCombo = false;
  form.selectedSpaceIds = patternSpaceIds;
  form.patternConfigLevel = "basic";
  form.leverageMode = "automatic";
  form.marketMode = "manual";
  form.searchName = `agent_draft_${symbol}_${timeframe}`;

  const createBody = operatorFormToCreateBody(form);
  let validationOk = true;
  let validationIssues: string[] = [];
  try {
    validateCreateSearchJobBody(createBody);
  } catch (err) {
    validationOk = false;
    validationIssues = [
      err instanceof Error ? err.message : "계획 검증 실패",
    ];
  }

  const whySettings: SearchPlanDraft["whySettings"] = [
    {
      key: "symbol",
      value: symbol,
      reasonKo: missing
        ? `${missing} 검증 데이터가 부족해 비교·연구 공백을 메우기 위해 선택했습니다.`
        : "요청/컨텍스트 심볼이며 지원되는 USDT 선물 심볼입니다.",
      source: missing ? "evidence" : "schema",
    },
    {
      key: "timeframe",
      value: timeframe,
      reasonKo: "기본 연구 타임프레임(15m)이며 지원 스키마에 포함됩니다.",
      source: "automatic",
    },
    {
      key: "patterns",
      value: patternLabelsKo.join(" + ") || "Order Block + FVG",
      reasonKo:
        "에이전트 초안에서 선택한 패턴 공간이며 탐색 createBody에 수동 선택으로 반영됩니다.",
      source: "schema",
    },
    {
      key: "patternConfigLevel",
      value: "basic",
      reasonKo: "선택한 패턴을 엔진 요청에 명시적으로 포함합니다.",
      source: "schema",
    },
    {
      key: "leverageMode",
      value: "automatic",
      reasonKo: "수동 레버리지 없이 엔진 자동 제어를 사용합니다.",
      source: "automatic",
    },
  ];

  const estimatedScopeKo = validationOk
    ? `${symbol} · ${timeframe} · 패턴 ${patternSpaceIds.length}개 · 깊이 ${form.depthProfile}`
    : "검증 실패 — 계획을 수정해야 합니다.";

  const href = `/strategy-search?draftSymbol=${encodeURIComponent(symbol)}&draftTimeframe=${encodeURIComponent(timeframe)}&draftSpaces=${encodeURIComponent(patternSpaceIds.join(","))}`;

  const proposedAction = createProposedAction({
    actionType: "prepare_search_plan",
    summary: "탐색 계획 검토",
    reason: `${symbol} ${timeframe} 초안을 전략 탐색 화면에서 검토하세요. 에이전트는 탐색을 자동 시작하지 않습니다.`,
    targetRoute: href,
    strategyId: null,
    jobId: null,
    runId: null,
    symbol,
    timeframe,
    parameters: {
      draft: true,
      symbol,
      timeframe,
      patternSpaceIds,
      patternConfigLevel: "basic",
      leverageMode: "automatic",
      validationOk,
      createBodyPreview: {
        symbols: symbol,
        timeframe,
        selectedSpaceIds: patternSpaceIds,
      },
    },
    requiresApproval: true,
    riskLevel: validationOk ? "low" : "blocked",
    blockedReason: validationOk
      ? null
      : validationIssues.slice(0, 3).join("; ") || "계획 검증 실패",
  });

  return {
    symbol,
    timeframe,
    patternSpaceIds,
    patternLabelsKo,
    patternConfigLevel: "basic",
    leverageMode: "automatic",
    depthProfile: String(form.depthProfile),
    estimatedScopeKo,
    whySettings,
    validationOk,
    validationIssues,
    formState: form,
    createBody,
    proposedAction,
  };
}

export function searchPlanDraftToFacts(draft: SearchPlanDraft): FactItem[] {
  const facts: FactItem[] = [
    fact("초안 심볼", draft.symbol, "strategy_search_jobs"),
    fact("초안 타임프레임", draft.timeframe, "strategy_search_jobs"),
    fact(
      "초안 패턴",
      draft.patternLabelsKo.join(" + ") || draft.patternSpaceIds.join(", "),
      "strategy_search_jobs",
    ),
    fact("초안 패턴 설정", draft.patternConfigLevel, "strategy_search_jobs"),
    fact("초안 레버리지", draft.leverageMode, "strategy_search_jobs"),
    fact("초안 범위", draft.estimatedScopeKo, "strategy_search_jobs"),
    fact(
      "초안 검증",
      draft.validationOk ? "통과" : `실패: ${draft.validationIssues[0] ?? "오류"}`,
      "system_status",
    ),
    fact(
      "초안 사유",
      draft.whySettings.map((w) => `${w.key}=${w.value}`).join(" · "),
      "strategy_search_jobs",
    ),
    fact(
      "데이터 공백",
      draft.whySettings.find((w) => w.source === "evidence")?.reasonKo ?? "없음",
      "strategy_search_jobs",
    ),
    fact("권장 다음 작업", "탐색 계획 검토", "system_status"),
    fact("권장 이동 경로", draft.proposedAction.targetRoute, "system_status"),
    fact("권장 작업 키", "open_search", "system_status"),
    fact(
      "권장 사유",
      "에이전트는 탐색을 자동 시작하지 않습니다. 계획 검토 후 기존 제어면으로 승인하세요.",
      "system_status",
    ),
  ];
  for (const setting of draft.whySettings) {
    facts.push(
      fact(
        `설정 이유:${setting.key}`,
        `${setting.value} — ${setting.reasonKo}`,
        "strategy_search_jobs",
      ),
    );
  }
  return facts;
}
