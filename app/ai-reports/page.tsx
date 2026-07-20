"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/primitives";

type Report = { id: string; symbol: string; summary: string; createdAt: string; whyEntered?: string; whyExited?: string; parameterSuggestion?: string };

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
        <h1 className="text-2xl font-bold text-white">AI 분석 보고</h1>
        <p className="mt-1 text-sm text-slate-400">완료된 거래·백테스트만 분석합니다. AI는 실전 진입을 결정하지 않습니다.</p>
      </div>

      <Card title="일일/최근 요약">
        <p className="text-sm text-slate-300">{dashSummary ?? "아직 분석 보고서가 없습니다. 모의/실전 거래가 완료되면 생성됩니다."}</p>
      </Card>

      <Card title="분석 보고서 목록">
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-800 p-3 text-sm text-slate-300">
              <div className="font-semibold text-white">
                {r.symbol} · {new Date(r.createdAt).toLocaleString("ko-KR")}
              </div>
              <div>{r.summary}</div>
            </div>
          ))}
          {reports.length === 0 && <p className="text-sm text-slate-400">저장된 AI 보고서가 없습니다.</p>}
        </div>
      </Card>

      <Card title="분석 범위">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-400">
          <li>일일 거래 요약</li>
          <li>손실 원인 분석</li>
          <li>전략별 성과 분석</li>
          <li>비용 영향 분석</li>
          <li>개선 제안 / 추가 백테스트 필요 항목</li>
        </ul>
      </Card>
    </div>
  );
}
