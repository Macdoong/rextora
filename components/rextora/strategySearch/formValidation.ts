import type { StrategySearchCreateJobBody } from "./types";
import { PATTERN_PARAMETER_CATALOG } from "@/src/lib/rextora/patternParameterCatalog";
import {
  OPERATOR_SUPPORTED_SYMBOLS,
  OPERATOR_SUPPORTED_TIMEFRAMES,
  SEARCHABLE_PATTERN_SPACE_OPTIONS,
  SEARCHABLE_SPACE_OPTIONS,
  getDepthProfile,
  isPatternFamilyId,
  operatorFormToCreateBody,
  resolveCandidateBudget,
  resolveDepthProfileId,
  resolveMaxRuntimeMs,
  resolveQualifiedTarget,
  resolveSymbol,
  type StrategySearchOperatorFormState,
} from "./formDefaults";

export interface FormFieldError {
  field: string;
  message: string;
}

const ALLOWED_SPACE_IDS = new Set<string>([
  ...SEARCHABLE_SPACE_OPTIONS.map((s) => s.id),
  ...SEARCHABLE_PATTERN_SPACE_OPTIONS.map((s) => s.id),
]);

const PATTERN_SPACE_IDS = new Set<string>(
  SEARCHABLE_PATTERN_SPACE_OPTIONS.map((s) => s.id),
);

/**
 * Validate selected strategy-family / pattern combination before Research start.
 * Blocks unknown ids and empty manual selections.
 */
export function validatePatternCombination(
  selectedSpaceIds: string[],
  opts?: { autoStrategyCombo?: boolean },
): FormFieldError[] {
  const errors: FormFieldError[] = [];
  if (opts?.autoStrategyCombo) return errors;
  if (!Array.isArray(selectedSpaceIds) || selectedSpaceIds.length === 0) {
    errors.push({
      field: "selectedSpaceIds",
      message:
        "전략 계열 또는 패턴을 하나 이상 선택하세요. (자동 조합을 켜도 됩니다)",
    });
    return errors;
  }
  const unknown = selectedSpaceIds.filter((id) => !ALLOWED_SPACE_IDS.has(id));
  if (unknown.length > 0) {
    errors.push({
      field: "selectedSpaceIds",
      message: `지원하지 않는 탐색 공간: ${unknown.join(", ")}`,
    });
  }
  // Contradictory: exclusive pattern-only short-circuit not needed; all four
  // patterns can co-exist with SafeV44. Reject duplicate-only empty after filter.
  const known = selectedSpaceIds.filter((id) => ALLOWED_SPACE_IDS.has(id));
  if (known.length === 0) {
    errors.push({
      field: "selectedSpaceIds",
      message: "지원되는 전략 계열/패턴이 없습니다.",
    });
  }
  // Pattern + indicator confirmation is allowed; flag only if patterns alone
  // request incompatible timeframe is handled elsewhere.
  void PATTERN_SPACE_IDS;
  return errors;
}

function isFiniteNumber(n: number): boolean {
  return typeof n === "number" && Number.isFinite(n);
}

const SYMBOL_SET = new Set<string>(OPERATOR_SUPPORTED_SYMBOLS);
const TIMEFRAME_SET = new Set<string>(OPERATOR_SUPPORTED_TIMEFRAMES);

