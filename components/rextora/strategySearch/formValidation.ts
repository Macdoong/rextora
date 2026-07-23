import type { StrategySearchCreateJobBody } from "./types";
import {
  OPERATOR_SUPPORTED_SYMBOLS,
  OPERATOR_SUPPORTED_TIMEFRAMES,
  operatorFormToCreateBody,
  resolveCandidateBudget,
  resolveQualifiedTarget,
  resolveSymbol,
  type StrategySearchOperatorFormState,
} from "./formDefaults";

export interface FormFieldError {
  field: string;
  message: string;
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
        message: "후보 예산은 1 이상의 정수여야 합니다.",
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

  if (typeof form.maxSearchCount !== "string") {
    const budget = resolveCandidateBudget(form);
    if (!Number.isInteger(budget) || budget < 1) {
      errors.push({
        field: "candidateBudget",
        message: "후보 예산을 확인할 수 없습니다.",
      });
    }
  }

  return errors;
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
