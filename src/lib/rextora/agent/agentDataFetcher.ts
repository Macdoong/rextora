/**
 * Agent Data Fetcher — server-side only.
 * Reads real data from existing stores. Never calls HTTP APIs.
 * Never fabricates or estimates values.
 */

import type {
  AgentIntentType,
  AgentLifecycleContext,
  AgentScope,
  FactItem,
  FactSource,
} from "./types";

const NOW = () => new Date().toISOString();

function fact(
  labelKo: string,
  value: string,
  source: FactSource,
): FactItem {
  return { labelKo, value, source, fetchedAt: NOW() };
}

function pct(value: number | null | undefined, digits = 2): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${(Math.abs(value) <= 1 ? value * 100 : value).toFixed(digits)}%`;
}

function mddPct(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${(Math.abs(value) * 100).toFixed(2)}%`;
}

function normalizeSymbolNeedle(symbol: string): string {
  return symbol.toUpperCase().replace(/USDT$/, "");
}

function symbolMatches(candidate: string | null | undefined, needle: string): boolean {
  if (!candidate) return false;
  const c = candidate.toUpperCase();
  const n = normalizeSymbolNeedle(needle);
  return c.includes(n);
}

type StrategyLike = {
  id: string;
  name: string;
  description?: string;
  paperActive?: boolean;
  liveEligible?: boolean;
  timeframe?: string;
  lastBacktest?: {
    totalReturn: number;
    mdd: number;
    trades: number;
    winRate: number;
  };
  definition?: { symbols?: string[] } | null;
};

function strategyMatchesSymbol(strategy: StrategyLike, needle: string): boolean {
  const n = normalizeSymbolNeedle(needle);
  const defs = strategy.definition?.symbols ?? [];
  if (defs.some((s) => symbolMatches(s, n))) return true;
  if (strategy.description && symbolMatches(strategy.description, n)) return true;
  if (symbolMatches(strategy.name, n)) return true;
  return false;
}

// ─── Lifecycle context facts ──────────────────────────────────────────────────

export function fetchLifecycleContextFacts(
  context?: AgentLifecycleContext | null,
): FactItem[] {
  if (!context) return [];
  const facts: FactItem[] = [];
  if (context.route) {
    facts.push(fact("현재 화면", context.route, "lifecycle_context"));
  }
  if (context.strategyId) {
    facts.push(fact("선택 전략 ID", context.strategyId, "lifecycle_context"));
  }
  if (context.runId) {
    facts.push(fact("선택 백테스트 실행", context.runId, "lifecycle_context"));
  }
  if (context.jobId) {
    facts.push(fact("선택 탐색 작업", context.jobId, "lifecycle_context"));
  }
  if (context.paperSessionId) {
    facts.push(fact("모의매매 세션", context.paperSessionId, "lifecycle_context"));
  }
  if (context.symbol) {
    facts.push(fact("선택 심볼", context.symbol, "lifecycle_context"));
  }
  if (context.timeframe) {
    facts.push(fact("선택 타임프레임", context.timeframe, "lifecycle_context"));
  }
  return facts;
}

export function buildScopeFromContext(
  context?: AgentLifecycleContext | null,
  extras?: Partial<AgentScope>,
): AgentScope {
  return {
    route: context?.route ?? extras?.route ?? null,
    strategyId: context?.strategyId ?? extras?.strategyId ?? null,
    runId: context?.runId ?? extras?.runId ?? null,
    jobId: context?.jobId ?? extras?.jobId ?? null,
    paperSessionId: context?.paperSessionId ?? extras?.paperSessionId ?? null,
    symbol: context?.symbol ?? extras?.symbol ?? null,
    timeframe: context?.timeframe ?? extras?.timeframe ?? null,
  };
}

// ─── Search Status ────────────────────────────────────────────────────────────

export async function fetchSearchStatusFacts(): Promise<FactItem[]> {
  try {
    const { listSearchJobs } = await import(
      "@/src/lib/rextora/strategySearch/jobStore"
    );
    const jobs = listSearchJobs().slice(0, 20);
    const total = jobs.length;
    const running = jobs.filter((j) => j.status === "running").length;
    const completed = jobs.filter((j) => j.status === "completed").length;
    const failed = jobs.filter((j) => j.status === "failed").length;
    const latestJob = jobs[0];

    const facts: FactItem[] = [
      fact("전체 탐색 작업", `${total}개`, "strategy_search_jobs"),
      fact("실행 중", `${running}개`, "strategy_search_jobs"),
      fact("완료됨", `${completed}개`, "strategy_search_jobs"),
    ];
    if (failed > 0) {
      facts.push(fact("실패", `${failed}개`, "strategy_search_jobs"));
    }
    if (latestJob) {
      facts.push(
        fact(
          "최근 작업 상태",
          latestJob.status === "running"
            ? "실행 중"
            : latestJob.status === "completed"
              ? "완료"
              : latestJob.status === "failed"
                ? "실패"
                : latestJob.status,
          "strategy_search_jobs",
        ),
      );
      const latestSymbol = latestJob.config?.symbols?.[0];
      if (latestSymbol) {
        facts.push(fact("최근 작업 심볼", latestSymbol, "strategy_search_jobs"));
      }
      facts.push(fact("최근 작업 ID", latestJob.id, "strategy_search_jobs"));
    }
    return facts;
  } catch {
    return [];
  }
}