export function validateStrategySearchForm(
  form: StrategySearchOperatorFormState,
): FormFieldError[] {
  const errors: FormFieldError[] = [];

  if (typeof form.symbols === "string") {
    const parts = form.symbols
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      errors.push({ field: "symbols", message: "마켓(심볼)을 입력하세요." });
    }
  } else {
    const symbol = resolveSymbol(form);
    if (!symbol) {
      errors.push({ field: "symbol", message: "마켓을 선택하세요." });
    } else if (!SYMBOL_SET.has(symbol)) {
      errors.push({ field: "symbol", message: "지원하지 않는 마켓입니다." });
    }
  }

  if (!form.timeframe.trim()) {
    errors.push({ field: "timeframe", message: "타임프레임이 필요합니다." });
  } else if (!TIMEFRAME_SET.has(form.timeframe.trim())) {
    errors.push({
      field: "timeframe",
      message: "지원하지 않는 타임프레임입니다.",
    });
  }

  const availableFrom = Date.parse(`${form.availableFromDate}T00:00:00.000Z`);
  const availableTo = Date.parse(`${form.availableToDate}T23:59:59.999Z`);
  if (!Number.isFinite(availableFrom) || !Number.isFinite(availableTo)) {
    errors.push({ field: "dataRef", message: "데이터 기간이 올바르지 않습니다." });
  } else if (availableFrom > availableTo) {
    errors.push({
      field: "dataRef",
      message: "데이터 시작일이 종료일보다 늦을 수 없습니다.",
    });
  }

  if (form.qualifiedTargetPreset === "custom") {
    const n = Number(form.qualifiedTargetCustom);
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      errors.push({
        field: "qualifiedTarget",
        message: "필요 합격 수는 1–50 정수여야 합니다.",
      });
    }
  } else {
    const qt = resolveQualifiedTarget(form);
    if (qt < 1 || qt > 50) {
      errors.push({
        field: "qualifiedTarget",
        message: "필요 합격 수가 올바르지 않습니다.",
      });
    }
  }

  if (typeof form.maxSearchCount === "string") {
    const maxSearch = Number(form.maxSearchCount);
    if (!Number.isInteger(maxSearch) || maxSearch < 1) {
      errors.push({
        field: "maxSearchCount",
        message: "최대 탐색 수는 1 이상의 정수여야 합니다.",
      });
    }
  }

  if (form.candidateBudgetOverride.trim() !== "") {
    const n = Number(form.candidateBudgetOverride);
    if (!Number.isInteger(n) || n < 1) {
      errors.push({
        field: "candidateBudget",
        message: "탐색 전략 한도는 1 이상의 정수여야 합니다.",
      });
    }
  }

  if (form.maxRuntimeMinutesOverride.trim() !== "") {
    const n = Number(form.maxRuntimeMinutesOverride);
    if (!isFiniteNumber(n) || n <= 0) {
      errors.push({
        field: "maxRuntime",
        message: "최대 실행 시간(분)은 0보다 커야 합니다.",
      });
    }
  }

  // Duration + advanced runtime must stay consistent when both set.
  if (
    form.durationPreset !== "custom" &&
    form.maxRuntimeMinutesOverride.trim() !== ""
  ) {
    const expected = Number(form.durationPreset);
    const actual = Number(form.maxRuntimeMinutesOverride);
    if (
      Number.isFinite(expected) &&
      Number.isFinite(actual) &&
      expected !== actual
    ) {
      errors.push({
        field: "maxRuntime",
        message: `탐색 시간(${expected}분)과 고급 실행 시간(${actual}분)이 일치하지 않습니다.`,
      });
    }
  }

  if (form.minTradeCount.trim() !== "") {
    const n = Number(form.minTradeCount);
    if (!isFiniteNumber(n) || n < 0) {
      errors.push({
        field: "minTradeCount",
        message: "최소 거래 수는 0 이상이어야 합니다.",
      });
    }
  }
  if (form.maxMdd.trim() !== "") {
    const n = Number(form.maxMdd);
    if (!isFiniteNumber(n) || n <= 0 || n > 100) {
      errors.push({
        field: "maxMdd",
        message: "최대 낙폭(%)은 0보다 크고 100 이하여야 합니다 (예: 15).",
      });
    }
  }
  const minReturn =
    typeof form.targetReturn === "string"
      ? form.targetReturn
      : form.minTotalReturn;
  if (minReturn.trim() !== "") {
    const n = Number(minReturn);
    if (!isFiniteNumber(n)) {
      errors.push({
        field: "minTotalReturn",
        message: "최소 수익률(%)은 숫자여야 합니다.",
      });
    }
  }
  if (form.minWinRate.trim() !== "") {
    const n = Number(form.minWinRate);
    if (!isFiniteNumber(n) || n < 0 || n > 100) {
      errors.push({
        field: "minWinRate",
        message: "최소 승률(%)은 0–100 사이여야 합니다 (예: 45).",
      });
    }
  }
  if (form.minScore.trim() !== "") {
    const n = Number(form.minScore);
    if (!isFiniteNumber(n)) {
      errors.push({
        field: "minScore",
        message: "최소 점수는 숫자여야 합니다.",
      });
    }
  }

  const seed = Number(form.seed);
  if (!Number.isInteger(seed) || !Number.isFinite(seed)) {
    errors.push({ field: "seed", message: "시드는 유한한 정수여야 합니다." });
  }

  const fee = Number(form.feeRate);
  const slip = Number(form.slippageRate);
  if (!isFiniteNumber(fee) || fee < 0) {
    errors.push({ field: "feeRate", message: "수수료가 올바르지 않습니다." });
  }
  if (!isFiniteNumber(slip) || slip < 0) {
    errors.push({
      field: "slippageRate",
      message: "슬리피지가 올바르지 않습니다.",
    });
  }

  // Standard search requires robustness checks (stress and/or jitter).
  if (!form.stressEnabled && !form.jitterEnabled) {
    errors.push({
      field: "stressEnabled",
      message:
        "표준 탐색에는 비용 스트레스 또는 파라미터 지터 검증이 필요합니다.",
    });
  }

  errors.push(
    ...validatePatternCombination(form.selectedSpaceIds, {
      autoStrategyCombo: form.autoStrategyCombo,
    }),
  );

  const combinationFamilies = form.patternCombinationFamilies.filter(
    isPatternFamilyId,
  );
  const blocks = form.patternCombinationBlocks ?? [];
  if (combinationFamilies.length > 0) {
    if (blocks.length !== combinationFamilies.length) {
      errors.push({
        field: "patternCombinationBlocks",
        message: "선택한 패턴마다 저장 가능한 설정 블록이 필요합니다.",
      });
    } else {
      const orders = new Set<number>();
      const priorities = new Set<number>();
      let entryZones = 0;
      let totalWeight = 0;
      for (const block of blocks) {
        if (!combinationFamilies.includes(block.family)) {
          errors.push({
            field: "patternCombinationBlocks",
            message: `${block.family} 블록이 선택한 패턴과 일치하지 않습니다.`,
          });
          continue;
        }
        if (!Number.isInteger(block.order) || block.order < 0 || orders.has(block.order)) {
          errors.push({
            field: "patternCombinationBlocks",
            message: "패턴 블록 순서는 중복 없는 0 이상 정수여야 합니다.",
          });
        }
        orders.add(block.order);
        const priority = block.priority ?? block.order;
        if (
          !Number.isInteger(priority) ||
          priority < 0 ||
          (form.patternCombinationOperator === "priority" &&
            priorities.has(priority))
        ) {
          errors.push({
            field: "patternCombinationBlocks",
            message: "우선순위는 중복 없는 0 이상 정수여야 합니다.",
          });
        }
        priorities.add(priority);
        const weight = block.weight ?? 1;
        if (!Number.isFinite(weight) || weight <= 0 || weight > 100) {
          errors.push({
            field: "patternCombinationBlocks",
            message: "블록 가중치는 0보다 크고 100 이하여야 합니다.",
          });
        } else {
          totalWeight += weight;
        }
        if (block.role === "entry_zone") entryZones += 1;
        const catalog = PATTERN_PARAMETER_CATALOG[block.family];
        for (const entry of catalog) {
          const value = block.params[entry.key];
          const field = `patternBlock.${block.id}.${entry.key}`;
          if (value === undefined || value === null) {
            errors.push({ field, message: `${entry.labelKo} 값이 필요합니다.` });
            continue;
          }
          if (entry.type === "enum") {
            if (
              typeof value !== "string" ||
              !entry.allowedEnumValues?.includes(value)
            ) {
              errors.push({ field, message: `${entry.labelKo} 선택값이 올바르지 않습니다.` });
            }
          } else if (entry.type === "bool") {
            if (typeof value !== "boolean") {
              errors.push({ field, message: `${entry.labelKo} 값은 참/거짓이어야 합니다.` });
            }
          } else if (
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            (typeof entry.min === "number" && value < entry.min) ||
            (typeof entry.max === "number" && value > entry.max) ||
            (entry.type === "int" && !Number.isInteger(value))
          ) {
            errors.push({
              field,
              message: `${entry.labelKo} 값은 ${String(entry.min)}–${String(entry.max)} 범위여야 합니다.`,
            });
          }
        }
      }
      if (entryZones !== 1) {
        errors.push({
          field: "patternCombinationBlocks",
          message: "조합에는 진입 존 역할이 정확히 하나 필요합니다.",
        });
      }
      if (
        (form.patternCombinationOperator === "or" ||
          form.patternCombinationOperator === "sequence") &&
        blocks.length < 2
      ) {
        errors.push({
          field: "patternCombinationOperator",
          message: "OR/SEQUENCE 조합은 패턴 블록이 두 개 이상 필요합니다.",
        });
      }
      if (form.patternCombinationOperator === "sequence") {
        const sorted = [...orders].sort((a, b) => a - b);
        if (sorted.some((order, index) => order !== index)) {
          errors.push({
            field: "patternCombinationBlocks",
            message: "SEQUENCE 순서는 0부터 연속이어야 합니다.",
          });
        }
      }
      if (form.patternCombinationOperator === "weighted_score") {
        const threshold = Number(form.patternCombinationWeightedThreshold);
        if (
          !Number.isFinite(threshold) ||
          threshold <= 0 ||
          threshold > totalWeight
        ) {
          errors.push({
            field: "patternCombinationWeightedThreshold",
            message: `가중 임계값은 0보다 크고 총 가중치(${totalWeight}) 이하여야 합니다.`,
          });
        }
      }
    }
  }

  if (typeof form.maxSearchCount !== "string") {
    const budget = resolveCandidateBudget(form);
    if (!Number.isInteger(budget) || budget < 1) {
      errors.push({
        field: "candidateBudget",
        message: "탐색 전략 한도를 확인할 수 없습니다.",
      });
    }
  }

  return errors;
}

