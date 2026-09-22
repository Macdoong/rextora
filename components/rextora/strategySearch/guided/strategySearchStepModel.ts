import { resolvePatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";
import {
  HISTORICAL_PERIOD_PRESETS,
  type StrategySearchOperatorFormState,
} from "../formDefaults";
import {
  formatCustomerSearchValue,
  formatCustomerSearchValues,
  searchModeCustomerLabel,
  tradingStyleCustomerLabel,
} from "../customerDisplay";
import {
  type FormFieldError,
  validateStrategySearchForm,
} from "../formValidation";

export type StrategySearchSetupStepId =
  | "market"
  | "approach"
  | "strategy"
  | "validation"
  | "review";

export type StrategySearchStepUiState =
  | "current"
  | "completed"
  | "available"
  | "needs_review"
  | "locked";

export const STRATEGY_SEARCH_SETUP_STEPS: ReadonlyArray<{
  id: StrategySearchSetupStepId;
  navLabelKo: string;
  headingKo: string;
  surfaceIntroKo?: string;
}> = [
  {
    id: "market",
    navLabelKo: "분석 대상",
    headingKo: "분석 기준",
    surfaceIntroKo: "분석할 코인과 시간 범위를 설정합니다.",
  },
  { id: "approach", navLabelKo: "탐색 방식", headingKo: "탐색 방식" },
  { id: "strategy", navLabelKo: "전략 · 범위", headingKo: "전략 및 탐색 범위" },
  { id: "validation", navLabelKo: "검증 · 위험", headingKo: "검증 · 위험 조건" },
  { id: "review", navLabelKo: "최종 확인", headingKo: "최종 확인" },
];

const STEP_INDEX: Record<StrategySearchSetupStepId, number> = {
  market: 0,
  approach: 1,
  strategy: 2,
  validation: 3,
  review: 4,
};

export const STEP_FIELD_GROUPS: Record<
  StrategySearchSetupStepId,
  ReadonlySet<string>
> = {
  market: new Set([
    "symbol",
    "symbols",
    "timeframe",
    "dataRef",
    "searchName",
    "marketMode",
  ]),
  approach: new Set([
    "depthProfile",
    "durationPreset",
    "maxRuntime",
    "tradingStyle",
    "researchBasis",
    "patternConfigLevel",
    "qualifiedTarget",
    "maxSearchCount",
    "candidateBudget",
  ]),
  strategy: new Set([
    "selectedSpaceIds",
    "patternCombinationBlocks",
    "patternCombinationOperator",
    "patternCombinationWeightedThreshold",
    "patternDirection",
  ]),
  validation: new Set([
    "qualificationProfile",
    "minTradeCount",
    "maxMdd",
    "minTotalReturn",
    "minWinRate",
    "minScore",
    "feeRate",
    "slippageRate",
    "stressEnabled",
    "seed",
  ]),
  review: new Set(),
};

const MARKET_KEYS: (keyof StrategySearchOperatorFormState)[] = [
  "symbol",
  "timeframe",
  "periodPreset",
  "availableFromDate",
  "availableToDate",
  "marketMode",
  "searchName",
];

const APPROACH_KEYS: (keyof StrategySearchOperatorFormState)[] = [
  "autoStrategyCombo",
  "patternConfigLevel",
  "tradingStyle",
  "researchBasis",
  "depthProfile",
  "durationPreset",
  "maxRuntimeMinutesOverride",
];

const STRATEGY_KEYS: (keyof StrategySearchOperatorFormState)[] = [
  "selectedSpaceIds",
  "patternDirection",
  "patternCombinationFamilies",
  "patternCombinationOperator",
  "patternCombinationTemplate",
  "patternCombinationBlocks",
  "patternCombinationWeightedThreshold",
];

/** Which later steps need re-confirmation when a step's semantic inputs change. */
export const STEP_DEPENDENCY_INVALIDATIONS: Record<
  StrategySearchSetupStepId,
  StrategySearchSetupStepId[]
> = {
  market: ["validation", "review"],
  approach: ["strategy", "validation", "review"],
  strategy: ["review"],
  validation: ["review"],
  review: [],
};

export function stepIndex(id: StrategySearchSetupStepId): number {
  return STEP_INDEX[id];
}

export function filterErrorsForStep(
  errors: FormFieldError[],
  stepId: StrategySearchSetupStepId,
): FormFieldError[] {
  if (stepId === "review") return errors;
  const fields = STEP_FIELD_GROUPS[stepId];
  return errors.filter((e) => fields.has(e.field));
}

export function validateSetupStep(
  form: StrategySearchOperatorFormState,
  stepId: StrategySearchSetupStepId,
): FormFieldError[] {
  const all = validateStrategySearchForm(form);
  if (stepId === "review") return all;
  return filterErrorsForStep(all, stepId);
}

export function isSetupStepValid(
  form: StrategySearchOperatorFormState,
  stepId: StrategySearchSetupStepId,
): boolean {
  return validateSetupStep(form, stepId).length === 0;
}

function formSliceChanged(
  prev: StrategySearchOperatorFormState,
  next: StrategySearchOperatorFormState,
  keys: (keyof StrategySearchOperatorFormState)[],
): boolean {
  for (const key of keys) {
    const a = prev[key];
    const b = next[key];
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) return true;
      continue;
    }
    if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
      continue;
    }
    if (a !== b) return true;
  }
  return false;
}