async function fetchResearchBrainFacts(
  context?: AgentLifecycleContext | null,
): Promise<FactItem[]> {
  try {
    const { listSearchJobs } = await import("@/src/lib/rextora/strategySearch/jobStore");
    const { buildResearchResultsSummary } = await import("@/src/lib/rextora/strategySearch/researchResultsSummary");
    const {
      analyzeResearchGaps,
      evidenceFromResearchSummary,
      recommendNextResearch,
    } = await import("@/src/lib/rextora/agent/v2/research");
    const jobs = listSearchJobs();
    const job = jobs.find((item) => item.id === context?.jobId)
      ?? jobs.find((item) => item.status === "completed")
      ?? jobs[0];
    if (!job) return [fact("연구 분석", "분석할 저장 탐색이 없습니다.", "strategy_search_jobs")];
    const summary = buildResearchResultsSummary(job.id);
    const evidence = evidenceFromResearchSummary(summary);
    const gaps = analyzeResearchGaps(evidence);
    const recommendation = recommendNextResearch(evidence);
    const gapText = gaps.map((gap) => gap.summaryKo).join(" ");
    return [
      fact("연구 분석", recommendation.summaryKo, "strategy_search_jobs"),
      fact("연구 근거", evidence.length > 0
        ? `저장된 상위 결과 ${evidence.length}개와 누락 증거 ${gaps.length}개를 확인했습니다.`
        : `해당 탐색의 저장 결과를 확인했습니다. ${gapText || "비교 가능한 후보가 없습니다."}`,
      "strategy_search_jobs"),
      fact("권장 다음 작업", recommendation.kind === "backtest" ? "선택 후보 백테스트 검토" : "추가 탐색 증거 준비", "strategy_search_jobs"),
      fact("증거 참조", recommendation.evidenceRefs.join(", ") || job.id, "strategy_search_jobs"),
    ];
  } catch {
    return [fact("연구 분석", "저장된 연구 증거를 읽지 못했습니다.", "strategy_search_jobs")];
  }
}

// ─── Search failure explanation ───────────────────────────────────────────────

