"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Metric } from "@/components/ui/primitives";
import { formatLastCheckTime, positionProtectionTone } from "@/src/lib/rextora/displayLabels";
import type { TradingDashboardStatus } from "@/src/lib/rextora/tradingDashboardStatus";
import type { EngineResult, TradingMode } from "@/lib/types";

type DashboardPayload = {
  status: TradingDashboardStatus;
  runtime?: { lastHeartbeat?: string };
};

type ApiEnvelope<T> = { ok: boolean; data: T };

const POLL_MS = 4_000;

async function postAction(path: string, mode: TradingMode): Promise<EngineResult> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode })
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as EngineResult | null;
    return payload ?? { ok: false, mode, serviceState: "live-blocked", message: `${path} 요청 실패` };
  }
  return response.json() as Promise<EngineResult>;
}

function botTone(status: TradingDashboardStatus["botStatusLabel"]) {
  if (status === "실행 중") return "success" as const;
  if (status === "오류") return "danger" as const;
  if (status === "중지됨") return "warning" as const;
  return "default" as const;
}

function safetyTone(label: TradingDashboardStatus["safetyLabel"]) {
  if (label === "정상") return "success" as const;
  if (label === "차단") return "warning" as const;
  return "danger" as const;
}

function judgmentTone(judgment: string) {
  if (judgment === "진입 가능") return "success" as const;
  if (judgment === "관찰") return "warning" as const;
  return "default" as const;
}

function tradeResultTone(result: string) {
  if (result === "익절") return "success" as const;
  if (result === "손절" || result === "실패") return "danger" as const;
  return "warning" as const;
}

function formatPnlPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return "-";
  return value.toFixed(4);
}

