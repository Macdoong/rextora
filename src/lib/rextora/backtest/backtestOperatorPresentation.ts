/**
 * Backtest operator presentation — labels, formatting, and derived read-model only.
 * No trading, fee, slippage, MDD, or engine calculation authority.
 * Client-safe: no Node/fs.
 */

export const BACKTEST_OPERATOR_SAFE_STRATEGY_ID = "SAFE_v44_i4060";
export const BACKTEST_OPERATOR_UNAVAILABLE = "데이터 없음";
export const BACKTEST_OPERATOR_UNKNOWN_FAILURE_TITLE = "검증 실패";

export type BacktestOperatorResultContext = "current_run" | "saved_historical";

export type BacktestOperatorPageState =
  | "no_strategy"
  | "ready"
  | "running"
  | "loading"
  | "validation_failed"
  | "completed_valid"
  | "saved_historical"
  | "network_error";

export type BacktestOperatorFailurePresentation = {
  code: string;
  known: boolean;
  titleKo: string;
  reasonKo: string;
  failedWhatKo: string;
  nextActionKo: string;
};

export type BacktestOperatorTradeLike = {
  netPnlUsdt?: number | null;
  pnlPct?: number | null;
  feeCostUsdt?: number | null;
  entryTime?: number | null;
  exitTime?: number | null;
};

export type BacktestOperatorMonthlyLike = {
  month: string;
  returnPct: number;
  trades?: number;
  labelKo?: string;
  netPnlUsdt?: number;
};

export type BacktestOperatorReportLike = {
  strategyName?: string | null;
  strategyHash?: string | null;
  sourceParamsHash?: string | null;
  strategyId?: string | null;
  symbol?: string | null;
  symbols?: string[] | null;
  timeframe?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  requestedFrom?: string | null;
  requestedTo?: string | null;
  actualFirstCandleTime?: string | null;
  actualLastCandleTime?: string | null;
  candleCount?: number | null;
  totalReturn?: number | null;
  mdd?: number | null;
  tradeCount?: number | null;
  winRate?: number | null;
  averageTrade?: number | null;
  profitFactor?: number | null;
  maxConsecutiveLosses?: number | null;
  feeTotal?: number | null;
  feeImpact?: number | null;
  startingBalance?: number | null;
  endingBalance?: number | null;
  negativeMonths?: number | null;
  monthlyReturns?: BacktestOperatorMonthlyLike[] | null;
  costs?: {
    netPnLAfterCosts?: number | null;
    feeCostUsdt?: number | null;
    totalCostUsdt?: number | null;
    totalCostPctOfInitialCapital?: number | null;
  } | null;
  validation?: {
    paramsHashVerified?: boolean;
    feesApplied?: boolean;
    slippageApplied?: boolean;
    fundingApplied?: boolean;
    spreadApplied?: boolean;
    noRealOrders?: boolean;
  } | null;
  dataCoverage?: { sufficient?: boolean } | null;
};

export type BacktestOperatorSavedLike = {
  id?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
  status?: string | null;
  sourceType?: string | null;
  errorCode?: string | null;
  errorDetail?: string | null;
  resultHash?: string | null;
  engineVersion?: string | null;
  report?: BacktestOperatorReportLike | null;
};

export type BacktestOperatorDerivedTradeStats = {
  totalTrades: number;
  winningTrades: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  losingTrades: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  averageTradePnl: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  averageWinningTrade: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  averageLosingTrade: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  payoffRatio: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  profitFactor: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  maxConsecutiveLosses: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  maxConsecutiveWins: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  losingTradeFrequency: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
  feeBurdenUsdt: number | typeof BACKTEST_OPERATOR_UNAVAILABLE;
};

export type BacktestOperatorPeriodStats = {
  monthCount: number;
  profitableMonths: number;
  losingMonths: number;
  factualSummaryKo: string;
  bestMonth: BacktestOperatorMonthlyLike | null;
  worstMonth: BacktestOperatorMonthlyLike | null;
  rows: BacktestOperatorMonthlyLike[];
};

export type BacktestOperatorValidationCheck = {
  id: string;
  labelKo: string;
  status: "pass" | "fail" | "warn" | "info";
  statusLabelKo: string;
  explanationKo: string;
  technical?: string | null;
};

const KNOWN_FAILURES: Record<
  string,
  Omit<BacktestOperatorFailurePresentation, "code" | "known">
