/**
 * Weakness analysis for Strategy Search candidates.
 * Uses only verified trial metrics — never fabricates unavailable fields.
 */

export type StrategyWeaknessCategory =
  | "excessive_drawdown"
  | "insufficient_trades"
  | "excessive_trades"
  | "fee_sensitive"
  | "slippage_sensitive"
  | "unstable_parameters"
  | "poor_return"
  | "low_win_rate"
  | "low_profit_factor"
  | "stress_failed"
  | "jitter_failed";

export interface StrategyWeaknessFinding {
  category: StrategyWeaknessCategory;
  severity: "low" | "medium" | "high";
  messageKo: string;
  metricKey: string;
  metricValue: number | null;
  available: boolean;
}

export interface StrategySearchAdjustmentPlan {
  version: 1;
  actions: Array<{
    type:
      | "prefer_lower_mdd"
      | "prefer_more_trades"
      | "prefer_fewer_trades"
      | "widen_entry_filters"
      | "tighten_risk"
      | "raise_cost_guard"
      | "advance_family"
      | "continue_runtime";
    reasonKo: string;
  }>;
  nextFamilyHint: string | null;
}

export interface CandidateMetricsSnapshot {
  paramsHash: string;
  totalReturn: number | null;
  mdd: number | null;
  trades: number | null;
  winRate: number | null;
  profitFactor: number | null;
  feeCost: number | null;
  slippageCost: number | null;
  passed: boolean;
  stressPassed: boolean | null;
  jitterPassed: boolean | null;
  score: number | null;
}

