/**
 * Follow-up Strategy Search suggestions from paper/live/backtest/strategy context.
 * Returns a suggested create-job body — never starts a job, never mutates SAFE.
 */

import { SAFE_STRATEGY_ID } from "../strategyRepository";
import { buildPaperFeedback, type PaperFeedback } from "./paperFeedback";
import {
  SEARCH_DEPTH_PROFILES,
  QUALIFICATION_PROFILES,
} from "./operatorProfiles";
import { getDefaultSafeV44SearchSpace } from "./paramSpace";
import {
  applySearchSpaceMutation,
  type SearchSpaceMutationRecord,
} from "./searchSpaceMutation";
import type { StrategySearchAdjustmentPlan } from "./weaknessAnalysis";

export type FollowUpSource = "paper" | "live" | "backtest" | "strategy";

export type FollowUpResearchRequest = {
  source: FollowUpSource;
  strategyId?: string;
  notes?: string;
  paperRealizedPnl?: number | null;
  paperUnrealizedPnl?: number | null;
  paperTradeCount?: number | null;
  strategyName?: string;
};

export type FollowUpResearchResult = {
  ok: true;
  mutationBlocked: false;
  researchBasis: {
    source: FollowUpSource;
    strategyId: string | null;
    notes: string | null;
    suggestedResearchBasisId:
      | "paper_supplement"
      | "live_supplement"
      | "backtest_supplement"
      | "improve_best"
      | "fresh";
  };
  paperFeedback: PaperFeedback | null;
  /** Suggested POST /api/rextora/strategy-search body — operator must submit manually. */
  suggestedCreateJobBody: Record<string, unknown>;
  /** Applied search-space mutation record for UI (advisory suggestion only). */
  searchSpaceMutation: SearchSpaceMutationRecord | null;
  messageKo: string;
};

