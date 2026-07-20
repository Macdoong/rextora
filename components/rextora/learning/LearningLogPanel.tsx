"use client";

import { useMemo, useState } from "react";
import { Badge, Card } from "@/components/ui/primitives";
import {
  displayLabel,
  displayLearningLogPnl,
  displayLearningLogResult,
  displaySignalReason,
  learningLogResultTone
} from "@/src/lib/rextora/displayLabels";
import {
  isLearningCandidateLog,
  isLearningReflectionLog,
  isLearningSystemLog,
  isLearningTradeLog
} from "@/src/lib/rextora/learningLogCategories";
import type { LearningLogItem, SignalType } from "@/src/lib/rextora/types";

type LearningLogTab = "all" | "trade" | "reflection" | "system" | "candidate";

const BASE_TABS: Array<{ id: LearningLogTab; label: string; description: string }> = [
  {
    id: "trade",
    label: "거래 기록",
    description: "모의 또는 실전 거래가 실제로 실행되고 결과가 확정된 기록입니다."
  },
  {
    id: "reflection",
    label: "전략 성과",
    description: "전략 성과와 AI 분석 반영 요약을 확인합니다. AI는 진입을 결정하지 않습니다."
  },
  {
    id: "system",
    label: "시스템 이벤트",
    description: "자동매매 시작/중지, 긴급 중지, 오류, 실전 거래 차단 같은 중요한 이벤트입니다."
  },
  {
    id: "all",
    label: "AI 분석 보고",
    description: "완료 거래에 대한 AI 사후 분석과 전체 운영 기록을 함께 봅니다."
  }
];

const DEBUG_CANDIDATE_TAB = {
  id: "candidate" as const,
  label: "후보 기록(디버그)",
  description: "디버그 모드에서만 표시되는 내부 후보 관찰 기록입니다."
};

type Props = {
  logs: LearningLogItem[];
  showDebugCandidates: boolean;
  coinRates: Array<{ symbol: string; winRate: number; trades: number }>;
  signalRates: Array<{ signalType: SignalType; winRate: number; trades: number }>;
};