> = {
  FUTURE_DATA_BLOCKED: {
    titleKo: "미래 데이터가 포함되어 결과를 사용할 수 없습니다.",
    reasonKo: "선택한 종료일이 오늘 이후입니다. 미래 구간은 백테스트에 쓸 수 없습니다.",
    failedWhatKo: "미래 데이터 차단",
    nextActionKo: "종료일을 오늘 또는 그 이전으로 바꾼 뒤 다시 실행하세요.",
  },
  INVALID_DATE: {
    titleKo: "데이터 기간 검증 실패",
    reasonKo: "날짜 형식이 올바르지 않습니다.",
    failedWhatKo: "기간 입력",
    nextActionKo: "시작일과 종료일을 YYYY-MM-DD 형식으로 다시 선택하세요.",
  },
  INVALID_DATE_RANGE: {
    titleKo: "데이터 기간 검증 실패",
    reasonKo: "시작일이 종료일보다 같거나 뒤입니다.",
    failedWhatKo: "기간 범위",
    nextActionKo: "시작일을 종료일보다 이전으로 설정한 뒤 다시 실행하세요.",
  },
  DATA_RANGE_UNAVAILABLE: {
    titleKo: "데이터 기간 검증 실패",
    reasonKo: "요청한 구간의 시장 데이터를 사용할 수 없습니다.",
    failedWhatKo: "캔들 범위",
    nextActionKo: "데이터가 있는 기간으로 줄이거나 다른 심볼을 선택하세요.",
  },
  BACKTEST_DATA_COVERAGE_INSUFFICIENT: {
    titleKo: "데이터 기간 검증 실패",
    reasonKo: "요청 기간에 비해 실제 캔들 범위가 부족합니다.",
    failedWhatKo: "데이터 커버리지",
    nextActionKo: "실제 데이터가 있는 기간으로 좁힌 뒤 다시 실행하세요.",
  },
  STRATEGY_HASH_MISMATCH: {
    titleKo: "전략 설정값이 일치하지 않습니다.",
    reasonKo: "요청한 전략 해시가 저장된 전략과 다릅니다.",
    failedWhatKo: "전략 해시 / paramsHash",
    nextActionKo: "현재 저장된 전략을 다시 선택한 뒤 백테스트를 실행하세요.",
  },
  STRATEGY_VALIDATION_FAILED: {
    titleKo: "전략 정의 검증 실패",
    reasonKo: "전략 조건이 백테스트 실행 기준을 통과하지 못했습니다.",
    failedWhatKo: "전략 검증",
    nextActionKo: "전략 정의를 확인한 뒤 다시 실행하거나 재탐색하세요.",
  },
  STRATEGY_NOT_FOUND: {
    titleKo: "전략을 찾을 수 없습니다.",
    reasonKo: "선택한 전략 ID가 저장소에 없습니다.",
    failedWhatKo: "전략 식별",
    nextActionKo: "목록에서 존재하는 전략을 다시 선택하세요.",
  },
  STRATEGY_ID_REQUIRED: {
    titleKo: "전략이 선택되지 않았습니다.",
    reasonKo: "백테스트는 전략 ID 없이 실행하지 않습니다. SAFE로 대체하지 않습니다.",
    failedWhatKo: "전략 선택",
    nextActionKo: "전략을 선택한 뒤 실행하세요.",
  },
  TIMEFRAME_UNSUPPORTED: {
    titleKo: "지원하지 않는 타임프레임",
    reasonKo: "이 전략의 타임프레임으로는 백테스트를 실행할 수 없습니다.",
    failedWhatKo: "타임프레임",
    nextActionKo: "지원되는 타임프레임의 전략을 선택하세요.",
  },
  SYMBOL_UNSUPPORTED: {
    titleKo: "지원하지 않는 심볼",
    reasonKo: "선택한 심볼은 현재 백테스트 허용 목록에 없습니다.",
    failedWhatKo: "심볼",
    nextActionKo: "허용된 심볼로 바꾼 뒤 다시 실행하세요.",
  },
  SYMBOL_STRATEGY_INCOMPATIBLE: {
    titleKo: "전략과 심볼이 호환되지 않습니다.",
    reasonKo: "이 전략은 선택한 심볼에서 실행할 수 없습니다.",
    failedWhatKo: "심볼·전략 호환",
    nextActionKo: "전략이 허용하는 심볼을 선택하세요.",
  },
  INVALID_COST_ASSUMPTIONS: {
    titleKo: "비용 가정이 유효하지 않습니다.",
    reasonKo: "수수료·슬리피지 등 비용 입력이 백테스트 기준을 통과하지 못했습니다.",
    failedWhatKo: "비용 모델",
    nextActionKo: "시스템 비용 설정을 확인한 뒤 다시 실행하세요.",
  },
  BINANCE_FETCH_FAILED: {
    titleKo: "시장 데이터를 불러오지 못했습니다.",
    reasonKo: "캔들 조회가 실패했습니다.",
    failedWhatKo: "시장 데이터 조회",
    nextActionKo: "네트워크 상태를 확인한 뒤 같은 기간으로 다시 시도하세요.",
  },
  ENGINE_FAILURE: {
    titleKo: "백테스트 엔진 실행 실패",
    reasonKo: "시뮬레이션 엔진이 결과를 만들지 못했습니다.",
    failedWhatKo: "엔진 실행",
    nextActionKo: "입력을 확인한 뒤 다시 실행하세요. 결과는 새로 덮어쓰지 않습니다.",
  },
  LIVE_ORDER_BLOCKED: {
    titleKo: "실주문은 차단되어 있습니다.",
    reasonKo: "백테스트 경로는 실주문을 전송하지 않습니다.",
    failedWhatKo: "실주문 차단",
    nextActionKo: "백테스트만 실행하세요. 실전은 승인 게이트를 통과해야 합니다.",
  },
  CHART_HYDRATE_RANGE_MISSING: {
    titleKo: "차트 복원 기간이 없습니다.",
    reasonKo: "저장된 실행의 차트 기간을 확인하지 못했습니다.",
    failedWhatKo: "차트 복원",
    nextActionKo: "보고서·거래는 저장된 값을 사용하세요. 차트를 다시 불러보세요.",
  },
  CHART_HYDRATE_FAILED: {
    titleKo: "차트 데이터를 복원하지 못했습니다.",
    reasonKo: "저장된 실행의 차트 근거를 불러오지 못했습니다.",
    failedWhatKo: "차트 복원",
    nextActionKo: "보고서·거래 목록은 저장된 실행 기준입니다. 다시 불러보세요.",
  },
  MISSING_RUN_ID: {
    titleKo: "저장된 실행 ID가 없습니다.",
    reasonKo: "불러올 백테스트 실행 ID가 필요합니다.",
    failedWhatKo: "실행 식별",
    nextActionKo: "저장된 실행을 목록에서 선택하세요.",
  },
  NOT_FOUND: {
    titleKo: "저장된 백테스트 실행을 찾을 수 없습니다.",
    reasonKo: "요청한 실행 기록이 없습니다.",
    failedWhatKo: "저장 실행 조회",
    nextActionKo: "다른 실행을 선택하거나 새 백테스트를 실행하세요.",
  },
};