export type ConfigValidationSummary = {
  status: "ok" | "needs_fix" | "auto_correctable";
  labelKo: string;
  errors: FormFieldError[];
};

export function summarizeStrategySearchConfig(
  form: StrategySearchOperatorFormState,
): ConfigValidationSummary {
  const errors = validateStrategySearchForm(form);
  if (errors.length === 0) {
    return { status: "ok", labelKo: "정상", errors: [] };
  }
  const auto =
    errors.length > 0 &&
    errors.every(
      (e) =>
        e.field === "maxRuntime" ||
        e.message.includes("일치하지 않습니다"),
    );
  return {
    status: auto ? "auto_correctable" : "needs_fix",
    labelKo: auto ? "자동 보정 가능" : "수정 필요",
    errors,
  };
}

export type AppliedSettingsPreviewRow = {
  labelKo: string;
  valueKo: string;
  hintKo?: string;
};

export function formatRuntimeKo(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return "—";
  const minutes = Math.round(ms / 60_000);
  if (minutes >= 60 && minutes % 60 === 0) {
    return `${minutes / 60}시간`;
  }
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
  }
  return `${minutes}분`;
}

/** Operator-facing applied settings preview (no internal resource ceilings). */
export function buildAppliedSettingsPreview(
  form: StrategySearchOperatorFormState,
): {
  summary: ConfigValidationSummary;
  rows: AppliedSettingsPreviewRow[];
} {
  const summary = summarizeStrategySearchConfig(form);
  const depth = getDepthProfile(resolveDepthProfileId(form));
  const candidateBudget = resolveCandidateBudget(form);
  const rows: AppliedSettingsPreviewRow[] = [
    {
      labelKo: "심볼",
      valueKo: form.symbol || "—",
    },
    {
      labelKo: "타임프레임",
      valueKo: form.timeframe || "—",
    },
    {
      labelKo: "연구 시간",
      valueKo: formatRuntimeKo(resolveMaxRuntimeMs(form)),
    },
    {
      labelKo: "전략 패밀리",
      valueKo: form.autoStrategyCombo
        ? "자동 조합 (시스템 관리)"
        : form.selectedSpaceIds.length > 0
          ? form.selectedSpaceIds.join(", ")
          : "깊이 프로필 기본",
    },
    {
      labelKo: "선택 모드",
      valueKo:
        form.patternConfigLevel === "automatic" || form.autoStrategyCombo
          ? "automatic — 수동 포함 선택 미적용"
          : "manual — 선택 패밀리 유지",
    },
    {
      labelKo: "레버리지",
      valueKo:
        form.leverageMode === "fixed"
          ? `고정 ${form.leverageFixed}x`
          : form.leverageMode === "range"
            ? `범위 ${form.leverageMin}x–${form.leverageMax}x`
            : form.leverageMode === "disabled"
              ? "사용 안 함 (1x)"
              : "자동 추천",
    },
    {
      labelKo: "목표 수익",
      valueKo: form.minTotalReturn.trim()
        ? `${Number(form.minTotalReturn).toFixed(1)}%`
        : "프로필 기본",
    },
    {
      labelKo: "최대 낙폭",
      valueKo: form.maxMdd.trim()
        ? `${Number(form.maxMdd).toFixed(1)}%`
        : "프로필 기본",
    },
    {
      labelKo: "최소 거래",
      valueKo: form.minTradeCount.trim() || "프로필 기본",
    },
    {
      labelKo: "합격 프로필",
      valueKo: form.qualificationProfile,
    },
    {
      labelKo: "비용 스트레스",
      valueKo: form.stressEnabled ? "사용" : "미사용",
    },
    {
      labelKo: "견고성(지터)",
      valueKo: form.jitterEnabled ? "사용" : "미사용",
    },
    {
      labelKo: "패턴 설정",
      valueKo:
        form.patternConfigLevel === "automatic"
          ? "자동 추천"
          : [
              form.patternDirection,
              `리테스트 ${form.patternRetestMode}`,
              `강도 ${form.patternStrength}`,
              `확인 ${form.patternConfirmationMode}${
                form.patternConfirmationMode === "consecutive_closes" ||
                form.patternConfirmationMode === "threshold_count"
                  ? ` N=${form.patternConfirmationCandleCount}`
                  : ""
              }`,
            ].join(" · "),
    },
    {
      labelKo: "세대당 생성 수",
      valueKo: String(depth.stageBatchSize),
    },
    {
      labelKo: "초기 평가 묶음",
      valueKo: String(candidateBudget),
      hintKo:
        "마감 시간 모드에서는 예산이 소진되면 추가 묶음으로 보충될 수 있습니다. 총 평가 수가 아닙니다.",
    },
    {
      labelKo: "합격 목표",
      valueKo: String(resolveQualifiedTarget(form)),
    },
    {
      labelKo: "장기 저장 결과",
      valueKo: "TOP 10",
    },
  ];
  if (form.candidateBudgetOverride.trim() !== "") {
    rows.splice(rows.findIndex((r) => r.labelKo === "초기 평가 묶음") + 1, 0, {
      labelKo: "초기 평가 묶음(재정의)",
      valueKo: form.candidateBudgetOverride.trim(),
    });
  }
  return { summary, rows };
}

export function buildCreateBodyIfValid(
  form: StrategySearchOperatorFormState,
):
  | { ok: true; body: StrategySearchCreateJobBody }
  | { ok: false; errors: FormFieldError[] } {
  const errors = validateStrategySearchForm(form);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, body: operatorFormToCreateBody(form) };
}