export function TradingDashboard() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const dashRes = await fetch("/api/rextora/trading/dashboard", { cache: "no-store" });
      const dashBody = (await dashRes.json()) as ApiEnvelope<DashboardPayload>;
      if (dashBody.ok) {
        setData(dashBody.data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => void load(), POLL_MS);
    return () => {
      window.clearTimeout(boot);
      window.clearInterval(timer);
    };
  }, [load]);

  async function runAction(action: string, path: string, mode: TradingMode) {
    const result = await postAction(path, mode);
    setActionMessage(result.ok ? `${action}: ${result.message}` : result.blockedReasons?.[0] ?? result.message);
    await load();
  }

  const status = data?.status;
  const liveStartEnabled = Boolean(status?.canStartLive);
  const liveStartHelper = !status?.liveAllowed
    ? "설정에서 실전 거래 허용을 켜야 사용할 수 있습니다."
    : status?.liveBlockReason
      ? status.liveBlockReason
      : liveStartEnabled
        ? "실전 자동매매를 시작할 수 있습니다."
        : "실전 자동매매를 시작할 수 없습니다.";

  if (loading && !status) {
    return (
      <div className="space-y-4" data-testid="trading-dashboard">
        <p className="rextora-helper">자동매매 화면을 불러오는 중입니다...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="trading-dashboard">
      <Card title="운영 상태" data-testid="trading-status-bar">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="현재 모드" value={status?.modeLabel ?? "모의 거래"} tone={status?.modeLabel === "실전 거래" ? "danger" : "success"} />
          <Metric label="자동매매 상태" value={status?.botStatusLabel ?? "대기 중"} tone={botTone(status?.botStatusLabel ?? "대기 중")} />
          <Metric label="감시 코인 수" value={String(status?.operations.watchedSymbolCount ?? 0)} />
          <Metric label="보유 포지션 수" value={String(status?.operations.openPositionCount ?? 0)} />
          <Metric
            label="오늘 실현 손익"
            value={
              status?.todayStats?.realizedPnlUsdt != null
                ? `${status.todayStats.realizedPnlUsdt} USDT (${formatPnlPct(status.todayStats.realizedPnlPct)})`
                : formatPnlPct(status?.todayStats.realizedPnlPct)
            }
            tone={(status?.todayStats.realizedPnlPct ?? 0) >= 0 ? "success" : "danger"}
          />
          <Metric label="오늘 미실현" value={`${status?.todayStats?.unrealizedPnlUsdt ?? status?.metrics?.todayUnrealizedPnlUsdt ?? 0} USDT`} />
          <Metric label="오늘 거래 수" value={String(status?.todayStats.trades ?? 0)} />
          <Metric label="오늘 승률" value={`${status?.todayStats.winRate ?? 0}%`} />
          <Metric label="수수료" value={`${status?.todayStats?.feeUsdt ?? status?.metrics?.todayFeeUsdt ?? 0} USDT`} />
          <Metric label="펀딩" value={`${status?.todayStats?.fundingUsdt ?? status?.metrics?.todayFundingUsdt ?? 0} USDT`} />
          <Metric label="슬리피지" value={`${status?.todayStats?.slippageUsdt ?? status?.metrics?.todaySlippageUsdt ?? 0} USDT`} />
          <Metric label="현재 자본" value={`${status?.todayStats?.accountEquity ?? status?.metrics?.accountEquity ?? "-"} USDT`} />
          <Metric label="안전 상태" value={status?.safetyLabel ?? "정상"} tone={safetyTone(status?.safetyLabel ?? "정상")} />
          <Metric label="활성 전략" value={status?.activeStrategy?.name ?? "SAFE_v44_i4060"} />
          <Metric label="params_hash" value={status?.activeStrategy?.paramsHash ?? "-"} />
        </div>
        <p className="rextora-helper mt-3 text-slate-500">마지막 갱신: {formatLastCheckTime(status?.lastUpdatedAt)}</p>
      </Card>

      <Card title="주요 제어" data-testid="trading-controls">
        {!liveStartEnabled && (
          <p
            className={`rextora-helper mb-3 rounded-lg border p-3 ${
              !status?.liveAllowed
                ? "border-orange-500/30 bg-orange-500/10 text-orange-100"
                : "border-red-500/30 bg-red-500/10 text-red-100"
            }`}
            data-testid="live-start-helper"
          >
            {liveStartHelper}
          </p>
        )}
        {liveStartEnabled && (
          <p className="rextora-helper mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-100" data-testid="live-start-helper">
            {liveStartHelper}
          </p>
        )}
        {actionMessage && (
          <p className="rextora-helper mb-3 rounded-lg border border-slate-700 bg-slate-950/70 p-3 text-slate-200" data-testid="trading-action-message">
            {actionMessage}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Button tone="success" data-testid="paper-start" onClick={() => void runAction("모의 자동매매 시작", "/api/bot/start", "PAPER")}>
            모의 자동매매 시작
          </Button>
          <Button tone="warning" data-testid="paper-stop" onClick={() => void runAction("모의 자동매매 중지", "/api/bot/stop", "PAPER")}>
            모의 자동매매 중지
          </Button>
          <Button
            tone={liveStartEnabled ? "success" : "default"}
            data-testid="live-start"
            disabled={!liveStartEnabled}
            aria-disabled={!liveStartEnabled}
            onClick={() => {
              if (!liveStartEnabled) return;
              void runAction("실전 자동매매 시작", "/api/bot/start", "LIVE");
            }}
          >
            실전 자동매매 시작
          </Button>
          <Button tone="warning" data-testid="live-stop" onClick={() => void runAction("실전 자동매매 중지", "/api/bot/stop", "LIVE")}>
            실전 자동매매 중지
          </Button>
          <Button tone="danger" data-testid="emergency-stop" onClick={() => void runAction("긴급 중지", "/api/emergency/stop-all", "LIVE")}>
            긴급 중지
          </Button>
        </div>
        <div className="rextora-helper mt-3 space-y-1 text-slate-400">
          <p>모의 거래는 실제 주문을 넣지 않습니다.</p>
          <p>실전 거래는 Binance Futures에 실제 주문을 넣습니다.</p>
          <p>서버 손절/익절은 진입 직후 Binance에 보호 주문을 등록합니다.</p>
        </div>
      </Card>

      <Card title="보유 포지션" data-testid="trading-positions">
        {(status?.positions.length ?? 0) > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm text-slate-200">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-2 py-2">코인</th>
                  <th className="px-2 py-2">방향</th>
                  <th className="px-2 py-2">진입가</th>
                  <th className="px-2 py-2">현재가</th>
                  <th className="px-2 py-2">손절가</th>
                  <th className="px-2 py-2">익절가</th>
                  <th className="px-2 py-2">수익률</th>
                  <th className="px-2 py-2">보유 시간</th>
                  <th className="px-2 py-2">보호 상태</th>
                  <th className="px-2 py-2">모드</th>
                </tr>
              </thead>
              <tbody>
                {status?.positions.map((position) => (
                  <tr key={position.symbol} className="border-b border-slate-900/80" data-testid={`trading-position-row-${position.symbol}`}>
                    <td className="px-2 py-2">{position.symbol}</td>
                    <td className="px-2 py-2">{position.side}</td>
                    <td className="px-2 py-2">{formatPrice(position.entryPrice)}</td>
                    <td className="px-2 py-2">{formatPrice(position.currentPrice)}</td>
                    <td className="px-2 py-2">{formatPrice(position.stopLoss)}</td>
                    <td className="px-2 py-2">{formatPrice(position.takeProfit)}</td>
                    <td className={`px-2 py-2 ${position.pnlPct >= 0 ? "text-green-300" : "text-red-300"}`}>{formatPnlPct(position.pnlPct)}</td>
                    <td className="px-2 py-2">{position.holdTimeLabel}</td>
                    <td className="px-2 py-2">
                      <Badge tone={positionProtectionTone(position.protectionLabel)}>{position.protectionLabel}</Badge>
                    </td>
                    <td className="px-2 py-2">{position.modeLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rextora-helper text-slate-400">열린 포지션이 없습니다.</p>
        )}
      </Card>

      <Card title="감시 중인 기회" data-testid="trading-opportunities">
        <p className="rextora-helper mb-3 text-slate-400" data-testid="opportunity-guide">
          SAFE_v44 수학 시그널입니다. AI는 진입을 결정하지 않습니다. 진입 가능: 조건 통과 · 관찰: 미충족 · 제외: 비용/필터 차단
        </p>
        {(status?.opportunities.length ?? 0) > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm text-slate-200">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-2 py-2">코인</th>
                  <th className="px-2 py-2">방향</th>
                  <th className="px-2 py-2">전략</th>
                  <th className="px-2 py-2">점수</th>
                  <th className="px-2 py-2">판단</th>
                  <th className="px-2 py-2">사유</th>
                </tr>
              </thead>
              <tbody>
                {status?.opportunities.map((row, index) => (
                  <tr key={`${row.symbol}-${index}`} className="border-b border-slate-900/80">
                    <td className="px-2 py-2">{row.symbol}</td>
                    <td className="px-2 py-2">{row.direction}</td>
                    <td className="px-2 py-2">{row.strategyLabel}</td>
                    <td className="px-2 py-2">{row.score.toFixed(1)}</td>
                    <td className="px-2 py-2">
                      <Badge tone={judgmentTone(row.judgment)}>{row.judgment}</Badge>
                    </td>
                    <td className="px-2 py-2 text-slate-400">{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rextora-helper text-slate-400">현재 감시 중인 기회가 없습니다.</p>
        )}
      </Card>

      <Card title="최근 거래" data-testid="trading-recent-trades">
        {(status?.recentTrades.length ?? 0) > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm text-slate-200">
              <thead className="border-b border-slate-800 text-slate-400">
                <tr>
                  <th className="px-2 py-2">시간</th>
                  <th className="px-2 py-2">코인</th>
                  <th className="px-2 py-2">방향</th>
                  <th className="px-2 py-2">진입가</th>
                  <th className="px-2 py-2">청산가</th>
                  <th className="px-2 py-2">결과</th>
                  <th className="px-2 py-2">손익</th>
                  <th className="px-2 py-2">청산 이유</th>
                  <th className="px-2 py-2">모드</th>
                </tr>
              </thead>
              <tbody>
                {status?.recentTrades.map((trade, index) => (
                  <tr key={`${trade.symbol}-${trade.time}-${index}`} className="border-b border-slate-900/80">
                    <td className="px-2 py-2">{trade.time}</td>
                    <td className="px-2 py-2">{trade.symbol}</td>
                    <td className="px-2 py-2">{trade.direction}</td>
                    <td className="px-2 py-2">{formatPrice(trade.entryPrice)}</td>
                    <td className="px-2 py-2">{formatPrice(trade.exitPrice)}</td>
                    <td className="px-2 py-2">
                      <Badge tone={tradeResultTone(trade.resultLabel)}>{trade.resultLabel}</Badge>
                    </td>
                    <td className={`px-2 py-2 ${(trade.pnlPct ?? 0) >= 0 ? "text-green-300" : "text-red-300"}`}>{formatPnlPct(trade.pnlPct)}</td>
                    <td className="px-2 py-2 text-slate-400">{trade.exitReasonLabel}</td>
                    <td className="px-2 py-2">{trade.modeLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rextora-helper text-slate-400">아직 완료된 거래가 없습니다.</p>
        )}
      </Card>

      <Card title="AI 분석 보고 요약" data-testid="trading-ai-report">
        <p className="rextora-helper text-slate-300">{status?.aiReportSummary ?? "완료된 거래 후 AI 분석 보고서가 여기에 표시됩니다."}</p>
        {(status?.aiReports?.length ?? 0) > 0 && (
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            {status?.aiReports.map((report) => (
              <li key={report.id}>
                <span className="text-slate-200">{report.symbol}</span> · {report.summary}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="학습 요약" data-testid="trading-learning-card">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Metric label="누적 거래 수" value={String(status?.learningView.totalTrades ?? 0)} />
          <Metric label="누적 승률" value={`${status?.learningView.winRate ?? 0}%`} />
          <Metric label="평균 손익률" value={formatPnlPct(status?.learningView.avgPnlPct)} />
          <Metric label="가장 성과 좋은 전략" value={status?.learningView.bestStrategy ?? "-"} />
          <Metric label="가장 성과 낮은 전략" value={status?.learningView.worstStrategy ?? "-"} />
        </div>
        <p className="rextora-helper mt-3 text-slate-400">
          최근 반영 내용: {status?.learningView.recentAdjustment ?? "아직 학습 반영 내역이 없습니다."}
        </p>
      </Card>
    </div>
  );
}
