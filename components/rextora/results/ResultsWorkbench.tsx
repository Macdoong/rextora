"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Metric } from "@/components/ui/primitives";
import { EmptyState } from "@/components/rextora/EmptyState";
import { SAFE_STRATEGY_ID } from "@/src/lib/rextora/strategy/strategyTypes";
import {
  recommendStrategyAction,
  type StrategyRecommendation,
} from "@/src/lib/rextora/results/recommendation";
import {
  evaluateHighlightEligibility,
  metricStatusKo,
} from "@/src/lib/rextora/results/eligibility";
import { evaluateLiveCandidateRegistration } from "@/src/lib/rextora/results/liveCandidateEligibility";
import { isTestStrategyRecord } from "@/src/lib/rextora/strategy/strategyTestFilter";

type StrategyRow = {
  id: string;
  name: string;
  paramsHash: string;
  paperActive?: boolean;
  liveActive?: boolean;
  liveEligible?: boolean;
  lastBacktest?: {
    totalReturn?: number;
    mdd?: number;
    tradeCount?: number;
    /** Legacy / store field used by strategyStore updates */
    trades?: number;
    winRate?: number;
    profitFactor?: number;
    passed?: boolean;
  } | null;
  sourceStatus?: string;
  description?: string;
};

type JobSummary = {
  id: string;
  searchName?: string;
  status: string;
  qualifiedCount?: number;
  uniqueEvaluatedCount?: number;
  updatedAt?: string;
};

type Category = "review" | "paper" | "live" | "archive" | "safe";

function formatPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(2)}%`;
}

function categoryOf(s: StrategyRow): Category {
  if (s.id === SAFE_STRATEGY_ID) return "safe";
  if (s.liveActive) return "live";
  if (s.paperActive) return "paper";
  if (s.lastBacktest) return "review";
  return "archive";
}

function tradeCountOf(s: StrategyRow): number | null {
  const bt = s.lastBacktest;
  if (!bt) return null;
  const n = bt.tradeCount ?? bt.trades;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function strengthWeakness(s: StrategyRow): { strength: string; weakness: string } {
  const bt = s.lastBacktest;
  if (!bt) {
    return { strength: "백테스트 대기", weakness: "성과 데이터 없음" };
  }
  const trades = tradeCountOf(s) ?? 0;
  const strength =
    (bt.totalReturn ?? 0) > 0
      ? `순수익 ${formatPct(bt.totalReturn)}`
      : `거래 ${trades}건`;
  const weakness =
    Math.abs(bt.mdd ?? 0) > 0.2
      ? `낙폭 ${formatPct(bt.mdd)}`
      : trades < 10
        ? "거래 수 부족"
        : "추가 검증 권장";
  return { strength, weakness };
}

export function ResultsWorkbench() {
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [category, setCategory] = useState<Category | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [sRes, jRes] = await Promise.all([
        fetch("/api/rextora/strategies").then((r) => r.json()),
        fetch("/api/rextora/strategy-search").then((r) => r.json()),
      ]);
      const raw = Array.isArray(sRes.data) ? sRes.data : [];
      setStrategies(
        raw.filter(
          (s: StrategyRow & { testData?: boolean; metadata?: { testData?: boolean } }) =>
            !isTestStrategyRecord(s as never),
        ),
      );
      const list = jRes.data?.jobs ?? jRes.data ?? [];
      setJobs(Array.isArray(list) ? list : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "결과 로드 실패");
    }
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void refresh();
    }, 0);
    const t = setInterval(() => void refresh(), 12_000);
    return () => {
      window.clearTimeout(boot);
      clearInterval(t);
    };
  }, [refresh]);

  const ranked = useMemo(() => {
    const withBt = strategies.filter(
      (s) => s.id !== SAFE_STRATEGY_ID && s.lastBacktest,
    );
    const baseEligible = withBt.filter((s) => {
      const bt = s.lastBacktest!;
      return evaluateHighlightEligibility({
        hasBacktest: true,
        totalReturn: bt.totalReturn,
        mdd: bt.mdd,
        tradeCount: tradeCountOf(s),
        passed: bt.passed ?? true,
        strategyId: s.id,
        strategyHash: s.paramsHash,
        hasCostEvidence: true,
      }).eligible;
    });
    // Final recommendation requires robustness/overfitting evidence.
    // Empty overfittingInput → unavailable → not recommended (no fabrication).
    const recommendEligible = withBt.filter((s) => {
      const bt = s.lastBacktest!;
      const meta = s as StrategyRow & {
        robustness?: {
          jitterPassed?: boolean;
          stressPassed?: boolean;
          jitterEnabled?: boolean;
          stressEnabled?: boolean;
        };
      };
      const rob = meta.robustness;
      return evaluateHighlightEligibility({
        hasBacktest: true,
        totalReturn: bt.totalReturn,
        mdd: bt.mdd,
        tradeCount: tradeCountOf(s),
        passed: bt.passed ?? true,
        strategyId: s.id,
        strategyHash: s.paramsHash,
        hasCostEvidence: true,
        overfittingInput: rob
          ? {
              jitterEnabled: rob.jitterEnabled ?? true,
              jitterPassed: rob.jitterPassed ?? null,
              stressEnabled: rob.stressEnabled ?? true,
              stressPassed: rob.stressPassed ?? null,
              tradeCount: tradeCountOf(s),
              minTradeCount: 5,
            }
          : {},
      }).eligible;
    });
    const byReturn = [...withBt].sort(
      (a, b) =>
        (b.lastBacktest?.totalReturn ?? -Infinity) -
        (a.lastBacktest?.totalReturn ?? -Infinity),
    );
    const byStability = [...baseEligible].sort((a, b) => {
      const ma = Math.abs(a.lastBacktest?.mdd ?? 1);
      const mb = Math.abs(b.lastBacktest?.mdd ?? 1);
      if (ma !== mb) return ma - mb;
      return (b.lastBacktest?.profitFactor ?? 0) - (a.lastBacktest?.profitFactor ?? 0);
    });
    const recommended = [...recommendEligible].sort((a, b) => {
      const score = (s: StrategyRow) => {
        const r = s.lastBacktest?.totalReturn ?? 0;
        const mdd = Math.abs(s.lastBacktest?.mdd ?? 1);
        const pf = s.lastBacktest?.profitFactor ?? 0;
        return r * 2 - mdd + pf * 0.1 + 1;
      };
      return score(b) - score(a);
    });
    const topProfit = byReturn[0] ?? null;
    const topStable = byStability[0] ?? null;
    const topRecommend = recommended[0] ?? null;
    const roleIds = [topProfit?.id, topStable?.id, topRecommend?.id].filter(
      Boolean,
    ) as string[];
    const duplicateId =
      roleIds.length >= 2 && new Set(roleIds).size < roleIds.length
        ? roleIds.find((id, i) => roleIds.indexOf(id) !== i) ?? null
        : null;
    return {
      topProfit,
      topStable,
      topRecommend,
      eligibleCount: recommendEligible.length,
      stabilityBlockReason:
        recommendEligible.length === 0
          ? "추천 가능한 안정 전략 없음 — 강건성·과적합 증거가 있는 PASS 전략이 없습니다."
          : null,
      duplicateId,
    };
  }, [strategies]);

  const filtered = useMemo(() => {
    if (category === "all") return strategies;
    return strategies.filter((s) => categoryOf(s) === category);
  }, [strategies, category]);

  async function setPaper(id: string) {
    if (id === SAFE_STRATEGY_ID) {
      setMessage("SAFE는 모의 활성으로 덮어쓰지 않습니다. 복사본을 사용하세요.");
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch("/api/rextora/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apply_paper", id }),
      });
      const json = await res.json();
      setMessage(json.ok ? "모의매매 후보로 등록했습니다." : (json.error ?? "실패"));
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteStrategy(id: string) {
    if (id === SAFE_STRATEGY_ID) {
      setMessage("SAFE 전략은 삭제할 수 없습니다.");
      return;
    }
    const s = strategies.find((x) => x.id === id);
    if (s?.paperActive || s?.liveActive) {
      setMessage("활성 모의/실전 전략은 삭제할 수 없습니다.");
      return;
    }
    if (!window.confirm("이 전략을 삭제할까요? 참조 중인 경우 거부될 수 있습니다.")) {
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch("/api/rextora/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", strategyId: id }),
      });
      const json = await res.json();
      setMessage(json.ok ? "삭제했습니다." : (json.error ?? "삭제 실패"));
      await refresh();
    } finally {
      setBusyId(null);
    }
  }

  function renderHighlight(
    title: string,
    s: StrategyRow | null,
    tone: "success" | "warning" | "default",
    emptyMessage?: string | null,
  ) {
    if (!s) {
      return (
        <Card title={title} data-testid={`highlight-${title}`}>
          <EmptyState
            message={emptyMessage ?? "아직 해당 후보가 없습니다."}
            hint="전략 탐색을 완료하거나 백테스트를 통과한 전략을 등록하세요."
          />
        </Card>
      );
    }
    const { strength, weakness } = strengthWeakness(s);
    const trades = tradeCountOf(s);
    const rec: StrategyRecommendation = recommendStrategyAction({
      totalReturn: s.lastBacktest?.totalReturn ?? null,
      mdd: s.lastBacktest?.mdd ?? null,
      tradeCount: trades,
      passed: s.lastBacktest?.passed ?? null,
      paperActive: Boolean(s.paperActive),
      liveActive: Boolean(s.liveActive),
      isSafe: s.id === SAFE_STRATEGY_ID,
    });
    const metricState = metricStatusKo({
      hasBacktest: Boolean(s.lastBacktest),
      totalReturn: s.lastBacktest?.totalReturn,
      tradeCount: trades,
      passed: s.lastBacktest?.passed ?? (trades != null ? true : null),
    });
    const isDuplicateRole =
      ranked.duplicateId != null && s.id === ranked.duplicateId;
    const paperLabel = s.paperActive ? "모의매매 보기" : "모의매매 등록";
    const liveGate = evaluateLiveCandidateRegistration({
      strategyId: s.id,
      isSafe: s.id === SAFE_STRATEGY_ID,
      paperActive: Boolean(s.paperActive),
      liveActive: Boolean(s.liveActive),
      liveEligible: s.liveEligible,
      hasBacktest: Boolean(s.lastBacktest),
      totalReturn: s.lastBacktest?.totalReturn,
      mdd: s.lastBacktest?.mdd,
      tradeCount: trades,
      passed: s.lastBacktest?.passed,
    });
    const liveLabel = s.liveActive ? "실전 후보 보기" : "실전 후보 등록";
    return (
      <Card title={title} data-testid={`highlight-${title}`}>
        <div className="space-y-2">
          <div className="text-lg font-semibold text-slate-100">{s.name}</div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={tone}>{s.paramsHash.slice(0, 12)}</Badge>
            <Badge>{rec.labelKo}</Badge>
            <Badge tone="muted">{metricState}</Badge>
            {isDuplicateRole ? (
              <Badge tone="success">다중 역할</Badge>
            ) : null}
          </div>
          {isDuplicateRole ? (
            <p
              className="text-xs text-sky-200"
              data-testid="results-duplicate-role-note"
            >
              수익성과 종합 점수가 모두 가장 높아 최종 추천에도 동일하게
              선정됐습니다.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Metric
              label="순수익"
              value={
                s.lastBacktest?.totalReturn == null
                  ? metricState
                  : formatPct(s.lastBacktest.totalReturn)
              }
            />
            <Metric
              label="최대 낙폭"
              value={
                s.lastBacktest?.mdd == null
                  ? metricState
                  : formatPct(s.lastBacktest.mdd)
              }
            />
            <Metric
              label="거래 수"
              value={trades == null ? metricState : trades}
            />
            <Metric label="지표 상태" value={metricState} />
          </div>
          <p className="text-xs text-emerald-200">강점: {strength}</p>
          <p className="text-xs text-amber-200">약점: {weakness}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href={`/backtest?strategyId=${encodeURIComponent(s.id)}&strategyHash=${encodeURIComponent(s.paramsHash)}&symbol=${encodeURIComponent(
                (s as { symbols?: string[] }).symbols?.[0] ?? "BTCUSDT",
              )}&timeframe=${encodeURIComponent(
                (s as { timeframe?: string }).timeframe ?? "15m",
              )}&sourceResearchJobId=${encodeURIComponent(jobs[0]?.id ?? "")}`}
              data-testid="results-backtest-handoff"
            >
              <Button size="sm">새 기간으로 백테스트</Button>
            </Link>
            {s.paperActive ? (
              <Link href="/paper-trading">
                <Button size="sm" tone="success">
                  {paperLabel}
                </Button>
              </Link>
            ) : (
              <Button
                size="sm"
                tone="success"
                disabled={busyId === s.id || s.id === SAFE_STRATEGY_ID}
                onClick={() => void setPaper(s.id)}
              >
                {paperLabel}
              </Button>
            )}
            {s.liveActive || liveGate.allowed ? (
              <Link
                href={`/live-trading?candidate=${encodeURIComponent(s.id)}`}
              >
                <Button size="sm" variant="outline">
                  {liveLabel}
                </Button>
              </Link>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled
                title={liveGate.reasonKo ?? undefined}
                data-testid="results-live-disabled"
              >
                {liveLabel}
              </Button>
            )}
            {!liveGate.allowed && !s.liveActive ? (
              <p className="w-full text-xs text-amber-200/90">
                실전 후보 불가: {liveGate.reasonKo}
              </p>
            ) : null}
            <Link
              href={`/strategy-search?followUp=${encodeURIComponent(s.id)}`}
            >
              <Button size="sm" variant="outline">
                이 전략으로 재탐색
              </Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  const recentJobs = jobs.slice(0, 5);
  const safe = strategies.find((s) => s.id === SAFE_STRATEGY_ID) ?? null;

  return (
    <div className="space-y-5" data-testid="results-workbench">
      {message ? (
        <p className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {renderHighlight("최고 수익 전략", ranked.topProfit, "success")}
        {renderHighlight(
          "최고 안정 전략",
          ranked.topStable,
          "warning",
          ranked.stabilityBlockReason,
        )}
        {renderHighlight(
          "최종 추천 전략",
          ranked.topRecommend,
          "default",
          ranked.stabilityBlockReason
            ? "추천 가능한 안정 전략 없음 — 최종 추천도 동일 자격 규칙을 적용합니다."
            : null,
        )}
      </div>

      <Card title="SAFE 기준 전략" data-testid="results-safe-baseline">
        {safe ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-100">{safe.name}</div>
              <div className="text-xs rx-text-muted">
                해시 {safe.paramsHash} · 읽기 전용 · 자동 탐색/수정 금지
              </div>
            </div>
            <Link href={`/backtest?strategyId=${SAFE_STRATEGY_ID}`}>
              <Button size="sm" variant="outline">
                기준 백테스트
              </Button>
            </Link>
          </div>
        ) : (
          <EmptyState message="SAFE 전략을 불러오지 못했습니다." />
        )}
      </Card>

      <Card title="최근 연구 이력" data-testid="results-research-history">
        {recentJobs.length === 0 ? (
          <EmptyState
            message="완료된 탐색이 없습니다."
            hint="전략 탐색에서 연구를 시작하세요."
          />
        ) : (
          <ul className="space-y-2">
            {recentJobs.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 px-3 py-2"
              >
                <div>
                  <div className="text-sm text-slate-100">
                    {j.searchName || j.id}
                  </div>
                  <div className="text-xs rx-text-muted">
                    {j.status} · 합격 {j.qualifiedCount ?? 0} · 평가{" "}
                    {j.uniqueEvaluatedCount ?? 0}
                  </div>
                </div>
                <Link href={`/strategy-search?jobId=${encodeURIComponent(j.id)}`}>
                  <Button size="sm" variant="outline">
                    상세
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3">
          <Link href="/strategy-search">
            <Button size="sm">새 탐색 시작</Button>
          </Link>
        </div>
      </Card>

      <Card title="전체 전략 라이브러리" data-testid="results-full-ranking">
        <div className="mb-3 flex flex-wrap gap-2">
          {(
            [
              ["all", "전체"],
              ["review", "검토 대기"],
              ["paper", "모의매매 중"],
              ["live", "실전매매 중"],
              ["archive", "보관"],
              ["safe", "SAFE"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              size="sm"
              variant={category === id ? "primary" : "outline"}
              onClick={() => setCategory(id)}
            >
              {label}
            </Button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <EmptyState message="표시할 전략이 없습니다." />
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => {
              const { strength, weakness } = strengthWeakness(s);
              const trades = tradeCountOf(s);
              const metricState = metricStatusKo({
                hasBacktest: Boolean(s.lastBacktest),
                totalReturn: s.lastBacktest?.totalReturn,
                tradeCount: trades,
                passed: s.lastBacktest?.passed ?? (trades != null ? true : null),
              });
              const rec = recommendStrategyAction({
                totalReturn: s.lastBacktest?.totalReturn ?? null,
                mdd: s.lastBacktest?.mdd ?? null,
                tradeCount: trades,
                passed: s.lastBacktest?.passed ?? null,
                paperActive: Boolean(s.paperActive),
                liveActive: Boolean(s.liveActive),
                isSafe: s.id === SAFE_STRATEGY_ID,
              });
              const liveGate = evaluateLiveCandidateRegistration({
                strategyId: s.id,
                isSafe: s.id === SAFE_STRATEGY_ID,
                paperActive: Boolean(s.paperActive),
                liveActive: Boolean(s.liveActive),
                liveEligible: s.liveEligible,
                hasBacktest: Boolean(s.lastBacktest),
                totalReturn: s.lastBacktest?.totalReturn,
                mdd: s.lastBacktest?.mdd,
                tradeCount: trades,
                passed: s.lastBacktest?.passed,
              });
              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"
                  data-testid={`result-card-${s.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-100">{s.name}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        <Badge>{categoryOf(s)}</Badge>
                        <Badge tone="muted">{metricState}</Badge>
                        <Badge>{rec.labelKo}</Badge>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-right sm:grid-cols-4">
                      <Metric
                        label="수익"
                        value={
                          s.lastBacktest?.totalReturn == null
                            ? metricState
                            : formatPct(s.lastBacktest.totalReturn)
                        }
                      />
                      <Metric
                        label="낙폭"
                        value={
                          s.lastBacktest?.mdd == null
                            ? metricState
                            : formatPct(s.lastBacktest.mdd)
                        }
                      />
                      <Metric
                        label="거래"
                        value={trades == null ? metricState : trades}
                      />
                      <Metric
                        label="손익비"
                        value={
                          s.lastBacktest?.profitFactor != null
                            ? s.lastBacktest.profitFactor.toFixed(2)
                            : metricState
                        }
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    강점 {strength} · 약점 {weakness}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/backtest?strategyId=${encodeURIComponent(s.id)}&strategyHash=${encodeURIComponent(s.paramsHash)}`}
                      data-testid="results-row-backtest-handoff"
                    >
                      <Button size="sm">새 기간으로 백테스트</Button>
                    </Link>
                    <Button
                      size="sm"
                      tone="success"
                      disabled={
                        busyId === s.id ||
                        s.id === SAFE_STRATEGY_ID ||
                        Boolean(s.paperActive)
                      }
                      onClick={() => void setPaper(s.id)}
                    >
                      {s.paperActive ? "모의매매 보기" : "모의매매 등록"}
                    </Button>
                    {s.liveActive || liveGate.allowed ? (
                      <Link
                        href={`/live-trading?candidate=${encodeURIComponent(s.id)}`}
                      >
                        <Button size="sm" variant="outline">
                          {s.liveActive ? "실전 후보 보기" : "실전 후보 등록"}
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                        title={liveGate.reasonKo ?? undefined}
                      >
                        실전 후보 등록
                      </Button>
                    )}
                    <Link
                      href={`/strategy-search?followUp=${encodeURIComponent(s.id)}`}
                    >
                      <Button size="sm" variant="outline">
                        이 전략으로 재탐색
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      tone="muted"
                      disabled={
                        busyId === s.id ||
                        s.id === SAFE_STRATEGY_ID ||
                        Boolean(s.paperActive) ||
                        Boolean(s.liveActive)
                      }
                      onClick={() => void deleteStrategy(s.id)}
                    >
                      삭제
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
