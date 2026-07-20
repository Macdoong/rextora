"use client";

import { useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";

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

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch("/api/rextora/trading/dashboard")
        .then((r) => r.json())
        .then((j) => {
          const status = j.data?.status ?? j.status;
          setDashSummary(status?.aiReportSummary ?? null);
          setReports(status?.aiReports ?? []);
        });
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-4" data-testid="ai-reports-page">
      <div>
        <h1 className="text-2xl font-bold text-white">거래 분석 보고</h1>
        <p className="mt-1 text-sm text-slate-400">완료된 거래만 분석합니다. AI는 실전 진입을 결정하지 않습니다.</p>
      </div>

      <Card title="일일/최근 요약">
        <p className="text-sm text-slate-300">{dashSummary ?? "아직 분석 보고서가 없습니다. 모의/실전 거래가 완료되면 생성됩니다."}</p>
      </Card>

      <Card title="분석 보고서 목록">
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-800 p-3 text-sm text-slate-300" data-testid="ai-report-card">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-white">
                  {r.symbol} · {new Date(r.createdAt).toLocaleString("ko-KR")}
                </span>
                <Badge tone="muted">{r.analysisMethod ?? "규칙 기반 분석"}</Badge>
              </div>
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
                </dl>
              ) : (
                <div className="space-y-1">
                  <div>분석 방식: {r.analysisMethod ?? "규칙 기반 분석"}</div>
                  <div>{r.summary}</div>
                  {r.whyEntered && <div>진입: {r.whyEntered}</div>}
                  {r.whyExited && <div>청산: {r.whyExited}</div>}
                  {r.parameterSuggestion && <div>권고: {r.parameterSuggestion}</div>}
                </div>
              )}
            </div>
          ))}
          {reports.length === 0 && <p className="text-sm text-slate-400">저장된 분석 보고서가 없습니다.</p>}
        </div>
      </Card>
    </div>
  );
}
