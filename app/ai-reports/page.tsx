"use client";

import { useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { EmptyState } from "@/components/rextora/EmptyState";
import {
  displayDirection,
  displayLabel,
  formatDataSourceMeta,
} from "@/src/lib/rextora/displayLabels";

type Report = {
  id: string;
  symbol: string;
  summary: string;
  createdAt: string;
  analysisMethod?: string;
  whyEntered?: string;
  whyExited?: string;
  parameterSuggestion?: string;
  costImpact?: string;
  slippageImpact?: string;
  followedRules?: boolean;
  recurringLossPattern?: string;
  needsMoreBacktesting?: boolean;
  mode?: "PAPER" | "LIVE";
  tradeId?: string | null;
  side?: string;
  entryPrice?: number;
  exitPrice?: number;
  realizedPnlPct?: number;
  holdingTimeLabel?: string;
  sections?: {
    targetTrade: string;
    analyzedAt: string;
    coreCause: string;
    strengths: string;
    problems: string;
    costEffect: string;
    prevention: string;
    backtestAdvice: string;
  };
};

export default function AiReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [dashSummary, setDashSummary] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch("/api/rextora/trading/dashboard")
        .then((r) => r.json())
        .then((j) => {
          const status = j.data?.status ?? j.status;
          setDashSummary(status?.aiReportSummary ?? null);
          setReports(status?.aiReports ?? []);
          if (j.meta)
            setOrigin(
              formatDataSourceMeta(
                j.meta.source,
                j.meta.cached,
                j.meta.durationMs,
              ),
            );
        });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-4" data-testid="ai-reports-page">
      <div>
        <h1 className="text-2xl font-bold text-white">거래 분석 보고</h1>
        <p className="mt-1 text-sm text-slate-400">
          완료된 거래만 분석합니다. AI는 실전 진입을 결정하지 않습니다.
        </p>
      </div>
      {origin && (
        <p className="text-xs text-slate-500">{origin} · 완료 거래 기반 분석</p>
      )}

      <Card title="일일/최근 요약">
        <p className="text-sm text-slate-300">
          {dashSummary ??
            "아직 분석 보고서가 없습니다. 모의/실전 거래가 완료되면 생성됩니다."}
        </p>
      </Card>

      <Card title="분석 보고서 목록">
        <div className="space-y-3">
          {reports.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-slate-800 p-3 text-sm text-slate-300"
              data-testid="ai-report-card"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">
                  {r.symbol} · {new Date(r.createdAt).toLocaleString("ko-KR")}
                </span>
                <Badge tone="muted">
                  {r.analysisMethod ?? "규칙 기반 분석"}
                </Badge>
                <Badge>{displayLabel(r.mode ?? "PAPER")}</Badge>
              </div>
              <dl className="mb-3 grid gap-2 rounded-lg bg-slate-950/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-slate-500">거래 번호</dt>
                  <dd>{r.tradeId ?? r.id}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">코인 / 방향</dt>
                  <dd>
                    {r.symbol} · {displayDirection(r.side)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">진입 / 청산</dt>
                  <dd>
                    {r.entryPrice ?? "-"} → {r.exitPrice ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">보유 시간 / 손익</dt>
                  <dd>
                    {r.holdingTimeLabel ?? "기록 없음"} ·{" "}
                    {r.realizedPnlPct != null
                      ? `${r.realizedPnlPct.toFixed(2)}%`
                      : "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">진입 사유</dt>
                  <dd>{r.whyEntered ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">청산 사유</dt>
                  <dd>{r.whyExited ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">규칙 평가</dt>
                  <dd>
                    {r.followedRules == null
                      ? "평가 기록 없음"
                      : r.followedRules
                        ? "규칙 준수"
                        : "규칙 이탈"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">비용</dt>
                  <dd>
                    {r.costImpact ?? "-"} · {r.slippageImpact ?? "-"}
                  </dd>
                </div>
              </dl>
              {r.sections ? (
                <dl className="grid gap-1 md:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">분석 방식</dt>
                    <dd>{r.analysisMethod ?? "규칙 기반 분석"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">분석 대상 거래</dt>
                    <dd>{r.sections.targetTrade}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">분석 시각</dt>
                    <dd>{r.sections.analyzedAt}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">핵심 원인</dt>
                    <dd>{r.sections.coreCause}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">잘된 점</dt>
                    <dd>{r.sections.strengths}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">문제점</dt>
                    <dd>{r.sections.problems}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">비용 영향</dt>
                    <dd>{r.sections.costEffect}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">재발 방지</dt>
                    <dd>{r.sections.prevention}</dd>
                  </div>
                  <div className="md:col-span-2">
                    <dt className="text-slate-500">추가 백테스트 권고</dt>
                    <dd>{r.sections.backtestAdvice}</dd>
                  </div>
                  <div className="md:col-span-2">
                    <dt className="text-slate-500">개선 제안</dt>
                    <dd>{r.parameterSuggestion ?? r.sections.prevention}</dd>
                  </div>
                </dl>
              ) : (
                <div className="space-y-1">
                  <div>분석 방식: {r.analysisMethod ?? "규칙 기반 분석"}</div>
                  <div>{r.summary}</div>
                  {r.whyEntered && <div>진입: {r.whyEntered}</div>}
                  {r.whyExited && <div>청산: {r.whyExited}</div>}
                  {r.parameterSuggestion && (
                    <div>권고: {r.parameterSuggestion}</div>
                  )}
                </div>
              )}
            </div>
          ))}
          {reports.length === 0 && (
            <EmptyState message="저장된 분석 보고서가 없습니다. 모의 또는 실전 거래가 완료되면 거래별 분석이 자동 생성됩니다." />
          )}
        </div>
      </Card>
    </div>
  );
}
