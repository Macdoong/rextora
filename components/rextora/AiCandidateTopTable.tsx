import { memo } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import { displayLabel } from "@/src/lib/rextora/displayLabels";
import { formatPercent, formatScore } from "@/src/lib/rextora/displayFormat";
import type { AiCandidate, CandidateStatus } from "@/lib/types";

const statusTone: Record<CandidateStatus, "success" | "warning" | "danger" | "muted"> = {
  "진입 가능": "success",
  "관찰 필요": "warning",
  "비용 초과로 차단": "danger",
  "리스크 초과로 차단": "danger",
  "과열 구간 차단": "danger",
  "신호 약함": "muted"
};

export const AiCandidateTopTable = memo(function AiCandidateTopTable({ candidates, compact = false, className = "" }: { candidates: AiCandidate[]; compact?: boolean; className?: string }) {
  const rowPadding = compact ? "py-1" : "py-2";

  return (
    <Card title="AI 진입 후보 TOP 5" action={<Badge tone="purple">실시간 랭킹</Badge>} className={className}>
      <div className="overflow-x-auto">
        <table className="rextora-table w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className={`px-2 ${rowPadding}`}>순위</th>
              <th className={`px-2 ${rowPadding}`}>코인</th>
              <th className={`px-2 ${rowPadding}`}>방향</th>
              <th className={`px-2 ${rowPadding}`}>AI 점수</th>
              <th className={`px-2 ${rowPadding}`}>예상 수익률</th>
              <th className={`px-2 ${rowPadding}`}>예상 비용</th>
              <th className={`px-2 ${rowPadding}`}>리스크</th>
              <th className={`px-2 ${rowPadding}`}>상태</th>
            </tr>
          </thead>
          <tbody>
            {candidates.slice(0, 5).map((c) => (
              <tr key={c.symbol} className="border-b border-slate-800/60 hover:bg-violet-500/5" data-testid={`candidate-row-${c.rank}`}>
                <td className={`px-2 ${rowPadding} font-semibold text-violet-300`}>#{c.rank}</td>
                <td className={`px-2 ${rowPadding}`}>{c.symbol}</td>
                <td className={`px-2 ${rowPadding} ${c.direction === "롱" ? "text-green-300" : "text-red-300"}`}>{c.direction}</td>
                <td className={`px-2 ${rowPadding}`}>{formatScore(c.aiScore)}</td>
                <td className={`px-2 ${rowPadding} text-green-300`}>{formatPercent(c.expectedProfitPct)}</td>
                <td className={`px-2 ${rowPadding} text-orange-300`}>{formatPercent(c.expectedCostPct)}</td>
                <td className={`px-2 ${rowPadding}`}>{c.riskGrade}</td>
                <td className={`px-2 ${rowPadding}`}><Badge tone={statusTone[c.status]}>{c.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="rextora-helper mt-3">AI 후보는 바로 진입하라는 뜻이 아니라, 비용과 리스크를 통과한 검토 대상입니다.</p>
    </Card>
  );
});

export { AiCandidateDetailPanel as AiCandidateDetailTable } from "./AiCandidateDetailPanel";