export async function fetchSearchFailureFacts(
  context?: AgentLifecycleContext | null,
): Promise<FactItem[]> {
  try {
    const { listSearchJobs, listSearchTrials, getSearchJob } = await import(
      "@/src/lib/rextora/strategySearch/jobStore"
    );

    let job =
      context?.jobId != null ? getSearchJob(context.jobId) : null;
    if (!job) {
      const jobs = listSearchJobs();
      job =
        jobs.find((j) => j.status === "failed") ??
        jobs.find((j) => j.status === "cancelled") ??
        jobs[0] ??
        null;
    }

    if (!job) {
      return [
        fact("실패 탐색 작업", "없음", "strategy_search_jobs"),
        fact("비교 가능", "아니오", "strategy_search_jobs"),
      ];
    }

    const facts: FactItem[] = [
      fact("탐색 작업 ID", job.id, "strategy_search_jobs"),
      fact("작업 상태", job.status, "strategy_search_jobs"),
    ];

    if (job.failureMessage) {
      facts.push(fact("실패 메시지", job.failureMessage, "strategy_search_jobs"));
    } else if (job.status === "failed") {
      facts.push(
        fact("실패 메시지", "기록된 실패 메시지 없음", "strategy_search_jobs"),
      );
    } else {
      facts.push(
        fact(
          "실패 메시지",
          `현재 상태(${job.status}) — 실패 작업이 아님`,
          "strategy_search_jobs",
        ),
      );
    }

    const symbol = job.config?.symbols?.[0];
    if (symbol) facts.push(fact("심볼", symbol, "strategy_search_jobs"));
    if (job.config?.timeframe) {
      facts.push(fact("타임프레임", job.config.timeframe, "strategy_search_jobs"));
    }

    const completedIterations = job.checkpoint?.completedIterations;
    if (typeof completedIterations === "number") {
      facts.push(
        fact("완료된 시도 수", `${completedIterations}회`, "strategy_search_jobs"),
      );
    }

    try {
      const trials = listSearchTrials(job.id);
      const rejected = trials.filter((t) => !t.passed).length;
      const passed = trials.filter((t) => t.passed).length;
      facts.push(fact("평가된 후보 수", `${trials.length}개`, "strategy_search_jobs"));
      facts.push(fact("통과 후보", `${passed}개`, "strategy_search_jobs"));
      facts.push(fact("거부 후보", `${rejected}개`, "strategy_search_jobs"));

      const topReasons = new Map<string, number>();
      for (const trial of trials) {
        for (const reason of trial.failureReasons ?? []) {
          const key = reason.code || reason.message || "unknown";
          topReasons.set(key, (topReasons.get(key) ?? 0) + 1);
        }
      }
      const ranked = [...topReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      if (ranked.length > 0) {
        facts.push(
          fact(
            "주요 거부 코드",
            ranked.map(([code, n]) => `${code}(${n})`).join(", "),
            "strategy_search_jobs",
          ),
        );
      }
    } catch {
      facts.push(fact("후보 평가 요약", "시험 기록 조회 불가", "strategy_search_jobs"));
    }

    return facts;
  } catch {
    return [];
  }
}

// ─── Strategy List ────────────────────────────────────────────────────────────

export async function fetchStrategyFacts(strategyHint?: string): Promise<FactItem[]> {
  try {
    const { listStrategies, ensureStrategyStore } = await import(
      "@/src/lib/rextora/strategy/strategyStore"
    );
    ensureStrategyStore();
    const all = listStrategies() as StrategyLike[];
    const total = all.length;
    const liveReady = all.filter((s) => s.liveEligible).length;
    const paperReady = all.filter((s) => s.paperActive);
    const safeStrategy = all.find(
      (s) =>
        s.name === "SAFE_v44" ||
        s.id === "safe_v44" ||
        s.id === "SAFE_v44_i4060" ||
        s.name.includes("SAFE_v44"),
    );

    const facts: FactItem[] = [
      fact("등록된 전략 수", `${total}개`, "strategy_store"),
      fact("실전 가능 후보", `${liveReady}개`, "strategy_store"),
      fact("모의매매 가능 전략", `${paperReady.length}개`, "strategy_store"),
    ];
    if (paperReady.length > 0) {
      facts.push(
        fact(
          "모의매매 전략 이름",
          paperReady
            .slice(0, 5)
            .map((strategy) => strategy.name)
            .join(", "),
          "strategy_store",
        ),
      );
    }

    if (safeStrategy) {
      facts.push(
        fact("SAFE 전략", "활성 (보호됨)", "strategy_store"),
        fact("SAFE 전략 ID", safeStrategy.id, "strategy_store"),
        fact("SAFE 전략 이름", safeStrategy.name, "strategy_store"),
      );
    }

    if (strategyHint) {
      const needle = strategyHint.toLowerCase();
      const matched = all.find(
        (s) =>
          s.name.toLowerCase().includes(needle) ||
          s.id.toLowerCase().includes(needle) ||
          needle.includes("safe"),
      );
      if (matched) {
        facts.push(
          fact("매칭된 전략", matched.name, "strategy_store"),
          fact(
            "전략 상태",
            matched.liveEligible ? "실전 가능 후보" : "검증 필요",
            "strategy_store",
          ),
        );
      }
    }

    return facts;
  } catch {
    return [];
  }
}

// ─── Symbol comparison (BTC vs ETH) ───────────────────────────────────────────

type BacktestLike = {
  id?: string;
  strategyId?: string;
  report?: {
    strategyId?: string;
    strategyName?: string;
    symbol?: string;
    timeframe?: string;
    totalReturn?: number;
    mdd?: number;
    tradeCount?: number;
    winRate?: number;
    profitFactor?: number;
  } | null;
};

function latestBacktestForSymbol(
  runs: BacktestLike[],
  symbol: string,
): BacktestLike | null {
  return (
    runs.find((b) => symbolMatches(b.report?.symbol, symbol)) ?? null
  );
}

function pushSymbolMetrics(
  facts: FactItem[],
  labelPrefix: string,
  run: BacktestLike | null,
): void {
  if (!run?.report) {
    facts.push(
      fact(`${labelPrefix} 최신 백테스트`, "없음", "backtest_store"),
    );
    return;
  }
  const r = run.report;
  facts.push(
    fact(
      `${labelPrefix} 최신 백테스트`,
      run.id ?? r.strategyId ?? "확인됨",
      "backtest_store",
    ),
  );
  if (r.strategyName) {
    facts.push(fact(`${labelPrefix} 전략 이름`, r.strategyName, "backtest_store"));
  }
  if (r.timeframe) {
    facts.push(fact(`${labelPrefix} 타임프레임`, r.timeframe, "backtest_store"));
  }
  const mdd = mddPct(r.mdd);
  if (mdd) facts.push(fact(`${labelPrefix} MDD`, mdd, "backtest_store"));
  if (r.winRate != null) {
    facts.push(
      fact(`${labelPrefix} 승률`, `${(r.winRate * 100).toFixed(1)}%`, "backtest_store"),
    );
  }
  if (r.profitFactor != null) {
    facts.push(
      fact(`${labelPrefix} 손익비`, r.profitFactor.toFixed(2), "backtest_store"),
    );
  }
  if (r.tradeCount != null) {
    facts.push(fact(`${labelPrefix} 거래 수`, `${r.tradeCount}회`, "backtest_store"));
  }
  const ret = pct(r.totalReturn);
  if (ret) facts.push(fact(`${labelPrefix} 수익률`, ret, "backtest_store"));
}

export async function fetchCompareFacts(
  symbolA?: string,
  symbolB?: string,
): Promise<FactItem[]> {
  try {
    const { listStrategies, ensureStrategyStore } = await import(
      "@/src/lib/rextora/strategy/strategyStore"
    );
    const { listSavedBacktests } = await import(
      "@/src/lib/rextora/backtest/backtestStore"
    );

    ensureStrategyStore();
    const strategies = listStrategies() as StrategyLike[];
    const runs = listSavedBacktests(50) as BacktestLike[];

    const a = (symbolA ?? "").toUpperCase();
    const b = (symbolB ?? "").toUpperCase();

    if (!a || !b) {
      return [
        fact(
          "비교 가능",
          "아니오 — 비교할 두 심볼이 질문에 명시되지 않음",
          "backtest_store",
        ),
      ];
    }

    const strategiesA = strategies.filter((s) => strategyMatchesSymbol(s, a));
    const strategiesB = strategies.filter((s) => strategyMatchesSymbol(s, b));
    const runA = latestBacktestForSymbol(runs, a);
    const runB = latestBacktestForSymbol(runs, b);
    const paperA = strategiesA.filter((s) => s.paperActive);
    const paperB = strategiesB.filter((s) => s.paperActive);

    const facts: FactItem[] = [
      fact("비교 심볼 A", a, "backtest_store"),
      fact("비교 심볼 B", b, "backtest_store"),
      fact(`${a} 관련 전략 수`, `${strategiesA.length}개`, "strategy_store"),
      fact(`${b} 관련 전략 수`, `${strategiesB.length}개`, "strategy_store"),
      fact(
        `${a} 모의매매 가능`,
        paperA.length > 0
          ? `${paperA.length}개 (${paperA[0]!.name})`
          : "없음",
        "strategy_store",
      ),
      fact(
        `${b} 모의매매 가능`,
        paperB.length > 0
          ? `${paperB.length}개 (${paperB[0]!.name})`
          : "없음",
        "strategy_store",
      ),
    ];

    pushSymbolMetrics(facts, a, runA);
    pushSymbolMetrics(facts, b, runB);

    const canCompare = Boolean(runA?.report && runB?.report);
    facts.push(
      fact(
        "비교 가능",
        canCompare
          ? "예 — 양 심볼의 저장된 백테스트 지표 사용"
          : !runA?.report && !runB?.report
            ? `아니오 — ${a}/${b} 모두 검증된 백테스트 없음`
            : !runA?.report
              ? `아니오 — ${a} 검증 데이터 없음`
              : `아니오 — ${b} 검증 데이터 없음`,
        "backtest_store",
      ),
    );

    if (canCompare && runA?.report && runB?.report) {
      const mddA = Math.abs(runA.report.mdd ?? Number.POSITIVE_INFINITY);
      const mddB = Math.abs(runB.report.mdd ?? Number.POSITIVE_INFINITY);
      const pfA = runA.report.profitFactor ?? 0;
      const pfB = runB.report.profitFactor ?? 0;
      // Deterministic ranking hint from verified metrics only (not fabricated).
      let winner = "동등";
      if (pfA !== pfB) winner = pfA > pfB ? a : b;
      else if (mddA !== mddB) winner = mddA < mddB ? a : b;
      facts.push(fact("지표 우위 심볼", winner, "backtest_store"));
    }

    return facts;
  } catch {
    return [
      fact("비교 가능", "아니오 — 저장소 조회 실패", "backtest_store"),
    ];
  }
}

// ─── Backtest Summary ─────────────────────────────────────────────────────────

export async function fetchBacktestFacts(symbolHint?: string): Promise<FactItem[]> {
  try {
    const { listSavedBacktests } = await import(
      "@/src/lib/rextora/backtest/backtestStore"
    );
    const all = listSavedBacktests(20) as BacktestLike[];
    const filtered = symbolHint
      ? all.filter((b) => symbolMatches(b.report?.symbol, symbolHint))
      : all;
    const latest = filtered[0];

    if (!latest) {
      return [fact("저장된 백테스트", "없음", "backtest_store")];
    }

    const facts: FactItem[] = [
      fact("최근 백테스트 수", `${filtered.length}개`, "backtest_store"),
    ];
    if (latest.id) {
      facts.push(fact("최근 실행 ID", latest.id, "backtest_store"));
    }
    if (latest.strategyId || latest.report?.strategyId) {
      facts.push(
        fact(
          "전략 ID",
          String(latest.strategyId ?? latest.report?.strategyId),
          "backtest_store",
        ),
      );
    }

    if (latest.report) {
      const r = latest.report;
      if (r.symbol) facts.push(fact("심볼", r.symbol, "backtest_store"));
      if (r.timeframe) facts.push(fact("타임프레임", r.timeframe, "backtest_store"));
      if (r.totalReturn != null) {
        facts.push(
          fact(
            "총 수익률",
            `${(r.totalReturn * 100).toFixed(2)}%`,
            "backtest_store",
          ),
        );
      }
      if (r.mdd != null) {
        facts.push(
          fact("최대 낙폭(MDD)", mddPct(r.mdd)!, "backtest_store"),
        );
      }
      if (r.tradeCount != null) {
        facts.push(fact("거래 횟수", `${r.tradeCount}회`, "backtest_store"));
      }
      if (r.winRate != null) {
        facts.push(
          fact("승률", `${(r.winRate * 100).toFixed(1)}%`, "backtest_store"),
        );
      }
      if (r.profitFactor != null) {
        facts.push(
          fact("손익비", r.profitFactor.toFixed(2), "backtest_store"),
        );
      }

      // Cost fields — only when present on full report objects
      const costs = (r as { costs?: Record<string, number> }).costs;
      if (costs?.totalCostUsdt != null) {
        facts.push(
          fact(
            "총 거래 비용",
            `${costs.totalCostUsdt.toFixed(2)} USDT`,
            "backtest_store",
          ),
        );
      }
      if (costs?.totalCostPctOfInitialCapital != null) {
        facts.push(
          fact(
            "초기 자본 대비 비용",
            `${(costs.totalCostPctOfInitialCapital * 100).toFixed(2)}%`,
            "backtest_store",
          ),
        );
      }
      if (costs?.grossPnLBeforeCosts != null) {
        facts.push(
          fact(
            "비용 전 손익",
            `${costs.grossPnLBeforeCosts.toFixed(2)} USDT`,
            "backtest_store",
          ),
        );
      }
      if (costs?.netPnLAfterCosts != null) {
        facts.push(
          fact(
            "비용 후 손익",
            `${costs.netPnLAfterCosts.toFixed(2)} USDT`,
            "backtest_store",
          ),
        );
      }
    }

    return facts;
  } catch {
    return [];
  }
}

// ─── Risk / MDD Summary ───────────────────────────────────────────────────────

export async function fetchRiskFacts(): Promise<FactItem[]> {
  try {
    const { listSavedBacktests } = await import(
      "@/src/lib/rextora/backtest/backtestStore"
    );
    const all = listSavedBacktests(10);
    if (all.length === 0) {
      return [fact("백테스트 기반 리스크 데이터", "없음", "backtest_store")];
    }

    const mdds = all
      .map((b) => b.report?.mdd)
      .filter((v): v is number => v != null);
    const profitFactors = all
      .map((b) => b.report?.profitFactor)
      .filter((v): v is number => v != null);
    const returns = all
      .map((b) => b.report?.totalReturn)
      .filter((v): v is number => v != null);
    const winRates = all
      .map((b) => b.report?.winRate)
      .filter((v): v is number => v != null);

    const facts: FactItem[] = [
      fact("분석 대상 백테스트", `${all.length}개`, "backtest_store"),
    ];

    if (mdds.length > 0) {
      const avgMdd = mdds.reduce((sum, v) => sum + v, 0) / mdds.length;
      const maxMdd = Math.max(...mdds.map((v) => Math.abs(v)));
      facts.push(
        fact("평균 MDD", `${(Math.abs(avgMdd) * 100).toFixed(1)}%`, "backtest_store"),
        fact("최대 MDD", `${(maxMdd * 100).toFixed(1)}%`, "backtest_store"),
      );
    }
    if (profitFactors.length > 0) {
      const avg = profitFactors.reduce((sum, v) => sum + v, 0) / profitFactors.length;
      facts.push(fact("평균 손익비", avg.toFixed(2), "backtest_store"));
    }
    if (winRates.length > 0) {
      const avg = winRates.reduce((sum, v) => sum + v, 0) / winRates.length;
      facts.push(fact("평균 승률", `${(avg * 100).toFixed(1)}%`, "backtest_store"));
    }
    if (returns.length > 0) {
      const avg = returns.reduce((sum, v) => sum + v, 0) / returns.length;
      facts.push(
        fact("평균 수익률", `${(avg * 100).toFixed(2)}%`, "backtest_store"),
      );
    }

    return facts;
  } catch {
    return [];
  }
}

// ─── Paper start (read-only) ──────────────────────────────────────────────────

export async function fetchPaperStartFacts(
  context?: AgentLifecycleContext | null,
): Promise<FactItem[]> {
  try {
    const { listStrategies, ensureStrategyStore } = await import(
      "@/src/lib/rextora/strategy/strategyStore"
    );
    const { listSavedBacktests } = await import(
      "@/src/lib/rextora/backtest/backtestStore"
    );
    const { getActivePaperSessionService } = await import(
      "@/src/lib/rextora/paper/paperSessionService"
    );

    ensureStrategyStore();
    const strategies = listStrategies() as StrategyLike[];
    const paperReady = strategies.filter((s) => s.paperActive);
    const active = getActivePaperSessionService();
    const runs = listSavedBacktests(20) as BacktestLike[];

    const preferred =
      (context?.strategyId
        ? strategies.find((s) => s.id === context.strategyId)
        : null) ??
      paperReady[0] ??
      null;

    const facts: FactItem[] = [
      fact(
        "에이전트 Paper 실행",
        "차단 — 인간 승인 후 Paper 화면에서만 시작",
        "system_status",
      ),
      fact("모의매매 가능 전략", `${paperReady.length}개`, "strategy_store"),
    ];

    if (preferred) {
      facts.push(
        fact("후보 전략", preferred.name, "strategy_store"),
        fact("후보 전략 ID", preferred.id, "strategy_store"),
        fact(
          "후보 Paper 자격",
          preferred.paperActive ? "가능" : "불가",
          "strategy_store",
        ),
      );
      const related = runs.find(
        (r) =>
          (r.strategyId ?? r.report?.strategyId) === preferred.id,
      );
      if (related?.report) {
        if (related.id) {
          facts.push(fact("관련 백테스트", related.id, "backtest_store"));
        }
        const mdd = mddPct(related.report.mdd);
        if (mdd) facts.push(fact("관련 백테스트 MDD", mdd, "backtest_store"));
        if (related.report.tradeCount != null) {
          facts.push(
            fact(
              "관련 백테스트 거래 수",
              `${related.report.tradeCount}회`,
              "backtest_store",
            ),
          );
        }
      } else {
        facts.push(fact("관련 백테스트", "없음", "backtest_store"));
      }
    } else {
      facts.push(fact("후보 전략", "없음", "strategy_store"));
    }

    if (active) {
      facts.push(
        fact("활성 Paper 세션", active.id, "paper_session_store"),
        fact("Paper 세션 상태", active.status, "paper_session_store"),
        fact("Paper 세션 전략", active.strategyId, "paper_session_store"),
        fact(
          "Paper strategyHash",
          active.strategyHash,
          "paper_session_store",
        ),
        fact(
          "Paper 거래소 호출",
          active.exchangeCalled === false ? "없음 (시뮬레이션)" : "이상",
          "paper_session_store",
        ),
      );
    } else {
      facts.push(fact("활성 Paper 세션", "없음", "paper_session_store"));
    }

    facts.push(
      ...fetchLifecycleContextFacts(context).slice(0, 4),
    );

    return facts;
  } catch {
    return [
      fact(
        "에이전트 Paper 실행",
        "차단 — 인간 승인 후 Paper 화면에서만 시작",
        "system_status",
      ),
    ];
  }
}

// ─── Recommend next (lifecycle-aware, exactly one action) ─────────────────────

export async function fetchRecommendNextFacts(
  context?: AgentLifecycleContext | null,
): Promise<FactItem[]> {
  try {
    const firstRunFacts = await fetchFirstRunFacts();
    const mode = firstRunFacts.find((f) => f.labelKo === "최초 실행 모드")?.value;
    if (mode === "EMPTY" || mode === "DEMO_AVAILABLE") {
      return [
        ...firstRunFacts,
        fact("권장 다음 작업", "데모로 둘러보기", "system_status"),
        fact("권장 이동 경로", "/dashboard?firstRun=demo", "system_status"),
        fact("권장 작업 키", "navigate", "system_status"),
        fact(
          "권장 사유",
          "런타임 연구 데이터가 비어 있어 대시보드에서 데모 확인 후 시작할 수 있습니다.",
          "system_status",
        ),
        fact("보조 작업", "실제 전략 탐색 시작", "system_status"),
        fact("보조 이동 경로", "/strategy-search", "system_status"),
      ];
    }

    const [searchFacts, stratFacts, btFacts, paperFacts] = await Promise.all([
      fetchSearchStatusFacts(),
      fetchStrategyFacts(),
      fetchBacktestFacts(),
      fetchPaperStartFacts(context),
    ]);

    const lifecycle = fetchLifecycleContextFacts(context);

    const running = searchFacts.find((f) => f.labelKo === "실행 중")?.value;
    const failed = searchFacts.find((f) => f.labelKo === "실패")?.value;
    const completed = searchFacts.find((f) => f.labelKo === "완료됨")?.value;
    const paperCount = stratFacts.find((f) => f.labelKo === "모의매매 가능 전략")?.value;
    const btCount = btFacts.find((f) => f.labelKo === "최근 백테스트 수")?.value;
    const activePaper = paperFacts.find((f) => f.labelKo === "활성 Paper 세션")?.value;
    const bestName =
      btFacts.find((f) => f.labelKo === "전략 ID")?.value ??
      stratFacts.find((f) => f.labelKo === "모의매매 전략 이름")?.value;

    const runningNum = parseInt(running ?? "0", 10) || 0;
    const failedNum = parseInt(failed ?? "0", 10) || 0;
    const completedNum = parseInt(completed ?? "0", 10) || 0;
    const paperNum = parseInt(paperCount ?? "0", 10) || 0;
    const btNum = parseInt(btCount ?? "0", 10) || 0;
    const hasActivePaper = Boolean(activePaper && activePaper !== "없음");

    let nextKey = "open_search";
    let nextLabel = "전략 탐색 시작";
    let nextHref = "/strategy-search";
    let nextReason = "진행 중인 연구·백테스트·모의매매가 없어 탐색부터 시작합니다.";

    if (runningNum > 0) {
      nextKey = "open_results";
      nextLabel = "탐색 진행 상태 확인";
      nextHref = "/results";
      nextReason = "탐색이 실행 중이므로 완료 후 결과를 검토하세요.";
    } else if (failedNum > 0 && completedNum === 0) {
      nextKey = "open_search";
      nextLabel = "실패 탐색 원인 확인";
      nextHref = "/strategy-search";
      nextReason = "실패 탐색이 있어 원인 확인 후 재실행이 필요합니다.";
    } else if (completedNum > 0 && btNum === 0) {
      nextKey = "view_recommendation";
      nextLabel = "탐색 결과 추천 검토";
      nextHref = "/results";
      nextReason = "완료된 탐색이 있으므로 추천 후보를 검토하세요.";
    } else if (btNum > 0 && paperNum > 0 && !hasActivePaper) {
      nextKey = "open_paper";
      nextLabel = "모의매매 화면 열기";
      nextHref = "/paper-trading";
      nextReason =
        "검증된 백테스트와 Paper 가능 전략이 있어 승인 후 모의매매를 검토할 수 있습니다.";
    } else if (hasActivePaper) {
      nextKey = "open_paper";
      nextLabel = "모의매매 세션 점검";
      nextHref = "/paper-trading";
      nextReason = "활성 모의매매 세션이 있어 성과를 먼저 점검하세요.";
    } else if (btNum > 0) {
      nextKey = "open_backtest";
      nextLabel = "백테스트 증거 재검토";
      nextHref = "/backtest";
      nextReason = "저장된 백테스트 증거를 확인한 뒤 다음 단계를 결정하세요.";
    }

    const facts: FactItem[] = [
      fact("권장 다음 작업", nextLabel, "system_status"),
      fact("권장 이동 경로", nextHref, "system_status"),
      fact("권장 작업 키", nextKey, "system_status"),
      fact("권장 사유", nextReason, "system_status"),
      ...searchFacts.slice(0, 3),
      ...stratFacts.slice(0, 2),
      ...btFacts.slice(0, 3),
    ];

    if (bestName) {
      facts.push(fact("현재 주목 전략", bestName, "strategy_store"));
    }
    facts.push(...lifecycle.slice(0, 4));

    return facts;
  } catch {
    return [
      fact("권장 다음 작업", "전략 탐색 시작", "system_status"),
      fact("권장 이동 경로", "/strategy-search", "system_status"),
    ];
  }
}

// ─── First-run / demo (read-only — never initializes demo) ───────────────────

export async function fetchFirstRunFacts(
  intentType: AgentIntentType = "first_run_help",
): Promise<FactItem[]> {
  try {
    const { classifyFirstRunStatus } = await import("../firstRun/firstRunStatus");
    const { getDemoDeepLinks } = await import("../firstRun/demoFixture");
    const status = classifyFirstRunStatus();
    const links = getDemoDeepLinks();
    const facts: FactItem[] = [
      fact("최초 실행 모드", status.mode, "system_status"),
      fact(
        "실제 탐색 작업",
        status.hasRealSearchJobs ? "있음" : "없음",
        "strategy_search_jobs",
      ),
      fact(
        "데모 탐색 작업",
        status.hasDemoSearchJobs ? "있음" : "없음",
        "strategy_search_jobs",
      ),
      fact(
        "실제 전략",
        status.hasRealStrategies ? "있음" : "없음",
        "strategy_store",
      ),
      fact(
        "데모 전략",
        status.hasDemoStrategies ? "있음" : "없음",
        "strategy_store",
      ),
      fact(
        "백테스트",
        status.hasRealBacktests
          ? "실제 있음"
          : status.hasDemoBacktests
            ? "데모만 있음"
            : "없음",
        "backtest_store",
      ),
      fact(
        "Paper 세션",
        status.hasPaperSessions ? "있음" : "없음",
        "paper_session_store",
      ),
      fact("실전 주문", "차단 · 에이전트 실행 불가", "system_status"),
      fact("데모 자동 생성", "아니오 · UI 명시 확인 필요", "system_status"),
    ];

    if (intentType === "demo_overview") {
      facts.push(
        fact(
          "권장 다음 작업",
          status.demoInitialized ? "데모 결과 검토" : "데모로 둘러보기",
          "system_status",
        ),
        fact(
          "권장 이동 경로",
          status.demoInitialized && links.results
            ? links.results
            : "/dashboard?firstRun=demo",
          "system_status",
        ),
        fact("권장 작업 키", "navigate", "system_status"),
        fact(
          "권장 사유",
          "데모는 예시이며 실전 증거가 아닙니다. 생성은 대시보드에서 확인 후에만 가능합니다.",
          "system_status",
        ),
        fact("보조 작업", "실제 전략 탐색 시작", "system_status"),
        fact("보조 이동 경로", "/strategy-search", "system_status"),
      );
    } else if (status.mode === "EMPTY" || status.mode === "DEMO_AVAILABLE") {
      facts.push(
        fact("권장 다음 작업", "데모로 둘러보기", "system_status"),
        fact("권장 이동 경로", "/dashboard?firstRun=demo", "system_status"),
        fact("권장 작업 키", "navigate", "system_status"),
        fact(
          "권장 사유",
          "런타임이 비어 있습니다. 데모로 워크플로를 확인하거나 실제 탐색을 시작하세요.",
          "system_status",
        ),
        fact("보조 작업", "실제 전략 탐색 시작", "system_status"),
        fact("보조 이동 경로", "/strategy-search", "system_status"),
      );
    } else if (status.mode === "DEMO_ACTIVE") {
      facts.push(
        fact("권장 다음 작업", "데모 결과 검토", "system_status"),
        fact(
          "권장 이동 경로",
          links.results ?? "/results",
          "system_status",
        ),
        fact("권장 작업 키", "view_results", "system_status"),
        fact(
          "권장 사유",
          "데모 데이터가 활성입니다. 실전 성과로 해석하지 마세요.",
          "system_status",
        ),
        fact("보조 작업", "실제 전략 탐색 시작", "system_status"),
        fact("보조 이동 경로", "/strategy-search", "system_status"),
      );
    } else {
      facts.push(
        fact("권장 다음 작업", "탐색 결과 검토", "system_status"),
        fact("권장 이동 경로", "/results", "system_status"),
        fact("권장 작업 키", "view_results", "system_status"),
        fact(
          "권장 사유",
          "실제 연구 데이터가 있으므로 결과를 검토하세요.",
          "system_status",
        ),
      );
    }

    return facts;
  } catch {
    return [
      fact("최초 실행 모드", "확인 불가", "system_status"),
      fact("권장 다음 작업", "대시보드에서 시작 안내 확인", "system_status"),
      fact("권장 이동 경로", "/dashboard", "system_status"),
      fact("데모 자동 생성", "아니오 · UI 명시 확인 필요", "system_status"),
    ];
  }
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export async function fetchFactsForIntent(
  intentType: AgentIntentType,
  params: Record<string, string>,
  context?: AgentLifecycleContext | null,
): Promise<FactItem[]> {
  switch (intentType) {
    case "search_status":
    case "search_pause_request":
    case "search_resume_request":
      return [
        ...(await fetchSearchStatusFacts()),
        ...fetchLifecycleContextFacts(context).slice(0, 3),
      ];
    case "search_failure_explanation":
      return fetchSearchFailureFacts(context);
    case "explain_strategy":
      return fetchStrategyFacts(params.strategyHint);
    case "compare_strategies":
      return fetchCompareFacts(params.symbolA, params.symbolB);
    case "compare_plans":
      return [];
    case "backtest_summary":
    case "explain_rejection":
      return fetchBacktestFacts(params.symbol ?? context?.symbol ?? undefined);
    case "risk_summary":
      return fetchRiskFacts();
    case "paper_status":
    case "paper_start_request":
    case "paper_pause_request":
    case "paper_resume_request":
    case "paper_stop_request":
      return fetchPaperStartFacts(context);
    case "strategy_rename_request":
    case "strategy_archive_request":
    case "strategy_restore_request":
    case "strategy_delete_request":
      return fetchStrategyFacts(params.strategyHint);
    case "first_run_help":
    case "demo_overview":
      return fetchFirstRunFacts(intentType);
    case "workspace_status":
    case "recommend_next":
    case "follow_up_why":
    case "continue_session":
    case "explain_waiting":
      return fetchRecommendNextFacts(context);
    case "approve_pending":
    case "cancel_pending":
    case "explain_approval":
      return [
        fact("대기 제안", "클라이언트 세션에서 확인", "system_status"),
      ];
    case "prepare_search_plan":
      return [
        fact("탐색 계획", "초안 준비 경로", "strategy_search_jobs"),
      ];
    case "prepare_backtest_plan":
      return [
        ...(await fetchBacktestFacts(
          params.symbol ?? context?.symbol ?? undefined,
        )),
        ...(await fetchStrategyFacts(params.strategyHint)),
        ...fetchLifecycleContextFacts(context).slice(0, 4),
      ];
    case "prepare_paper_plan":
      return fetchPaperStartFacts(context);
    case "research_workspace":
      return fetchRecommendNextFacts(context);
    case "research_analysis":
      return fetchResearchBrainFacts(context);
    case "results_promote_request":
      return fetchResearchBrainFacts(context);
    case "memory_recall":
      return [];
    case "market_status":
      return [
        fact("시장 데이터", "실시간 시세 연결 필요", "market_data"),
      ];
    default:
      return [];
  }
}
