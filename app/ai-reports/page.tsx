"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Card, Button } from "@/components/ui/primitives";
import { EmptyState } from "@/components/rextora/EmptyState";
import { LoadingState } from "@/components/rextora/LoadingState";
import {
  AiReportAnalytics,
  type AiReportView,
} from "@/components/rextora/ai-reports/AiReportVisual";
import { formatDataSourceMeta } from "@/src/lib/rextora/displayLabels";
import { FileBarChart2 } from "lucide-react";

export default function AiReportsPage() {
  const [reports, setReports] = useState<AiReportView[]>([]);
  const [dashSummary, setDashSummary] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch("/api/rextora/trading/dashboard")
        .then((r) => r.json())
        .then((j) => {
          const status = j.data?.status ?? j.status;
          setDashSummary(status?.aiReportSummary ?? null);
          const list = (status?.aiReports ?? []) as AiReportView[];
          setReports(list);
          if (list[0]) setSelectedId(list[0].id);
          if (j.meta)
            setOrigin(
              formatDataSourceMeta(
                j.meta.source,
                j.meta.cached,
                j.meta.durationMs,
              ),
            );
        })
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const selected = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? reports[0] ?? null,
    [reports, selectedId],
  );

  const similar = useMemo(() => {
    if (!selected) return [];
    return reports.filter(
      (r) => r.id !== selected.id && r.symbol === selected.symbol,
    );
  }, [reports, selected]);

  if (loading) {
    return (
      <div className="rextora-page" data-testid="ai-reports-page">
        <LoadingState message="분석 보고서를 불러오는 중..." lines={6} />
      </div>
    );
  }

  return (
    <div className="rextora-page" data-testid="ai-reports-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="rextora-page-title text-white">거래 분석 보고</h1>
          <p className="rextora-helper mt-1.5 max-w-2xl">
            완료된 거래의 기관급 분석 리포트입니다. AI는 실전 진입을 결정하지
            않습니다.
          </p>
        </div>
        <Badge tone="muted" icon={<FileBarChart2 className="h-3 w-3" />}>
          규칙 기반 · 시각 분석
        </Badge>
      </div>
      {origin && (
        <p className="rextora-caption">{origin} · 완료 거래 기반 분석</p>
      )}

      <Card title="일일 요약" description="최근 분석의 핵심 한 줄">
        <p className="rextora-body text-slate-200">
          {dashSummary ??
            "아직 분석 보고서가 없습니다. 모의/실전 거래가 완료되면 생성됩니다."}
        </p>
      </Card>

      {reports.length === 0 ? (
        <EmptyState
          message="저장된 분석 보고서가 없습니다."
          hint="모의 또는 실전 거래가 완료되면 거래별 분석이 자동 생성됩니다."
        />
      ) : (
        <>
          <Card title="보고서 선택" description="최근 완료 거래 분석">
            <div className="flex flex-wrap gap-2">
              {reports.map((r) => {
                const active = (selected?.id ?? "") === r.id;
                const pnl = r.realizedPnlPct ?? 0;
                return (
                  <Button
                    key={r.id}
                    size="sm"
                    variant={active ? "primary" : "outline"}
                    onClick={() => setSelectedId(r.id)}
                  >
                    {r.symbol}
                    <span
                      className={`ml-1 tabular-nums ${
                        pnl >= 0 ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {pnl >= 0 ? "+" : ""}
                      {pnl.toFixed(1)}%
                    </span>
                  </Button>
                );
              })}
            </div>
          </Card>

          {selected && (
            <AiReportAnalytics report={selected} similar={similar} />
          )}
        </>
      )}
    </div>
  );
}
