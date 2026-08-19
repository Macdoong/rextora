/**
 * Tool plan builder — new / modify / diff / cancel-replace / continue.
 */

import crypto from "node:crypto";
import {
  buildSearchPlanDraft,
  type SearchPlanDraft,
} from "../../searchPlanDraft";
import {
  hashEngineParameters,
  searchCreateBodyForHash,
} from "../../canonicalCommandPayload";
import { SEARCHABLE_PATTERN_SPACE_OPTIONS } from "@/components/rextora/strategySearch/formDefaults";
import type { PlanDiff, ToolPlanItem } from "./reasoningTypes";
import { newReasoningId } from "./reasoningSchema";

const PATTERN_ALTERNATIVES: string[][] = [
  ["order_block", "fvg"],
  ["trendline", "support_resistance"],
  ["order_block", "liquidity"],
  ["fvg", "structure"],
  ["demand", "supply"],
];

function normalizeTimeframe(raw?: string | null): string {
  const allowed = new Set(["1m", "5m", "15m", "1h", "4h", "1d"]);
  if (raw && allowed.has(raw)) return raw;
  return "15m";
}

function patternKey(ids: string[]): string {
  return [...ids].sort().join("+");
}

export function computeSearchPlanHash(createBody: unknown): string {
  return hashEngineParameters(
    { createBody: searchCreateBodyForHash(createBody) },
    "create_strategy_search_job",
  );
}

export function diffSearchDrafts(
  before: SearchPlanDraft,
  after: SearchPlanDraft,
  planId: string,
): PlanDiff {
  const previousHash = computeSearchPlanHash(before.createBody);
  const nextHash = computeSearchPlanHash(after.createBody);
  const fields: PlanDiff["fields"] = [];

  if (before.symbol !== after.symbol) {
    fields.push({
      key: "symbol",
      labelKo: "심볼",
      before: before.symbol,
      after: after.symbol,
    });
  }
  if (before.timeframe !== after.timeframe) {
    fields.push({
      key: "timeframe",
      labelKo: "타임프레임",
      before: before.timeframe,
      after: after.timeframe,
    });
  }
  const beforePat = before.patternLabelsKo.join(" + ");
  const afterPat = after.patternLabelsKo.join(" + ");
  if (beforePat !== afterPat) {
    fields.push({
      key: "patterns",
      labelKo: "패턴",
      before: beforePat,
      after: afterPat,
    });
  }

  const summaryKo =
    fields.length === 0
      ? "변경 사항 없음"
      : fields.map((f) => `${f.labelKo}: ${f.before} → ${f.after}`).join(" · ");

  return { planId, previousHash, nextHash, fields, summaryKo };
}

export function pickDifferentPatternCombo(
  previousIds: string[],
): string[] {
  const prevKey = patternKey(previousIds);
  for (const alt of PATTERN_ALTERNATIVES) {
    if (patternKey(alt) !== prevKey) return alt;
  }
  return PATTERN_ALTERNATIVES[1] ?? ["trendline", "support_resistance"];
}

export function buildSearchCreatePlanSteps(
  draft: SearchPlanDraft,
  options?: { includeStart?: boolean },
): ToolPlanItem[] {
  const steps: ToolPlanItem[] = [
    {
      stepId: "create_search",
      toolId: "search.create",
      arguments: { createBody: draft.createBody },
      dependsOn: [],
      purpose: "새 전략 탐색 작업 생성",
      expectedResult: "jobId 반환",
      requiresApproval: true,
      executionOrder: 1,
      onFailure: "abort",
      status: "pending",
    },
  ];
  if (options?.includeStart !== false) {
    steps.push({
      stepId: "start_search",
      toolId: "search.start",
      arguments: { jobId: "$create_search.jobId" },
      dependsOn: ["create_search"],
      purpose: "생성된 탐색 작업 시작",
      expectedResult: "running 상태",
      requiresApproval: true,
      executionOrder: 2,
      onFailure: "abort",
      status: "pending",
    });
  }
  return steps;
}