export function detectDependencyInvalidatedSteps(
  prev: StrategySearchOperatorFormState,
  next: StrategySearchOperatorFormState,
): StrategySearchSetupStepId[] {
  const invalidated = new Set<StrategySearchSetupStepId>();
  if (formSliceChanged(prev, next, MARKET_KEYS)) {
    for (const id of STEP_DEPENDENCY_INVALIDATIONS.market) invalidated.add(id);
  }
  if (formSliceChanged(prev, next, APPROACH_KEYS)) {
    for (const id of STEP_DEPENDENCY_INVALIDATIONS.approach) invalidated.add(id);
  }
  if (formSliceChanged(prev, next, STRATEGY_KEYS)) {
    for (const id of STEP_DEPENDENCY_INVALIDATIONS.strategy) invalidated.add(id);
  }
  const validationKeys: (keyof StrategySearchOperatorFormState)[] = [
    "qualificationProfile",
    "minTradeCount",
    "maxMdd",
    "mddPreset",
    "minTotalReturn",
    "minWinRate",
    "minScore",
    "feeRate",
    "slippageRate",
    "stressEnabled",
    "jitterEnabled",
    "leverageMode",
    "leverageFixed",
    "leverageMin",
    "leverageMax",
  ];
  if (formSliceChanged(prev, next, validationKeys)) {
    for (const id of STEP_DEPENDENCY_INVALIDATIONS.validation) invalidated.add(id);
  }
  return [...invalidated];
}

/** NEEDS_REVIEW only applies to steps the user already reached or completed. */
export function filterInvalidatedForNeedsReview(
  invalidated: StrategySearchSetupStepId[],
  opts: {
    visited: ReadonlySet<StrategySearchSetupStepId>;
    completed: ReadonlySet<StrategySearchSetupStepId>;
  },
): StrategySearchSetupStepId[] {
  return invalidated.filter(
    (id) => opts.visited.has(id) || opts.completed.has(id),
  );
}

export function computeLinearFrontier(
  completed: ReadonlySet<StrategySearchSetupStepId>,
): number {
  for (let i = 0; i < STRATEGY_SEARCH_SETUP_STEPS.length; i++) {
    const id = STRATEGY_SEARCH_SETUP_STEPS[i]!.id;
    if (id === "review") continue;
    if (!completed.has(id)) return i;
  }
  return STRATEGY_SEARCH_SETUP_STEPS.length - 1;
}

export function isStepEnterable(
  stepId: StrategySearchSetupStepId,
  opts: {
    currentStepId: StrategySearchSetupStepId;
    visited: ReadonlySet<StrategySearchSetupStepId>;
    completed: ReadonlySet<StrategySearchSetupStepId>;
    needsReview: ReadonlySet<StrategySearchSetupStepId>;
  },
): boolean {
  const index = stepIndex(stepId);
  const frontier = computeLinearFrontier(opts.completed);
  if (index <= frontier) return true;
  if (opts.visited.has(stepId)) return true;
  if (opts.completed.has(stepId)) return true;
  if (stepId === opts.currentStepId) return true;
  if (
    opts.needsReview.has(stepId) &&
    (opts.visited.has(stepId) || opts.completed.has(stepId))
  ) {
    return true;
  }
  return false;
}

export function resolveStepUiState(
  stepId: StrategySearchSetupStepId,
  opts: {
    currentStepId: StrategySearchSetupStepId;
    visited: ReadonlySet<StrategySearchSetupStepId>;
    completed: ReadonlySet<StrategySearchSetupStepId>;
    needsReview: ReadonlySet<StrategySearchSetupStepId>;
  },
): StrategySearchStepUiState {
  if (stepId === opts.currentStepId) return "current";
  if (opts.needsReview.has(stepId)) return "needs_review";
  if (opts.completed.has(stepId)) return "completed";
  if (!isStepEnterable(stepId, opts)) return "locked";
  if (opts.visited.has(stepId)) return "available";
  return "locked";
}