function formatDelta(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value}`;
}

function formatLeverage(value?: number): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return "-";
  return `${value}배`;
}

function modeLabelOf(log: LearningLogItem): string {
  return log.serviceState === "live-ready" ? "실전 거래" : "모의 거래";
}

export function LearningLogPanel({ logs, showDebugCandidates, coinRates, signalRates }: Props) {
  const tabs = showDebugCandidates ? [...BASE_TABS, DEBUG_CANDIDATE_TAB] : BASE_TABS;
  const [tab, setTab] = useState<LearningLogTab>("trade");
  const activeTab = tabs.find((item) => item.id === tab) ?? tabs[0];

  const filteredLogs = useMemo(() => {
    if (tab === "trade") return logs.filter(isLearningTradeLog);
    if (tab === "reflection") return logs.filter(isLearningReflectionLog);
    if (tab === "system") return logs.filter(isLearningSystemLog);
    if (tab === "candidate") return logs.filter(isLearningCandidateLog);
    return logs.filter(
      (log) =>
        isLearningTradeLog(log) ||
        isLearningReflectionLog(log) ||
        isLearningSystemLog(log) ||
        (showDebugCandidates && isLearningCandidateLog(log))
    );
  }, [logs, tab, showDebugCandidates]);

  return (
    <>
      <Card title="학습 기록 보기" data-testid="learning-log-tabs-card">
        <div className="mb-4 flex flex-wrap gap-2" data-testid="learning-log-tabs">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`learning-log-tab-${item.id}`}
              className={`rounded-full border px-3 py-1 text-sm ${
                tab === item.id
                  ? "border-violet-400 bg-violet-500/20 text-violet-100"
                  : "border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="rextora-helper mb-4 text-slate-400" data-testid="learning-log-tab-description">
          {activeTab.description}
        </p>

        {tab === "trade" && (
          <div className="overflow-x-auto" data-testid="learning-log-trade-table">
            <table className="rextora-table w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="px-2 py-2">시간</th>
                  <th className="px-2 py-2">코인</th>
                  <th className="px-2 py-2">방향</th>
                  <th className="px-2 py-2">결과</th>
                  <th className="px-2 py-2">손익</th>
                  <th className="px-2 py-2">청산 이유</th>
                  <th className="px-2 py-2">전략</th>
                  <th className="px-2 py-2">모드</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-800/60" data-testid={`learning-log-row-${log.id}`}>
                    <td className="px-2 py-2">{log.time}</td>
                    <td className="px-2 py-2">{log.symbol}</td>
                    <td className="px-2 py-2">{displayLabel(log.direction)}</td>
                    <td className="px-2 py-2">
                      <Badge tone={learningLogResultTone(log.result)}>{displayLearningLogResult(log.result)}</Badge>
                    </td>
                    <td
                      className={`px-2 py-2 ${
                        log.pnlPct !== null && log.pnlPct !== undefined && log.pnlPct >= 0
                          ? "text-green-300"
                          : log.pnlPct !== null && log.pnlPct !== undefined
                            ? "text-red-300"
                            : "text-slate-400"
                      }`}
                    >
                      {displayLearningLogPnl(log.pnlPct)}
                    </td>
                    <td className="px-2 py-2">{displayLabel(log.exitReason || "-")}</td>
                    <td className="px-2 py-2">{displaySignalReason(log.signalType)}</td>
                    <td className="px-2 py-2">{modeLabelOf(log)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "reflection" && (
          <div className="overflow-x-auto" data-testid="learning-log-reflection-table">
            <table className="rextora-table w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="px-2 py-2">시간</th>
                  <th className="px-2 py-2">코인</th>
                  <th className="px-2 py-2">반영 내용</th>
                  <th className="px-2 py-2">점수 보정</th>
                  <th className="px-2 py-2">레버리지 조정</th>
                  <th className="px-2 py-2">사유</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-800/60" data-testid={`learning-log-row-${log.id}`}>
                    <td className="px-2 py-2">{log.time}</td>
                    <td className="px-2 py-2">{log.symbol}</td>
                    <td className="px-2 py-2">{log.learningSummary ?? log.entryReason}</td>
                    <td className="px-2 py-2">{formatDelta(log.scoreDelta)}</td>
                    <td className="px-2 py-2">{formatLeverage(log.leverageAdjustment)}</td>
                    <td className="px-2 py-2 text-slate-400">{log.learningReason ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "system" && (
          <div className="overflow-x-auto" data-testid="learning-log-system-table">
            <table className="rextora-table w-full min-w-[700px] text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="px-2 py-2">시간</th>
                  <th className="px-2 py-2">이벤트</th>
                  <th className="px-2 py-2">내용</th>
                  <th className="px-2 py-2">모드</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-800/60" data-testid={`learning-log-row-${log.id}`}>
                    <td className="px-2 py-2">{log.time}</td>
                    <td className="px-2 py-2">
                      <Badge tone={log.eventType === "오류" || log.eventType === "긴급 중지" ? "danger" : "default"}>
                        {log.eventType ?? "-"}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-slate-300">{log.entryReason}</td>
                    <td className="px-2 py-2">{modeLabelOf(log)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "candidate" && showDebugCandidates && (
          <div className="overflow-x-auto" data-testid="learning-log-candidate-table">
            <table className="rextora-table w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="px-2 py-2">시간</th>
                  <th className="px-2 py-2">코인</th>
                  <th className="px-2 py-2">신호</th>
                  <th className="px-2 py-2">상태</th>
                  <th className="px-2 py-2">제외/보류 사유</th>
                  <th className="px-2 py-2">최종 점수</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-800/60" data-testid={`learning-log-row-${log.id}`}>
                    <td className="px-2 py-2">{log.time}</td>
                    <td className="px-2 py-2">{log.symbol}</td>
                    <td className="px-2 py-2">{displaySignalReason(log.signalType)}</td>
                    <td className="px-2 py-2">
                      <Badge tone="warning">{displayLabel(log.candidateStatus ?? "대기")}</Badge>
                    </td>
                    <td className="px-2 py-2 text-slate-400">{log.holdReason ?? log.blockedReason ?? "-"}</td>
                    <td className="px-2 py-2">{log.finalScore !== undefined && Number.isFinite(log.finalScore) ? log.finalScore.toFixed(1) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "all" && (
          <div className="overflow-x-auto" data-testid="learning-log-all-table">
            <table className="rextora-table w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="px-2 py-2">시간</th>
                  <th className="px-2 py-2">구분</th>
                  <th className="px-2 py-2">코인</th>
                  <th className="px-2 py-2">요약</th>
                  <th className="px-2 py-2">상태/결과</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="border-b border-slate-800/60" data-testid={`learning-log-row-${log.id}`}>
                    <td className="px-2 py-2">{log.time}</td>
                    <td className="px-2 py-2">{displayLabel(log.eventCategory ?? "-")}</td>
                    <td className="px-2 py-2">{log.symbol}</td>
                    <td className="px-2 py-2">
                      {isLearningReflectionLog(log) || isLearningSystemLog(log)
                        ? log.learningSummary ?? log.entryReason
                        : displaySignalReason(log.entryReason)}
                    </td>
                    <td className="px-2 py-2">
                      {isLearningTradeLog(log) ? (
                        <Badge tone={learningLogResultTone(log.result)}>{displayLearningLogResult(log.result)}</Badge>
                      ) : isLearningSystemLog(log) ? (
                        <Badge tone="default">{displayLabel(log.eventType ?? "시스템 이벤트")}</Badge>
                      ) : isLearningCandidateLog(log) ? (
                        <Badge tone="warning">{displayLabel(log.candidateStatus ?? "대기")}</Badge>
                      ) : (
                        <Badge tone="default">{displayLabel(log.eventType ?? "학습 반영")}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredLogs.length === 0 && (
          <p className="rextora-helper text-slate-400" data-testid="learning-log-empty">
            이 탭에 표시할 기록이 없습니다.
          </p>
        )}
      </Card>

      <div className="data-grid mt-3">
        <div className="col-span-12 xl:col-span-6">
          <Card title="코인별 승률">
            {coinRates.map((r) => (
              <div key={r.symbol} className="rextora-body mb-2 flex justify-between">
                <span>{r.symbol}</span>
                <span>
                  {r.winRate}% ({r.trades}건)
                </span>
              </div>
            ))}
          </Card>
        </div>
        <div className="col-span-12 xl:col-span-6">
          <Card title="전략별 승률">
            {signalRates.map((r) => (
              <div key={r.signalType} className="rextora-body mb-2 flex justify-between">
                <span>{displaySignalReason(r.signalType)}</span>
                <span>
                  {r.winRate}% ({r.trades}건)
                </span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