export class FollowUpResearchError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(message: string, code: string, httpStatus = 400) {
    super(message);
    this.name = "FollowUpResearchError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

const VALID_SOURCES: FollowUpSource[] = [
  "paper",
  "live",
  "backtest",
  "strategy",
];

function mapResearchBasisId(
  source: FollowUpSource,
): FollowUpResearchResult["researchBasis"]["suggestedResearchBasisId"] {
  if (source === "paper") return "paper_supplement";
  if (source === "live") return "live_supplement";
  if (source === "backtest") return "backtest_supplement";
  return "improve_best";
}

/**
 * Build a synthetic adjustment plan from paper feedback weakness text.
 * Maps known Korean weakness phrases to mutation triggers.
 */
function adjustmentFromPaperFeedback(
  paperFeedback: PaperFeedback | null,
): {
  adjustmentPlan: StrategySearchAdjustmentPlan | null;
  weaknessCategories: string[];
} {
  if (!paperFeedback) {
    return { adjustmentPlan: null, weaknessCategories: [] };
  }

  const weaknesses = paperFeedback.identifiedWeaknessesKo.join(" ");
  const adjustments = paperFeedback.recommendedAdjustmentsKo.join(" ");
  const blob = `${weaknesses} ${adjustments}`;
  const categories: string[] = [];
  const actions: StrategySearchAdjustmentPlan["actions"] = [];

  if (
    blob.includes("낙폭") ||
    blob.includes("손익이 음수") ||
    blob.includes("실현 손익이 음수")
  ) {
    categories.push("excessive_drawdown");
    actions.push(
      { type: "tighten_risk", reasonKo: "모의 낙폭·손실 보완" },
      { type: "prefer_lower_mdd", reasonKo: "모의 피드백 기반 MDD 강화" },
    );
  }

  if (
    blob.includes("충분하지 않") ||
    blob.includes("거래 부족") ||
    (paperFeedback.paperMetrics.tradeCount != null &&
      paperFeedback.paperMetrics.tradeCount < 3)
  ) {
    categories.push("insufficient_trades");
    actions.push(
      { type: "widen_entry_filters", reasonKo: "모의 거래 수 부족 보완" },
      { type: "prefer_more_trades", reasonKo: "진입 필터 완화" },
    );
  }

  if (actions.length === 0) {
    // Mild default mutation so follow-up still carries mutated ranges for UI.
    categories.push("prefer_more_trades");
    actions.push({
      type: "widen_entry_filters",
      reasonKo: "모의 피드백 기반 탐색 보완",
    });
  }

  return {
    adjustmentPlan: {
      version: 1,
      actions,
      nextFamilyHint: null,
    },
    weaknessCategories: categories,
  };
}

function buildSuggestedCreateJobBody(input: {
  source: FollowUpSource;
  strategyId: string | null;
  notes: string | null;
  paperFeedback: PaperFeedback | null;
}): {
  body: Record<string, unknown>;
  searchSpaceMutation: SearchSpaceMutationRecord | null;
} {
  const depth = SEARCH_DEPTH_PROFILES.standard;
  const qual = QUALIFICATION_PROFILES.balanced;
  const now = Date.now();
  const fromOpenTime = now - 90 * 24 * 60 * 60 * 1000;
  const toOpenTime = now;
  const searchName = `followup_${input.source}_${(input.strategyId ?? "custom").slice(0, 24)}`;

  const baseRanges = getDefaultSafeV44SearchSpace();
  const { adjustmentPlan, weaknessCategories } = adjustmentFromPaperFeedback(
    input.paperFeedback,
  );

  let parameterRanges = baseRanges;
  let mutationRecord: SearchSpaceMutationRecord | null = null;
  if (adjustmentPlan) {
    const applied = applySearchSpaceMutation(
      baseRanges,
      adjustmentPlan,
      weaknessCategories,
    );
    parameterRanges = applied.ranges;
    mutationRecord = applied.record;
  }

  const body: Record<string, unknown> = {
    searchVersion: "1",
    strategyTemplateId: searchName.slice(0, 80),
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 42,
    generatorType: "random",
    maxIterations: Math.min(depth.stageBatchSize, depth.candidateBudget),
    parameterRanges,
    evaluationWindows: [
      {
        id: "full",
        label: "전체 구간",
        fromOpenTime,
        toOpenTime,
        requiredForPass: true,
      },
    ],
    balance: 10_000,
    baseCostConfig: {
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0.0001,
      applyFunding: false,
      applySpread: true,
      spreadRate: 0.0001,
    },
    passPolicy: {
      thresholds: {
        minTradeCount: qual.minTradeCount,
        minTotalReturn: qual.minTotalReturn,
        maxMdd: qual.maxMddAbs != null ? -qual.maxMddAbs : null,
        minWinRate: qual.minWinRate,
      },
    },
    scoreWeights: {
      returnWeight: qual.returnWeight,
      mddWeight: qual.mddWeight,
      profitFactorWeight: 0.25,
      winRateWeight: 0.25,
      tradeAdequacyWeight: 0.25,
      negativeMonthWeight: 0.1,
      consistencyWeight: 0.1,
    },
    costStressScenarios: depth.stressEnabled
      ? [
          {
            id: "stress_1_5x",
            label: "비용 1.5배",
            requiredForPass: false,
            feeMultiplier: depth.stressFeeMultiplier,
            slippageMultiplier: depth.stressSlippageMultiplier,
            fundingMultiplier: 1,
            spreadMultiplier: depth.stressFeeMultiplier,
            costGuardKMultiplier: 1,
          },
        ]
      : [],
    jitterConfig: {
      enabled: depth.jitterEnabled,
      sampleCount: depth.jitterSamples,
      mutationScale: depth.jitterMutationScale,
      seed: 42,
      minimumPassRate: 0.5,
      maximumScoreDropRatio: 0.35,
      parameterRanges,
    },
    dataRef: {
      source: "binance_historical",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
    },
    operatorPlan: {
      depthProfile: depth.id,
      qualificationProfile: qual.id,
      qualifiedTarget: 1,
      stopWhenQualifiedTarget: false,
      candidateBudget: depth.candidateBudget,
      stageBatchSize: depth.stageBatchSize,
      maxRuntimeMs: depth.maxRuntimeMs,
      minScore: qual.minScore,
      searchName: searchName.slice(0, 80),
      mutatedParameterRanges: parameterRanges,
      searchSpaceMutation: mutationRecord,
    },
    researchBasis: {
      source: input.source,
      strategyId: input.strategyId,
      notes: input.notes,
      suggestedResearchBasisId: mapResearchBasisId(input.source),
      paperFeedbackSummary: input.paperFeedback
        ? {
            weaknesses: input.paperFeedback.identifiedWeaknessesKo,
            adjustments: input.paperFeedback.recommendedAdjustmentsKo,
          }
        : null,
    },
    autoStart: false,
    noteKo:
      "이 본문은 제안만 합니다. POST /api/rextora/strategy-search 로 직접 생성하세요. SAFE는 변경되지 않습니다.",
  };

  return { body, searchSpaceMutation: mutationRecord };
}

/**
 * Build follow-up research suggestion. Fail-closed for SAFE mutation intents.
 */
export function buildFollowUpResearch(
  input: FollowUpResearchRequest,
): FollowUpResearchResult {
  const source = input.source;
  if (!VALID_SOURCES.includes(source)) {
    throw new FollowUpResearchError(
      "source must be paper|live|backtest|strategy",
      "INVALID_SOURCE",
    );
  }

  const strategyId = input.strategyId?.trim() || null;

  // Fail closed: never suggest mutating SAFE as a template overwrite intent.
  if (strategyId === SAFE_STRATEGY_ID) {
    throw new FollowUpResearchError(
      "SAFE_v44_i4060은 수정·재작성 대상이 아닙니다. 복사본 전략 ID로 재탐색하세요.",
      "SAFE_MUTATION_BLOCKED",
      403,
    );
  }

  let paperFeedback: PaperFeedback | null = null;
  if (source === "paper") {
    paperFeedback = buildPaperFeedback({
      strategyId: strategyId ?? "paper_active",
      strategyName: input.strategyName ?? strategyId ?? "모의 전략",
      paperRealizedPnl: input.paperRealizedPnl,
      paperUnrealizedPnl: input.paperUnrealizedPnl,
      paperTradeCount: input.paperTradeCount,
    });
  }

  const notes = input.notes?.trim() || null;
  const { body: suggestedCreateJobBody, searchSpaceMutation } =
    buildSuggestedCreateJobBody({
      source,
      strategyId,
      notes,
      paperFeedback,
    });

  return {
    ok: true,
    mutationBlocked: false,
    researchBasis: {
      source,
      strategyId,
      notes,
      suggestedResearchBasisId: mapResearchBasisId(source),
    },
    paperFeedback,
    suggestedCreateJobBody,
    searchSpaceMutation,
    messageKo:
      "재탐색 제안이 준비되었습니다. 작업을 자동 시작하지 않으며 SAFE는 변경되지 않습니다.",
  };
}