export function backtestOperatorUnavailableText(
  value: number | null | undefined,
): string {
  if (value == null || !Number.isFinite(value)) return BACKTEST_OPERATOR_UNAVAILABLE;
  return String(value);
}

export function backtestOperatorFormatNumber(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return BACKTEST_OPERATOR_UNAVAILABLE;
  return value.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function backtestOperatorFormatPct(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return BACKTEST_OPERATOR_UNAVAILABLE;
  return `${(value * 100).toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function backtestOperatorFormatUsdt(
  value: number | null | undefined,
  digits = 2,
): string {
  if (value == null || !Number.isFinite(value)) return BACKTEST_OPERATOR_UNAVAILABLE;
  return `${value.toLocaleString("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} USDT`;
}

export function backtestOperatorFormatCount(
  value: number | null | undefined,
): string {
  if (value == null || !Number.isFinite(value)) return BACKTEST_OPERATOR_UNAVAILABLE;
  return Math.trunc(value).toLocaleString("ko-KR");
}

export function backtestOperatorResultContextLabel(
  context: BacktestOperatorResultContext,
): string {
  return context === "saved_historical" ? "저장된 과거 결과" : "현재 실행 결과";
}

export function backtestOperatorResolveResultContext(input: {
  selectedRunId?: string | null;
  runJustCompleted?: boolean;
  sourceType?: string | null;
}): BacktestOperatorResultContext {
  if (input.runJustCompleted) return "current_run";
  if (input.selectedRunId && input.sourceType === "research_evaluation") {
    return "saved_historical";
  }
  if (input.selectedRunId && !input.runJustCompleted) return "saved_historical";
  return "current_run";
}

export function backtestOperatorStrategyTypeLabel(input: {
  strategyId?: string | null;
  locked?: boolean | null;
  hasEventSequence?: boolean | null;
  patternCombination?: string | null;
}): string {
  if (
    input.strategyId === BACKTEST_OPERATOR_SAFE_STRATEGY_ID ||
    input.locked === true
  ) {
    return "SAFE";
  }
  if (input.patternCombination) return "패턴 조합";
  if (input.hasEventSequence) return "패턴";
  return "일반";
}

export function backtestOperatorPageState(input: {
  strategyId?: string | null;
  running?: boolean;
  loading?: boolean;
  report?: BacktestOperatorReportLike | null;
  failureCode?: string | null;
  networkError?: boolean;
  historicalSelected?: boolean;
  eligible?: boolean | null;
}): BacktestOperatorPageState {
  if (input.networkError) return "network_error";
  if (input.failureCode) return "validation_failed";
  if (input.running) return "running";
  if (input.loading && !input.report) return "loading";
  if (!input.strategyId) return "no_strategy";
  if (!input.report) return "ready";
  if (input.historicalSelected) return "saved_historical";
  if (input.eligible === false) return "validation_failed";
  return "completed_valid";
}

export function backtestOperatorPageStateCopy(
  state: BacktestOperatorPageState,
): { titleKo: string; bodyKo: string } {
  switch (state) {
    case "no_strategy":
      return {
        titleKo: "전략을 선택하세요",
        bodyKo: "탐색 결과 또는 전략 목록에서 검토할 전략을 고르세요. SAFE로 자동 대체하지 않습니다.",
      };
    case "ready":
      return {
        titleKo: "백테스트를 실행할 수 있습니다",
        bodyKo: "심볼과 기간을 확인한 뒤 백테스트 실행을 누르세요.",
      };
    case "running":
      return {
        titleKo: "백테스트 실행 중",
        bodyKo: "이전 결과는 유지됩니다. 새 계산이 끝나면 이 자리가 갱신됩니다.",
      };
    case "loading":
      return {
        titleKo: "저장된 결과를 불러오는 중",
        bodyKo: "이전 화면 구조는 유지합니다. 숫자가 확정되기 전에는 새 값으로 바꾸지 않습니다.",
      };
    case "validation_failed":
      return {
        titleKo: "이 결과는 운영 결정에 사용할 수 없습니다",
        bodyKo: "실패 패널의 사유를 해소한 뒤 다시 실행하세요. 자동으로 모의매매가 시작되지 않습니다.",
      };
    case "completed_valid":
      return {
        titleKo: "백테스트가 완료되었고 검증을 통과했습니다",
        bodyKo: "성과와 위험을 검토한 뒤, 현재 제품이 허용하는 다음 단계만 진행하세요.",
      };
    case "saved_historical":
      return {
        titleKo: "저장된 과거 결과를 보고 있습니다",
        bodyKo: "이 수치는 당시 실행의 불변 기록입니다. 현재 실행과 섞지 마세요.",
      };
    case "network_error":
      return {
        titleKo: "백테스트 서버에 연결하지 못했습니다",
        bodyKo: "네트워크 상태를 확인한 뒤 다시 시도하세요. 저장된 기록은 수정되지 않습니다.",
      };
    default:
      return {
        titleKo: BACKTEST_OPERATOR_UNKNOWN_FAILURE_TITLE,
        bodyKo: BACKTEST_OPERATOR_UNAVAILABLE,
      };
  }
}

export function backtestOperatorFailurePresentation(
  code: string | null | undefined,
  detail?: string | null,
): BacktestOperatorFailurePresentation {
  const raw = code?.trim() || "";
  if (!raw) {
    return {
      code: "",
      known: false,
      titleKo: BACKTEST_OPERATOR_UNKNOWN_FAILURE_TITLE,
      reasonKo: detail?.trim() || "실패 코드가 기록되지 않았습니다.",
      failedWhatKo: "알 수 없는 검증",
      nextActionKo: "기술 상세의 원문을 확인한 뒤 입력을 재검토하세요.",
    };
  }
  const mapped = KNOWN_FAILURES[raw];
  if (!mapped) {
    return {
      code: raw,
      known: false,
      titleKo: BACKTEST_OPERATOR_UNKNOWN_FAILURE_TITLE,
      reasonKo: detail?.trim() || "이 코드에 대한 운영 설명을 만들지 않습니다.",
      failedWhatKo: "검증",
      nextActionKo: "기술 상세의 원본 코드를 확인하세요. 원인을 추정하지 않습니다.",
    };
  }
  return {
    code: raw,
    known: true,
    ...mapped,
    reasonKo: detail?.trim() ? `${mapped.reasonKo} ${detail.trim()}` : mapped.reasonKo,
  };
}

export function backtestOperatorParamsHashExplanation(verified: boolean): {
  titleKo: string;
  explanationKo: string;
} {
  if (verified) {
    return {
      titleKo: "전략 설정값 일치",
      explanationKo: "저장된 paramsHash가 이 실행과 일치하는 것으로 기록되어 있습니다.",
    };
  }
  return {
    titleKo: "전략 설정값이 일치하지 않습니다.",
    explanationKo:
      "paramsHash 검증이 통과하지 않았습니다. 저장된 전략을 다시 선택한 뒤 백테스트를 재실행하세요.",
  };
}

export function backtestOperatorUsableLabel(input: {
  eligible?: boolean | null;
  failureCode?: string | null;
  status?: string | null;
}): { usable: boolean; labelKo: string } {
  if (input.failureCode) {
    return { usable: false, labelKo: "사용 불가" };
  }
  if (input.status === "failed" || input.status === "cancelled") {
    return { usable: false, labelKo: "사용 불가" };
  }
  if (input.eligible === false) {
    return { usable: false, labelKo: "사용 불가" };
  }
  if (input.eligible === true) {
    return { usable: true, labelKo: "사용 가능" };
  }
  return { usable: false, labelKo: "판정 전" };
}

function finiteOrNull(value: number | null | undefined): number | null {
  return value == null || !Number.isFinite(value) ? null : value;
}

function tradeSignedPnl(trade: BacktestOperatorTradeLike): number | null {
  const usdt = finiteOrNull(trade.netPnlUsdt);
  if (usdt != null) return usdt;
  return finiteOrNull(trade.pnlPct);
}

export function backtestOperatorDeriveTradeStats(
  trades: readonly BacktestOperatorTradeLike[] | null | undefined,
  stored?: {
    tradeCount?: number | null;
    averageTrade?: number | null;
    profitFactor?: number | null;
    maxConsecutiveLosses?: number | null;
    feeTotal?: number | null;
    netPnl?: number | null;
  },
): BacktestOperatorDerivedTradeStats {
  const list = Array.isArray(trades) ? trades : [];
  const storedCount = finiteOrNull(stored?.tradeCount);
  const totalTrades = storedCount != null ? Math.trunc(storedCount) : list.length;

  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      averageTradePnl:
        stored?.averageTrade == null || !Number.isFinite(stored.averageTrade)
          ? BACKTEST_OPERATOR_UNAVAILABLE
          : stored.averageTrade,
      averageWinningTrade: BACKTEST_OPERATOR_UNAVAILABLE,
      averageLosingTrade: BACKTEST_OPERATOR_UNAVAILABLE,
      payoffRatio: BACKTEST_OPERATOR_UNAVAILABLE,
      profitFactor:
        stored?.profitFactor == null || !Number.isFinite(stored.profitFactor)
          ? BACKTEST_OPERATOR_UNAVAILABLE
          : stored.profitFactor,
      maxConsecutiveLosses:
        stored?.maxConsecutiveLosses == null ||
        !Number.isFinite(stored.maxConsecutiveLosses)
          ? 0
          : stored.maxConsecutiveLosses,
      maxConsecutiveWins: 0,
      losingTradeFrequency: BACKTEST_OPERATOR_UNAVAILABLE,
      feeBurdenUsdt:
        stored?.feeTotal == null || !Number.isFinite(stored.feeTotal)
          ? BACKTEST_OPERATOR_UNAVAILABLE
          : stored.feeTotal,
    };
  }

  const signed = list.map(tradeSignedPnl);
  const known = signed.filter((v): v is number => v != null);
  if (known.length === 0) {
    return {
      totalTrades,
      winningTrades: BACKTEST_OPERATOR_UNAVAILABLE,
      losingTrades: BACKTEST_OPERATOR_UNAVAILABLE,
      averageTradePnl:
        stored?.averageTrade == null || !Number.isFinite(stored.averageTrade)
          ? BACKTEST_OPERATOR_UNAVAILABLE
          : stored.averageTrade,
      averageWinningTrade: BACKTEST_OPERATOR_UNAVAILABLE,
      averageLosingTrade: BACKTEST_OPERATOR_UNAVAILABLE,
      payoffRatio: BACKTEST_OPERATOR_UNAVAILABLE,
      profitFactor:
        stored?.profitFactor == null || !Number.isFinite(stored.profitFactor)
          ? BACKTEST_OPERATOR_UNAVAILABLE
          : stored.profitFactor,
      maxConsecutiveLosses:
        stored?.maxConsecutiveLosses == null ||
        !Number.isFinite(stored.maxConsecutiveLosses)
          ? BACKTEST_OPERATOR_UNAVAILABLE
          : stored.maxConsecutiveLosses,
      maxConsecutiveWins: BACKTEST_OPERATOR_UNAVAILABLE,
      losingTradeFrequency: BACKTEST_OPERATOR_UNAVAILABLE,
      feeBurdenUsdt:
        stored?.feeTotal == null || !Number.isFinite(stored.feeTotal)
          ? BACKTEST_OPERATOR_UNAVAILABLE
          : stored.feeTotal,
    };
  }

  const wins = known.filter((v) => v > 0);
  const losses = known.filter((v) => v < 0);
  const winSum = wins.reduce((a, b) => a + b, 0);
  const lossAbs = losses.reduce((a, b) => a + Math.abs(b), 0);
  const avgWin = wins.length ? winSum / wins.length : null;
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : null;
  const derivedAvg =
    stored?.averageTrade != null && Number.isFinite(stored.averageTrade)
      ? stored.averageTrade
      : stored?.netPnl != null && Number.isFinite(stored.netPnl)
        ? stored.netPnl / totalTrades
        : known.reduce((a, b) => a + b, 0) / known.length;

  let maxLossStreak = 0;
  let maxWinStreak = 0;
  let lossStreak = 0;
  let winStreak = 0;
  for (const v of known) {
    if (v < 0) {
      lossStreak += 1;
      winStreak = 0;
      if (lossStreak > maxLossStreak) maxLossStreak = lossStreak;
    } else if (v > 0) {
      winStreak += 1;
      lossStreak = 0;
      if (winStreak > maxWinStreak) maxWinStreak = winStreak;
    } else {
      lossStreak = 0;
      winStreak = 0;
    }
  }

  const storedPf = finiteOrNull(stored?.profitFactor);
  const derivedPf = lossAbs > 0 ? winSum / lossAbs : wins.length ? Number.POSITIVE_INFINITY : 0;
  const profitFactor =
    storedPf != null
      ? storedPf
      : Number.isFinite(derivedPf)
        ? derivedPf
        : BACKTEST_OPERATOR_UNAVAILABLE;

  const storedMaxLoss = finiteOrNull(stored?.maxConsecutiveLosses);
  const feeFromTrades = list
    .map((t) => finiteOrNull(t.feeCostUsdt))
    .filter((v): v is number => v != null);
  const feeBurden =
    stored?.feeTotal != null && Number.isFinite(stored.feeTotal)
      ? stored.feeTotal
      : feeFromTrades.length
        ? feeFromTrades.reduce((a, b) => a + b, 0)
        : BACKTEST_OPERATOR_UNAVAILABLE;

  return {
    totalTrades,
    winningTrades: wins.length,
    losingTrades: losses.length,
    averageTradePnl: derivedAvg,
    averageWinningTrade: avgWin ?? BACKTEST_OPERATOR_UNAVAILABLE,
    averageLosingTrade: avgLoss ?? BACKTEST_OPERATOR_UNAVAILABLE,
    payoffRatio:
      avgWin != null && avgLoss != null && avgLoss !== 0
        ? Math.abs(avgWin / avgLoss)
        : BACKTEST_OPERATOR_UNAVAILABLE,
    profitFactor,
    maxConsecutiveLosses: storedMaxLoss ?? maxLossStreak,
    maxConsecutiveWins: maxWinStreak,
    losingTradeFrequency: known.length ? losses.length / known.length : BACKTEST_OPERATOR_UNAVAILABLE,
    feeBurdenUsdt: feeBurden,
  };
}

export function backtestOperatorPeriodStats(
  monthly: readonly BacktestOperatorMonthlyLike[] | null | undefined,
): BacktestOperatorPeriodStats | typeof BACKTEST_OPERATOR_UNAVAILABLE {
  const rows = Array.isArray(monthly) ? monthly.filter((r) => r && r.month) : [];
  if (rows.length === 0) return BACKTEST_OPERATOR_UNAVAILABLE;
  const profitableMonths = rows.filter((r) => Number.isFinite(r.returnPct) && r.returnPct > 0).length;
  const losingMonths = rows.filter((r) => Number.isFinite(r.returnPct) && r.returnPct < 0).length;
  let best = rows[0] ?? null;
  let worst = rows[0] ?? null;
  for (const row of rows) {
    if (best && Number.isFinite(row.returnPct) && row.returnPct > best.returnPct) best = row;
    if (worst && Number.isFinite(row.returnPct) && row.returnPct < worst.returnPct) {
      worst = row;
    }
  }
  return {
    monthCount: rows.length,
    profitableMonths,
    losingMonths,
    factualSummaryKo: `${rows.length}개월 중 ${profitableMonths}개월 수익`,
    bestMonth: best,
    worstMonth: worst,
    rows,
  };
}

export function backtestOperatorNetPnl(
  report: BacktestOperatorReportLike | null | undefined,
): number | typeof BACKTEST_OPERATOR_UNAVAILABLE {
  const stored = finiteOrNull(report?.costs?.netPnLAfterCosts);
  if (stored != null) return stored;
  const start = finiteOrNull(report?.startingBalance);
  const end = finiteOrNull(report?.endingBalance);
  if (start != null && end != null) return end - start;
  return BACKTEST_OPERATOR_UNAVAILABLE;
}

export function backtestOperatorLoadingPreservesPrevious<T>(input: {
  previous: T | null | undefined;
  loading: boolean;
  next?: T | null;
}): { value: T | null; stale: boolean; fabricated: false } {
  if (input.next != null) {
    return { value: input.next, stale: false, fabricated: false };
  }
  if (input.loading && input.previous != null) {
    return { value: input.previous, stale: true, fabricated: false };
  }
  return { value: input.previous ?? null, stale: false, fabricated: false };
}

export function backtestOperatorRejectsExternalTelemetry(input: {
  usedSessionBalance?: unknown;
  usedGlobalAccount?: unknown;
  usedMockAccount?: unknown;
}): boolean {
  return (
    input.usedSessionBalance == null &&
    input.usedGlobalAccount == null &&
    input.usedMockAccount == null
  );
}

export function backtestOperatorValidationChecks(input: {
  report?: BacktestOperatorReportLike | null;
  strategyId?: string | null;
  paramsHash?: string | null;
  failureCode?: string | null;
}): BacktestOperatorValidationCheck[] {
  const report = input.report;
  const validation = report?.validation;
  const params = backtestOperatorParamsHashExplanation(
    validation?.paramsHashVerified === true,
  );
  const coverageOk = report?.dataCoverage == null || report.dataCoverage.sufficient !== false;
  const futureBlocked = input.failureCode === "FUTURE_DATA_BLOCKED";
  const tradeCount = finiteOrNull(report?.tradeCount);
  const safe =
    input.strategyId === BACKTEST_OPERATOR_SAFE_STRATEGY_ID;

  return [
    {
      id: "strategy_hash",
      labelKo: "전략 해시",
      status: report?.strategyHash ? "pass" : "warn",
      statusLabelKo: report?.strategyHash ? "기록됨" : "없음",
      explanationKo: report?.strategyHash
        ? "이 실행에 전략 해시가 저장되어 있습니다."
        : "전략 해시가 이 기록에 없습니다.",
      technical: report?.strategyHash ?? null,
    },
    {
      id: "params_hash",
      labelKo: "paramsHash",
      status: validation?.paramsHashVerified ? "pass" : "fail",
      statusLabelKo: validation?.paramsHashVerified ? "일치" : "불일치",
      explanationKo: params.explanationKo,
      technical: input.paramsHash ?? report?.sourceParamsHash ?? null,
    },
    {
      id: "safe_protection",
      labelKo: "SAFE 보호",
      status: "info",
      statusLabelKo: safe ? "보호 대상" : "해당 없음",
      explanationKo: safe
        ? "이 전략은 보호 기준 SAFE입니다. 백테스트 화면에서 정의를 바꾸지 않습니다."
        : "선택한 전략은 SAFE가 아닙니다. SAFE 정의는 이 화면에서 변경되지 않습니다.",
      technical: BACKTEST_OPERATOR_SAFE_STRATEGY_ID,
    },
    {
      id: "fee_model",
      labelKo: "수수료 모델",
      status: validation?.feesApplied ? "pass" : "warn",
      statusLabelKo: validation?.feesApplied ? "적용됨" : "미적용 기록",
      explanationKo: validation?.feesApplied
        ? "이 실행 기록에 수수료 적용이 표시되어 있습니다."
        : "수수료 적용 여부가 이 기록에 없거나 거짓입니다.",
    },
    {
      id: "candle_range",
      labelKo: "캔들 범위",
      status: coverageOk && (report?.candleCount ?? 0) > 0 ? "pass" : "fail",
      statusLabelKo: coverageOk ? "확인됨" : "부족",
      explanationKo: coverageOk
        ? `요청 ${report?.requestedFrom ?? report?.fromDate ?? "—"} → ${report?.requestedTo ?? report?.toDate ?? "—"} · 실제 캔들 ${backtestOperatorFormatCount(report?.candleCount)}.`
        : "요청 기간 대비 실제 캔들 범위가 부족합니다.",
    },
    {
      id: "future_data",
      labelKo: "미래 데이터 차단",
      status: futureBlocked ? "fail" : "pass",
      statusLabelKo: futureBlocked ? "차단됨" : "통과",
      explanationKo: futureBlocked
        ? "미래 데이터가 포함되어 결과를 사용할 수 없습니다."
        : "이 실행은 미래 구간으로 거부되지 않았습니다.",
    },
    {
      id: "trade_count",
      labelKo: "거래 수",
      status: tradeCount == null ? "warn" : tradeCount === 0 ? "warn" : "pass",
      statusLabelKo: tradeCount == null ? "없음" : `${tradeCount}건`,
      explanationKo:
        tradeCount == null
          ? "거래 수가 기록되어 있지 않습니다."
          : tradeCount === 0
            ? "완료된 거래가 0건입니다. 성과 지표를 과대해석하지 마세요."
            : `완료된 거래 ${tradeCount}건이 이 실행에 기록되어 있습니다.`,
    },
    {
      id: "no_real_orders",
      labelKo: "실주문 없음",
      status: validation?.noRealOrders === true ? "pass" : "warn",
      statusLabelKo: validation?.noRealOrders === true ? "확인" : "미기록",
      explanationKo:
        validation?.noRealOrders === true
          ? "이 실행은 실주문을 내지 않은 시뮬레이션으로 기록되어 있습니다."
          : "실주문 없음 표시가 이 기록에 없습니다.",
    },
    {
      id: "slippage",
      labelKo: "슬리피지 적용 기록",
      status: validation?.slippageApplied ? "pass" : "info",
      statusLabelKo: validation?.slippageApplied ? "적용됨" : "미적용 기록",
      explanationKo: validation?.slippageApplied
        ? "슬리피지 적용이 이 실행 기록에 표시되어 있습니다."
        : "슬리피지 적용 여부가 거짓이거나 없습니다.",
    },
  ];
}

export function backtestOperatorNextAction(input: {
  state: BacktestOperatorPageState;
  recommendedNextActionKo?: string | null;
  failure?: BacktestOperatorFailurePresentation | null;
}): string {
  if (input.state === "running") {
    return "실행이 끝날 때까지 기다리세요. 이전 결과는 참고용으로 유지됩니다.";
  }
  if (input.state === "loading") {
    return "저장된 결과를 불러오는 중입니다.";
  }
  if (input.state === "no_strategy") {
    return "전략을 먼저 선택하세요.";
  }
  if (input.state === "ready") {
    return "기간을 확인한 뒤 백테스트 실행을 누르세요.";
  }
  if (input.state === "network_error") {
    return "연결을 확인한 뒤 다시 시도하세요.";
  }
  if (input.failure) return input.failure.nextActionKo;
  if (input.recommendedNextActionKo?.trim()) return input.recommendedNextActionKo;
  if (input.state === "saved_historical") {
    return "이 기록은 과거 실행입니다. 새 판단을 하려면 현재 조건으로 다시 실행하세요.";
  }
  return "결과를 검토하세요. 모의매매는 자동으로 시작되지 않습니다.";
}

export type BacktestOperatorPageContext = {
  source: "backtest";
  strategyId: string | null;
  runId: string | null;
  symbol: string | null;
  timeframe: string | null;
  statusLabel: string | null;
};

export function backtestOperatorShellContext(input: {
  routeIsBacktest: boolean;
  backtestContext: BacktestOperatorPageContext | null;
}): {
  strategy: string | null;
  runId: string | null;
  symbolTimeframe: string | null;
  researchJobId: null;
  paperSessionLabel: string;
  usedBacktestPageContext: boolean;
} {
  if (!input.routeIsBacktest) {
    return {
      strategy: null,
      runId: null,
      symbolTimeframe: null,
      researchJobId: null,
      paperSessionLabel: "Not selected",
      usedBacktestPageContext: false,
    };
  }
  const ctx = input.backtestContext;
  const strategy = ctx?.strategyId?.trim() || null;
  const runId = ctx?.runId?.trim() || null;
  const symbol = ctx?.symbol?.trim() || null;
  const timeframe = ctx?.timeframe?.trim() || null;
  const symbolTimeframe =
    symbol && timeframe ? `${symbol} · ${timeframe}` : symbol || timeframe || null;
  return {
    strategy,
    runId,
    symbolTimeframe,
    researchJobId: null,
    paperSessionLabel: "Not selected",
    usedBacktestPageContext: true,
  };
}

export function backtestOperatorCompactStatusLabel(input: {
  failure?: boolean;
  eligible?: boolean | null;
}): string {
  if (input.failure) return "검증 실패";
  if (input.eligible === false) return "부적격";
  if (input.eligible === true) return "적격";
  return "검증 전";
}

export const BACKTEST_OPERATOR_SECONDARY_VERDICT_POINTER =
  "자세한 사유는 판정 요약을 확인하세요.";

export const BACKTEST_OPERATOR_ANALYSIS_VIEWS = [
  { id: "summary", label: "요약" },
  { id: "trades", label: "거래 분석" },
  { id: "period", label: "기간별 성과" },
  { id: "risk", label: "위험 분석" },
  { id: "validation", label: "검증 상세" },
] as const;

export type BacktestOperatorAnalysisViewId =
  (typeof BACKTEST_OPERATOR_ANALYSIS_VIEWS)[number]["id"];

export function backtestOperatorPrimaryVerdictReason(input: {
  failureTitle?: string | null;
  reasonLabel?: string | null;
  verdictLabel?: string | null;
  eligible?: boolean | null;
}): string {
  if (input.failureTitle?.trim()) return input.failureTitle.trim();
  if (input.eligible === false) {
    return (
      input.reasonLabel?.trim() ||
      input.verdictLabel?.trim() ||
      BACKTEST_OPERATOR_UNKNOWN_FAILURE_TITLE
    );
  }
  return "해당 없음";
}

export function backtestOperatorChartIdentity(input: {
  selectedRunId?: string | null;
  strategyHash?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  symbol?: string | null;
}): string {
  return [
    input.selectedRunId || "live",
    input.strategyHash || "",
    input.fromDate || "",
    input.toDate || "",
    input.symbol || "",
  ].join(":");
}