export interface WeaknessAnalysisResult {
  version: 1;
  analyzedAt: string;
  sourceCandidateHash: string | null;
  findings: StrategyWeaknessFinding[];
  adjustment: StrategySearchAdjustmentPlan;
  strengthsKo: string[];
  weaknessesKo: string[];
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Build a snapshot from a search trial-like record. */
export function snapshotFromTrial(trial: {
  paramsHash: string;
  passed: boolean;
  score: number | null;
  windowResults?: Array<Record<string, unknown>>;
  costStressResults?: Array<Record<string, unknown>>;
  jitterResults?: Array<Record<string, unknown>>;
}): CandidateMetricsSnapshot {
  const primary = trial.windowResults?.[0] ?? null;
  const stress = trial.costStressResults ?? [];
  const jitter = trial.jitterResults ?? [];
  const stressPassed =
    stress.length === 0
      ? null
      : stress.every((r) => r.passed === true || r.ok === true);
  const jitterPassed =
    jitter.length === 0
      ? null
      : jitter.every((r) => r.passed === true || r.ok === true);
  return {
    paramsHash: trial.paramsHash,
    totalReturn: primary ? num(primary.totalReturn) : null,
    mdd: primary ? num(primary.mdd) : null,
    trades: primary ? num(primary.trades) : null,
    winRate: primary ? num(primary.winRate) : null,
    profitFactor: primary ? num(primary.profitFactor) : null,
    feeCost: primary ? num(primary.feeTotal) ?? num(primary.fees) : null,
    slippageCost:
      primary ? num(primary.slippageTotal) ?? num(primary.slippage) : null,
    passed: trial.passed,
    stressPassed,
    jitterPassed,
    score: trial.score,
  };
}

/**
 * Analyze weaknesses of the current best (or latest) candidate.
 * Missing metrics are reported as unavailable — never inferred.
 */
export function analyzeCandidateWeaknesses(
  snap: CandidateMetricsSnapshot | null,
  opts?: {
    maxMddAbs?: number | null;
    minTrades?: number | null;
    maxTrades?: number | null;
    nextFamilyLabelKo?: string | null;
  },
): WeaknessAnalysisResult {
  const findings: StrategyWeaknessFinding[] = [];
  const strengthsKo: string[] = [];
  const weaknessesKo: string[] = [];
  const maxMdd = opts?.maxMddAbs ?? 0.25;
  const minTrades = opts?.minTrades ?? 5;
  const maxTrades = opts?.maxTrades ?? 400;

  if (!snap) {
    return {
      version: 1,
      analyzedAt: new Date().toISOString(),
      sourceCandidateHash: null,
      findings: [
        {
          category: "poor_return",
          severity: "medium",
          messageKo: "아직 분석할 합격 후보가 없습니다.",
          metricKey: "candidate",
          metricValue: null,
          available: false,
        },
      ],
      adjustment: {
        version: 1,
        actions: [
          {
            type: "continue_runtime",
            reasonKo: "시간 예산 내에서 후보 생성을 계속합니다.",
          },
          {
            type: "advance_family",
            reasonKo: "다음 전략 패밀리로 탐색 범위를 확장합니다.",
          },
        ],
        nextFamilyHint: opts?.nextFamilyLabelKo ?? null,
      },
      strengthsKo: [],
      weaknessesKo: ["분석 대상 후보 없음"],
    };
  }

  if (snap.mdd == null) {
    findings.push({
      category: "excessive_drawdown",
      severity: "low",
      messageKo: "최대 낙폭(MDD) 지표를 사용할 수 없습니다.",
      metricKey: "mdd",
      metricValue: null,
      available: false,
    });
  } else if (Math.abs(snap.mdd) > maxMdd) {
    findings.push({
      category: "excessive_drawdown",
      severity: "high",
      messageKo: `최대 낙폭이 한도(${(maxMdd * 100).toFixed(1)}%)를 초과합니다.`,
      metricKey: "mdd",
      metricValue: snap.mdd,
      available: true,
    });
    weaknessesKo.push("낙폭 과다");
  } else {
    strengthsKo.push("낙폭 통제");
  }

  if (snap.trades == null) {
    findings.push({
      category: "insufficient_trades",
      severity: "low",
      messageKo: "거래 수 지표를 사용할 수 없습니다.",
      metricKey: "trades",
      metricValue: null,
      available: false,
    });
  } else if (snap.trades < minTrades) {
    findings.push({
      category: "insufficient_trades",
      severity: "medium",
      messageKo: `거래 수(${snap.trades})가 목표(${minTrades})보다 적습니다.`,
      metricKey: "trades",
      metricValue: snap.trades,
      available: true,
    });
    weaknessesKo.push("거래 부족");
  } else if (snap.trades > maxTrades) {
    findings.push({
      category: "excessive_trades",
      severity: "medium",
      messageKo: `거래 수(${snap.trades})가 과다할 수 있습니다.`,
      metricKey: "trades",
      metricValue: snap.trades,
      available: true,
    });
    weaknessesKo.push("과매매 가능");
  } else {
    strengthsKo.push("거래 빈도 적정");
  }

  if (snap.totalReturn == null) {
    findings.push({
      category: "poor_return",
      severity: "low",
      messageKo: "수익률 지표를 사용할 수 없습니다.",
      metricKey: "totalReturn",
      metricValue: null,
      available: false,
    });
  } else if (snap.totalReturn <= 0) {
    findings.push({
      category: "poor_return",
      severity: "high",
      messageKo: "순수익률이 음수이거나 0입니다.",
      metricKey: "totalReturn",
      metricValue: snap.totalReturn,
      available: true,
    });
    weaknessesKo.push("수익 부족");
  } else {
    strengthsKo.push("양의 수익");
  }

  if (snap.winRate == null) {
    findings.push({
      category: "low_win_rate",
      severity: "low",
      messageKo: "승률 지표를 사용할 수 없습니다.",
      metricKey: "winRate",
      metricValue: null,
      available: false,
    });
  } else if (snap.winRate < 0.4) {
    findings.push({
      category: "low_win_rate",
      severity: "medium",
      messageKo: `승률(${(snap.winRate * 100).toFixed(1)}%)이 낮습니다.`,
      metricKey: "winRate",
      metricValue: snap.winRate,
      available: true,
    });
    weaknessesKo.push("낮은 승률");
  }

  if (snap.profitFactor == null) {
    findings.push({
      category: "low_profit_factor",
      severity: "low",
      messageKo: "손익비(profit factor)를 사용할 수 없습니다.",
      metricKey: "profitFactor",
      metricValue: null,
      available: false,
    });
  } else if (snap.profitFactor < 1) {
    findings.push({
      category: "low_profit_factor",
      severity: "high",
      messageKo: `손익비가 1 미만입니다 (${snap.profitFactor.toFixed(2)}).`,
      metricKey: "profitFactor",
      metricValue: snap.profitFactor,
      available: true,
    });
    weaknessesKo.push("손익비 부족");
  }

  if (snap.stressPassed === false) {
    findings.push({
      category: "stress_failed",
      severity: "high",
      messageKo: "비용 스트레스 검증을 통과하지 못했습니다.",
      metricKey: "stressPassed",
      metricValue: 0,
      available: true,
    });
    weaknessesKo.push("비용 민감");
  } else if (snap.stressPassed === true) {
    strengthsKo.push("비용 스트레스 통과");
  } else {
    findings.push({
      category: "fee_sensitive",
      severity: "low",
      messageKo: "비용 스트레스 결과가 없습니다.",
      metricKey: "stressPassed",
      metricValue: null,
      available: false,
    });
  }

  if (snap.jitterPassed === false) {
    findings.push({
      category: "jitter_failed",
      severity: "high",
      messageKo: "파라미터 지터(안정성) 검증을 통과하지 못했습니다.",
      metricKey: "jitterPassed",
      metricValue: 0,
      available: true,
    });
    weaknessesKo.push("파라미터 불안정");
  } else if (snap.jitterPassed === true) {
    strengthsKo.push("지터 안정성 통과");
  } else {
    findings.push({
      category: "unstable_parameters",
      severity: "low",
      messageKo: "지터 검증 결과가 없습니다.",
      metricKey: "jitterPassed",
      metricValue: null,
      available: false,
    });
  }

  const actions: StrategySearchAdjustmentPlan["actions"] = [
    {
      type: "continue_runtime",
      reasonKo: "설정된 연구 시간이 끝날 때까지 탐색을 계속합니다.",
    },
  ];
  if (findings.some((f) => f.category === "excessive_drawdown" && f.available)) {
    actions.push({
      type: "tighten_risk",
      reasonKo: "낙폭을 줄이기 위해 손절·포지션 관련 범위를 보수적으로 조정합니다.",
    });
    actions.push({
      type: "prefer_lower_mdd",
      reasonKo: "다음 세대에서 MDD 가중치를 높입니다.",
    });
  }
  if (findings.some((f) => f.category === "insufficient_trades" && f.available)) {
    actions.push({
      type: "widen_entry_filters",
      reasonKo: "진입 조건을 완화해 거래 기회를 늘립니다.",
    });
    actions.push({
      type: "prefer_more_trades",
      reasonKo: "거래 수 목표에 더 가까운 후보를 선호합니다.",
    });
  }
  if (findings.some((f) => f.category === "excessive_trades" && f.available)) {
    actions.push({
      type: "prefer_fewer_trades",
      reasonKo: "과매매를 줄이기 위해 진입 필터를 강화합니다.",
    });
  }
  if (
    findings.some(
      (f) =>
        (f.category === "stress_failed" || f.category === "fee_sensitive") &&
        f.available,
    )
  ) {
    actions.push({
      type: "raise_cost_guard",
      reasonKo: "비용 민감도를 낮추기 위해 cost guard를 강화합니다.",
    });
  }
  actions.push({
    type: "advance_family",
    reasonKo: "다음 검증된 전략 패밀리로 탐색 공간을 전환합니다.",
  });

  return {
    version: 1,
    analyzedAt: new Date().toISOString(),
    sourceCandidateHash: snap.paramsHash,
    findings,
    adjustment: {
      version: 1,
      actions,
      nextFamilyHint: opts?.nextFamilyLabelKo ?? null,
    },
    strengthsKo,
    weaknessesKo,
  };
}
