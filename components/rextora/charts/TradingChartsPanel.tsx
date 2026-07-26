"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, LineChart, Loader2, WifiOff } from "lucide-react";
import { Card, Metric } from "@/components/ui/primitives";
import {
  CandlestickChart,
  EquityCurveChart,
  TimelineChart,
  BarChart,
} from "@/components/rextora/charts";
import {
  candlesToPoints,
  metricsDailyPnl,
  metricsFeeFunding,
  metricsToEquitySpark,
  positionLevels,
  positionExposureSeries,
  unifiedTradesToTimeline,
} from "@/src/lib/rextora/charts/adapters";
import type { UnifiedMetricsSnapshot } from "@/src/lib/rextora/metrics/types";
import type { UnifiedRiskView } from "@/src/lib/rextora/metrics/types";
import type { CandlePoint } from "@/src/lib/rextora/charts/types";
import type { ReactNode } from "react";

function IdlePanel(props: {
  message: string;
  hint: string;
  icon: ReactNode;
  actionHref?: string;
  actionLabel?: string;
  testId?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700/80 bg-slate-950/40 px-6 text-center ${
        props.compact ? "py-6" : "py-10"
      }`}
      data-testid={props.testId ?? "chart-empty-state"}
    >
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl border border-slate-700/70 bg-slate-900/80 text-slate-400">
        {props.icon}
      </div>
      <p className="rextora-body font-medium text-slate-200">{props.message}</p>
      <p className="rextora-helper mt-2 max-w-md">{props.hint}</p>
      {props.actionHref && props.actionLabel ? (
        <Link
          href={props.actionHref}
          className="mt-4 inline-flex items-center rounded-lg border border-sky-500/40 bg-sky-600/90 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500"
        >
          {props.actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function TradingChartsPanel({
  mode,
  metrics,
  riskView,
  symbol,
  sessionActive = true,
}: {
  mode: "PAPER" | "LIVE";
  metrics: UnifiedMetricsSnapshot | null;
  riskView?: UnifiedRiskView | null;
  symbol?: string;
  /** When false, hide zero-filled metric grids and show idle guidance. */
  sessionActive?: boolean;
}) {
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const [candlesLoading, setCandlesLoading] = useState(true);
  const [candlesFailed, setCandlesFailed] = useState(false);
  const activeSymbol = symbol ?? metrics?.positions[0]?.symbol ?? "BTCUSDT";
  const isLive = mode === "LIVE";

  useEffect(() => {
    if (!sessionActive) return;
    let active = true;
    const load = async () => {
      setCandlesLoading(true);
      try {
        const res = await fetch(
          `/api/rextora/charts/candles?symbol=${activeSymbol}&interval=15m&limit=180`,
        );
        const json = await res.json();
        if (!active) return;
        if (json.ok && json.data?.candles?.length) {
          setCandles(candlesToPoints(json.data.candles));
          setCandlesFailed(false);
        } else {
          setCandles([]);
          setCandlesFailed(true);
        }
      } catch {
        if (!active) return;
        setCandles([]);
        setCandlesFailed(true);
      } finally {
        if (active) setCandlesLoading(false);
      }
    };
    void load();
    const t = setInterval(() => void load(), isLive ? 15_000 : 30_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [activeSymbol, isLive, sessionActive]);

  const pos = metrics?.positions[0];
  const { markers, levels } = useMemo(() => {
    if (!pos || pos.side === "FLAT") return { markers: [], levels: [] };
    return positionLevels({
      entry: pos.entryPrice,
      current: pos.currentPrice,
      stopLoss: pos.stopLoss,
      takeProfit: pos.takeProfit,
      side: pos.side,
      liquidation:
        pos.side === "LONG"
          ? pos.entryPrice * (1 - 1 / Math.max(pos.leverage, 1))
          : pos.entryPrice * (1 + 1 / Math.max(pos.leverage, 1)),
    });
  }, [pos]);

  const equity = metrics ? metricsToEquitySpark(metrics) : null;
  const daily = metrics ? metricsDailyPnl(metrics) : null;
  const costs = metrics ? metricsFeeFunding(metrics) : null;
  const timeline = metrics ? unifiedTradesToTimeline(metrics.recentTrades) : [];
  const openCount = metrics?.openPositionCount ?? riskView?.openPositions ?? 0;
  const exposure =
    metrics && metrics.positions.length > 0
      ? positionExposureSeries(metrics.positions, metrics.accountEquity)
      : null;

  const warnTone = isLive ? "danger" : "default";
  const usage = metrics?.riskUsagePct ?? riskView?.usagePct ?? 0;
  const limitAbs = Math.abs(riskView?.dailyLossLimitPct ?? 5);
  const hasTrades = (metrics?.recentTrades?.length ?? 0) > 0;

  if (!sessionActive) {
    return (
      <div
        className="space-y-4"
        data-testid={`trading-charts-${mode.toLowerCase()}`}
      >
        <Card title={isLive ? "실전 차트·지표" : "모의 차트·지표"}>
          <IdlePanel
            testId={isLive ? "live-charts-idle" : "paper-charts-idle"}
            icon={<Activity className="h-5 w-5" aria-hidden />}
            message="아직 거래가 시작되지 않았습니다."
            hint={
              isLive
                ? "안전 게이트를 통과한 뒤 실전 매매를 시작하면 차트와 지표가 표시됩니다."
                : "모의매매를 시작하면 차트·손익·거래 내역이 여기에 표시됩니다."
            }
            actionHref={isLive ? "/settings" : "/results"}
            actionLabel={
              isLive ? "시스템 설정에서 실전 허용 확인" : "탐색 결과에서 전략 등록"
            }
          />
        </Card>
      </div>
    );
  }

  return (
    <div
      className="space-y-4"
      data-testid={`trading-charts-${mode.toLowerCase()}`}
    >
      <Card title={isLive ? "실전 리스크 요약" : "모의 지표 요약"}>
        <div
          className={`grid gap-3 md:grid-cols-4 ${isLive ? "rounded-lg border border-orange-500/30 p-2" : ""}`}
        >
          <Metric
            label="현재 자산"
            value={`${metrics?.accountEquity ?? "-"} USDT`}
          />
          <Metric
            label="오늘 손익"
            value={`${metrics?.todayRealizedPnlUsdt ?? 0} USDT`}
            tone={
              (metrics?.todayRealizedPnlUsdt ?? 0) >= 0 ? "success" : "danger"
            }
          />
          <Metric label="열린 포지션" value={openCount} />
          <Metric
            label="사용 중인 포지션 슬롯"
            value={`${openCount} / ${riskView?.maxPositions ?? "-"}`}
          />
          <Metric
            label="손실 한도 사용률"
            value={`${usage}%`}
            tone={usage >= 100 ? "danger" : usage >= 70 ? "warning" : warnTone}
          />
          <Metric
            label="남은 손실 여유"
            value={`${(riskView?.remainingDailyLossPct ?? limitAbs).toFixed(2)}%`}
          />
          {isLive && (
            <>
              <Metric
                label="미실현 손익"
                value={`${metrics?.todayUnrealizedPnlUsdt ?? 0} USDT`}
                tone={
                  (metrics?.todayUnrealizedPnlUsdt ?? 0) >= 0
                    ? "success"
                    : "danger"
                }
              />
              <Metric
                label="오늘 손실 한도"
                value={`${limitAbs.toFixed(2)}%`}
                tone="danger"
              />
              <Metric
                label="청산 위험가"
                value={
                  pos && pos.side !== "FLAT"
                    ? `${(pos.side === "LONG" ? pos.entryPrice * (1 - 1 / Math.max(pos.leverage, 1)) : pos.entryPrice * (1 + 1 / Math.max(pos.leverage, 1))).toFixed(2)}`
                    : "-"
                }
                tone="danger"
              />
              <Metric
                label="오늘 실현 손실"
                value={`${Math.min(0, metrics?.todayRealizedPnlUsdt ?? 0)} USDT`}
                tone="danger"
              />
            </>
          )}
        </div>
      </Card>

      {candlesLoading ? (
        <Card title={`${activeSymbol} · ${isLive ? "실전 매매" : "모의 매매"}`}>
          <IdlePanel
            testId="chart-loading"
            icon={<Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
            message="데이터를 불러오는 중입니다."
            hint="차트와 시장 데이터를 준비하고 있습니다."
          />
        </Card>
      ) : candlesFailed || candles.length === 0 ? (
        <Card title={`${activeSymbol} · ${isLive ? "실전 매매" : "모의 매매"}`}>
          <IdlePanel
            testId="chart-no-market-data"
            icon={<WifiOff className="h-5 w-5" aria-hidden />}
            message="시장 데이터를 불러오지 못했습니다."
            hint="네트워크 연결과 심볼 설정을 확인한 뒤 다시 시도하세요."
            actionHref="/settings"
            actionLabel="시스템 설정 확인"
          />
        </Card>
      ) : (
        <CandlestickChart
          title={`${activeSymbol} · ${mode === "LIVE" ? "실전 매매" : "모의 매매"}`}
          candles={candles}
          markers={markers}
          levels={levels}
          height={320}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {equity && equity.data.length > 1 ? (
          <EquityCurveChart title="손익 곡선" series={equity} height={180} />
        ) : (
          <Card title="손익 곡선">
            <IdlePanel
              testId="chart-no-trades-equity"
              icon={<LineChart className="h-5 w-5" aria-hidden />}
              message="아직 거래가 발생하지 않았습니다."
              hint="전략 신호가 체결되면 손익 곡선이 표시됩니다."
            />
          </Card>
        )}
        {daily && daily.data.length > 0 ? (
          <BarChart
            title="일별 자산·손익"
            series={daily}
            height={180}
            diverging
          />
        ) : (
          <Card title="일별 자산·손익">
            <IdlePanel
              testId="chart-no-trades-daily"
              icon={<LineChart className="h-5 w-5" aria-hidden />}
              message="아직 거래가 발생하지 않았습니다."
              hint="일별 손익은 거래가 쌓인 뒤 표시됩니다."
            />
          </Card>
        )}
      </div>

      {exposure && exposure.data.length > 0 ? (
        <BarChart title="코인별 포지션 노출도" series={exposure} height={180} />
      ) : (
        <Card title="포지션 노출도" className="!p-3">
          <IdlePanel
            testId="chart-no-positions"
            icon={<Activity className="h-5 w-5" aria-hidden />}
            message="아직 거래가 발생하지 않았습니다."
            hint="포지션이 열리면 코인별 노출·증거금이 표시됩니다."
            compact
          />
        </Card>
      )}

      {costs &&
        (costs.fees.data.length > 0 || costs.funding.data.length > 0) && (
          <div className="grid gap-4 lg:grid-cols-2">
            <EquityCurveChart
              title="수수료 내역"
              series={costs.fees}
              height={160}
              area={false}
            />
            <EquityCurveChart
              title="펀딩비 내역"
              series={costs.funding}
              height={160}
              area={false}
            />
          </div>
        )}

      {hasTrades ? (
        <TimelineChart title="최근 거래" events={timeline} height={140} />
      ) : (
        <Card title="최근 거래">
          <IdlePanel
            testId="chart-no-trades-timeline"
            icon={<Activity className="h-5 w-5" aria-hidden />}
            message="아직 거래가 발생하지 않았습니다."
            hint="체결된 거래가 생기면 타임라인에 표시됩니다."
          />
        </Card>
      )}

      {isLive && (
        <p className="text-xs text-orange-300">
          실전 매매 화면입니다. 차트는 지표만 표시하며 주문을 넣지 않습니다.
          안전 조건이 충족될 때만 실전 주문이 가능합니다.
        </p>
      )}
    </div>
  );
}