export function recalculateStepCompletionFromForm(
  form: StrategySearchOperatorFormState,
): Set<StrategySearchSetupStepId> {
  const completed = new Set<StrategySearchSetupStepId>();
  for (const { id } of STRATEGY_SEARCH_SETUP_STEPS) {
    if (id === "review") {
      if (validateStrategySearchForm(form).length === 0) completed.add(id);
      continue;
    }
    if (isSetupStepValid(form, id)) completed.add(id);
  }
  return completed;
}

export type StepCompactSummary = {
  stepId: StrategySearchSetupStepId;
  titleKo: string;
  lineKo: string;
};

export function buildStepCompactSummaries(
  form: StrategySearchOperatorFormState,
): StepCompactSummary[] {
  const selectionMode = resolvePatternSelectionMode({
    patternConfigLevel: form.patternConfigLevel,
    autoStrategyCombo: form.autoStrategyCombo,
  });
  const periodLabel =
    form.periodPreset === "custom"
      ? `${form.availableFromDate || "—"} ~ ${form.availableToDate || "—"}`
      : HISTORICAL_PERIOD_PRESETS[form.periodPreset].labelKo;

  const strategyCount =
    selectionMode === "automatic"
      ? "자동"
      : `${form.selectedSpaceIds.length}개`;

  return [
    {
      stepId: "market",
      titleKo: "분석 기준",
      lineKo: `${form.symbol || "—"} · ${form.timeframe || "—"} · ${periodLabel}`,
    },
    {
      stepId: "approach",
      titleKo: "탐색 방식",
      lineKo: `${searchModeCustomerLabel(selectionMode)} · ${tradingStyleCustomerLabel(form.tradingStyle)}`,
    },
    {
      stepId: "strategy",
      titleKo: "전략 · 범위",
      lineKo:
        selectionMode === "automatic"
          ? "자동 조합"
          : formatCustomerSearchValues(form.selectedSpaceIds, "선택 없음"),
    },
    {
      stepId: "validation",
      titleKo: "검증",
      lineKo: `최소 거래 ${form.minTradeCount || "—"}회 · 최대 MDD ${form.maxMdd.trim() ? `${form.maxMdd}%` : "프리셋"}`,
    },
    {
      stepId: "review",
      titleKo: "최종 확인",
      lineKo: "설정 검토 후 탐색 시작",
    },
  ];
}

export const GUIDE_COPY: Record<
  StrategySearchSetupStepId,
  {
    statusKo: string;
    taskKo: string;
    recommendationKo: string;
    impactKo: string;
    warningKo?: string;
  }
> = {
  market: {
    statusKo: "분석 준비",
    taskKo: "어떤 코인과 시간 범위를 분석할지 정합니다.",
    recommendationKo: "기본값으로 시작해도 충분합니다.",
    impactKo: "시간봉과 분석 기간은 탐색 범위와 실행 시간에 영향을 줍니다.",
  },
  approach: {
    statusKo: "탐색 방식 선택",
    taskKo:
      "Rextora가 탐색 범위를 자동으로 구성할지, 직접 전략군을 선택할지 정합니다.",
    recommendationKo:
      "자동 탐색은 여러 전략군을 폭넓게 탐색합니다. 직접 선택은 원하는 전략군에 집중합니다.",
    impactKo: "탐색 수준·시간·프리셋은 후보 생성량과 연구 깊이에 영향을 줍니다.",
  },
  strategy: {
    statusKo: "범위 구성",
    taskKo: "실제로 탐색할 전략 유형과 범위를 정합니다.",
    recommendationKo: "선택한 전략군만 이번 연구 대상에 포함됩니다.",
    impactKo: "패턴·조합 조건은 생성되는 후보 전략의 형태를 결정합니다.",
  },
  validation: {
    statusKo: "검증 기준",
    taskKo: "후보 전략이 통과해야 할 검증 기준과 위험 조건을 정합니다.",
    recommendationKo: "기준이 엄격할수록 통과 후보는 줄어들 수 있습니다.",
    impactKo: "합격 기준·비용·레버리지는 최종 추천 후보 풀을 좁힙니다.",
  },
  review: {
    statusKo: "최종 점검",
    taskKo: "탐색을 시작하기 전에 설정을 마지막으로 확인합니다.",
    recommendationKo: "문제가 없다면 이 설정 그대로 연구를 시작합니다.",
    impactKo: "시작 후에는 실행 중 설정을 바꿀 수 없습니다.",
  },
};

export function guideWarningForStep(
  stepId: StrategySearchSetupStepId,
  errors: FormFieldError[],
): string | undefined {
  const stepErrors = filterErrorsForStep(errors, stepId);
  return stepErrors[0]?.message;
}
