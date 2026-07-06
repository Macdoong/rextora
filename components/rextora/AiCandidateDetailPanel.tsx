"use client";

import { useState } from "react";
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

export function AiCandidateDetailPanel({ candidates }: { candidates: AiCandidate[] }) {
  const topFive = candidates.slice(0, 5);
  const [selectedRank, setSelectedRank] = useState(topFive[0]?.rank ?? 1);
  const selected = topFive.find((c) => c.rank === selectedRank) ?? topFive[0];

  return (
    <div className="space-y-3">
      <Card title="AI 진입 후보 TOP 5" action={<Badge tone="purple">실시간 랭킹</Badge>}>
        <div className="overflow-x-auto">
          <table className="rextora-table w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="px-2 py-2">순위</th>
                <th className="px-2 py-2">코인</th>
                <th className="px-2 py-2">방향</th>
                <th className="px-2 py-2">신호</th>
                <th className="px-2 py-2">AI 점수</th>
                <th className="px-2 py-2">예상 수익률</th>
                <th className="px-2 py-2">예상 비용</th>
                <th className="px-2 py-2">리스크</th>
                <th className="px-2 py-2">상태</th>
              </tr>
            </thead>
            <tbody>
              {topFive.map((c) => (
                <tr
                  key={c.symbol}
                  className={`cursor-pointer border-b border-slate-800/60 hover:bg-violet-500/5 ${selectedRank === c.rank ? "bg-violet-500/10" : ""}`}
                  data-testid={`candidate-row-${c.rank}`}
                  onClick={() => setSelectedRank(c.rank)}
                >
                  <td className="px-2 py-2 font-semibold text-violet-300">#{c.rank}</td>
                  <td className="px-2 py-2">{c.symbol}</td>
                  <td className={`px-2 py-2 ${c.direction === "롱" ? "text-green-300" : "text-red-300"}`}>{c.direction}</td>
                  <td className="px-2 py-2">{displayLabel(c.signalType)}</td>
                  <td className="px-2 py-2">{formatScore(c.aiScore)}</td>
                  <td className="px-2 py-2 text-green-300">{formatPercent(c.expectedProfitPct)}</td>
                  <td className="px-2 py-2 text-orange-300">{formatPercent(c.expectedCostPct)}</td>
                  <td className="px-2 py-2">{c.riskGrade}</td>
                  <td className="px-2 py-2"><Badge tone={statusTone[c.status]}>{c.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="rextora-helper mt-3">행을 클릭하면 상세 정보를 확인할 수 있습니다. 진입 가능은 조건을 통과했다는 뜻이며, 실제 주문은 자동매매 설정과 안전 조건을 추가로 확인한 뒤 실행됩니다.</p>
      </Card>
      {selected && (
        <Card title={`#${selected.rank} ${selected.symbol} 상세`} data-testid="candidate-detail-panel">
          <div className="grid gap-2 text-slate-300 md:grid-cols-2">
            <div className="rextora-body"><span className="text-slate-500">왜 후보인지:</span> {selected.entryReason ?? "-"}</div>
            <div className="rextora-body"><span className="text-slate-500">신호 이유:</span> {selected.signalReason ?? displayLabel(selected.signalType)}</div>
            <div className="rextora-body"><span className="text-slate-500">비용 판단:</span> {selected.costPassed ? "통과" : "차단"}</div>
            <div className="rextora-body"><span className="text-slate-500">리스크 판단:</span> {selected.riskPassed ? "통과" : "차단"}</div>
            {selected.blockReason && <div className="rextora-body md:col-span-2 text-red-300">차단 사유: {selected.blockReason}</div>}
            <div className="rextora-body"><span className="text-slate-500">최종 상태:</span> {selected.status}</div>
          </div>
        </Card>
      )}
    </div>
  );
}
