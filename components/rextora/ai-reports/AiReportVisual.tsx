"use client";

import { Card } from "@/components/ui/primitives";

export interface AiReportView {
  id: string;
  title?: string;
  summary?: string;
  createdAt?: string;
  status?: string;
  symbol?: string;
  realizedPnlPct?: number;
  pnlPct?: number;
}

export function AiReportAnalytics({
  report,
  similar,
}: {
  report: AiReportView | null;
  similar?: AiReportView[];
}) {
  if (!report) {
    return (
      <Card title="AI 리포트">
        <p className="rx-text-muted text-sm">표시할 리포트가 없습니다.</p>
        <p className="rx-text-muted mt-2 text-xs">
          실전 진입을 결정하지 않습니다.
        </p>
      </Card>
    );
  }
  return (
    <Card title={report.title ?? report.symbol ?? "AI 리포트"}>
      <p className="rx-text-secondary whitespace-pre-wrap text-sm">
        {report.summary ?? "요약 없음"}
      </p>
      {similar && similar.length > 0 && (
        <p className="rx-text-muted mt-2 text-xs">
          유사 리포트 {similar.length}건
        </p>
      )}
      <p className="rx-text-muted mt-3 text-xs">
        실전 진입을 결정하지 않습니다.
      </p>
    </Card>
  );
}