export function buildCancelReplacePlan(
  jobId: string,
  draft: SearchPlanDraft,
): ToolPlanItem[] {
  return [
    {
      stepId: "cancel_running",
      toolId: "search.cancel",
      arguments: { jobId },
      dependsOn: [],
      purpose: "현재 실행 중인 탐색 취소",
      expectedResult: "cancelled 상태",
      requiresApproval: true,
      executionOrder: 1,
      onFailure: "abort",
      status: "pending",
    },
    ...buildSearchCreatePlanSteps(draft).map((s, i) => ({
      ...s,
      executionOrder: i + 2,
      dependsOn:
        s.stepId === "start_search"
          ? ["cancel_running", "create_search"]
          : ["cancel_running"],
    })),
  ];
}

export function buildNewSearchPlan(input: {
  symbol?: string | null;
  timeframe?: string | null;
  patternSpaceIds?: string[];
  excludePatternIds?: string[];
}): {
  draft: SearchPlanDraft;
  steps: ToolPlanItem[];
  requestHash: string;
  planId: string;
} {
  const patternSpaceIds =
    input.patternSpaceIds ??
    (input.excludePatternIds?.length
      ? pickDifferentPatternCombo(input.excludePatternIds)
      : undefined);

  const draft = buildSearchPlanDraft({
    requestedSymbol: input.symbol,
    requestedTimeframe: input.timeframe,
    patternSpaceIds,
  });
  const planId = `plan_${crypto.randomBytes(6).toString("hex")}`;
  const requestHash = computeSearchPlanHash(draft.createBody);
  return {
    draft,
    steps: buildSearchCreatePlanSteps(draft),
    requestHash,
    planId,
  };
}

export function buildModifiedSearchPlan(input: {
  base: SearchPlanDraft;
  timeframe?: string | null;
  patternSpaceIds?: string[];
}): {
  draft: SearchPlanDraft;
  diff: PlanDiff;
  steps: ToolPlanItem[];
  requestHash: string;
  planId: string;
} {
  const planId = `plan_${crypto.randomBytes(6).toString("hex")}`;
  const after = buildSearchPlanDraft({
    requestedSymbol: input.base.symbol,
    requestedTimeframe: input.timeframe ?? input.base.timeframe,
    patternSpaceIds: input.patternSpaceIds ?? input.base.patternSpaceIds,
  });
  const diff = diffSearchDrafts(input.base, after, planId);
  const requestHash = diff.nextHash;
  return {
    draft: after,
    diff,
    steps: buildSearchCreatePlanSteps(after),
    requestHash,
    planId,
  };
}

export function patternLabelsFromIds(ids: string[]): string[] {
  return SEARCHABLE_PATTERN_SPACE_OPTIONS.filter((o) => ids.includes(o.id)).map(
    (o) => o.labelKo,
  );
}

export function detectTimeframeChange(query: string): string | null {
  const q = query.toLowerCase();
  if (/1\s*시간|1h|1hour|60\s*분/.test(q)) return "1h";
  if (/15\s*분|15m/.test(q)) return "15m";
  if (/5\s*분|5m/.test(q)) return "5m";
  if (/4\s*시간|4h/.test(q)) return "4h";
  if (/1\s*일|1d|daily/.test(q)) return "1d";
  return null;
}

export function buildMonitorSteps(jobId: string): ToolPlanItem[] {
  return [
    {
      stepId: "monitor_status",
      toolId: "search.status",
      arguments: { jobId },
      dependsOn: [],
      purpose: "실행 중인 탐색 상태 확인",
      expectedResult: "terminal 또는 running 상태",
      requiresApproval: false,
      executionOrder: 1,
      onFailure: "continue",
      status: "pending",
    },
  ];
}

export function reasoningIdForPlan(planId: string): string {
  return newReasoningId();
}
