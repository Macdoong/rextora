"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, Metric } from "@/components/ui/primitives";
import { CandlestickChart, EquityCurveChart, TimelineChart, BarChart } from "@/components/rextora/charts";
import {
  candlesToPoints,
  metricsDailyPnl,
  metricsFeeFunding,
  metricsToEquitySpark,
  positionLevels,
  riskExposureSeries,
  unifiedTradesToTimeline
} from "@/src/lib/rextora/charts/adapters";
import type { UnifiedMetricsSnapshot } from "@/src/lib/rextora/metrics/types";
import type { UnifiedRiskView } from "@/src/lib/rextora/metrics/types";
import type { CandlePoint } from "@/src/lib/rextora/charts/types";
import { uiLabel } from "@/src/lib/rextora/displayLabels";

export function TradingChartsPanel({
  mode,
  metrics,
  riskView,
  symbol
}: {
  mode: "PAPER" | "LIVE";
  metrics: UnifiedMetricsSnapshot | null;
  riskView?: UnifiedRiskView | null;
  symbol?: string;
}) {
  const [candles, setCandles] = useState<CandlePoint[]>([]);
  const activeSymbol = symbol ?? metrics?.positions[0]?.symbol ?? "BTCUSDT";
  const isLive = mode === "LIVE";

  useEffect(() => {
    let active = true;
    const load = async () => {
      const res = await fetch(`/api/rextora/charts/candles?symbol=${activeSymbol}&interval=15m&limit=180`);
      const json = await res.json();
      if (!active) return;
      if (json.ok && json.data?.candles) {
        setCandles(candlesToPoints(json.data.candles));
      }
    };
    void load();
    const t = setInterval(() => void load(), isLive ? 15_000 : 30_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [activeSymbol, isLive]);

  const pos = metrics?.positions[0];
  const { markers, levels } = useMemo(() => {
    if (!pos || pos.side === "FLAT") return { markers: [], levels: [] };
    return positionLevels({
      entry: pos.entryPrice,
      current: pos.currentPrice,
      stopLoss: pos.stopLoss,
      takeProfit: pos.takeProfit,
      side: pos.side,
      liquidation: pos.side === "LONG" ? pos.entryPrice * (1 - 1 / Math.max(pos.leverage, 1)) : pos.entryPrice * (1 + 1 / Math.max(pos.leverage, 1))
    });
  }, [pos]);

  const equity = metrics ? metricsToEquitySpark(metrics) : null;
  const daily = metrics ? metricsDailyPnl(metrics) : null;
  const costs = metrics ? metricsFeeFunding(metrics) : null;
  const timeline = metrics ? unifiedTradesToTimeline(metrics.recentTrades) : [];
  const openCount = metrics?.openPositionCount ?? riskView?.openPositions ?? 0;
  const exposure =
    riskView && openCount > 0
      ? riskExposureSeries({ ...riskView, openPositions: openCount })
      : null;

  const warnTone = isLive ? "danger" : "default";
  const usage = metrics?.riskUsagePct ?? riskView?.usagePct ?? 0;
  const limitAbs = Math.abs(riskView?.dailyLossLimitPct ?? 5);

  return (
    <div className="space-y-4" data-testid={`trading-charts-${mode.toLowerCase()}`}>
      <Card title={isLive ? "실전 리스크 요약" : "모의 지표 요약"}>
        <div className={`grid gap-3 md:grid-cols-4 ${isLive ? "rounded-lg border border-orange-500/30 p-2" : ""}`}>
          <Metric label="현재 자산" value={`${metrics?.accountEquity ?? "-"} USDT`} />
          <Metric
            label="오늘 손익"
            value={`${metrics?.todayRealizedPnlUsdt ?? 0} USDT`}
            tone={(metrics?.todayRealizedPnlUsdt ?? 0) >= 0 ? "success" : "danger"}
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
          <Metric label="남은 손실 여유" value={`${(riskView?.remainingDailyLossPct ?? limitAbs).toFixed(2)}%`} />
          {isLive && (
            <>
              <Metric
                label="미실현 손익"
                value={`${metrics?.todayUnrealizedPnlUsdt ?? 0} USDT`}
                tone={(metrics?.todayUnrealizedPnlUsdt ?? 0) >= 0 ? "success" : "danger"}
              />
              <Metric label="오늘 손실 한도" value={`${limitAbs.toFixed(2)}%`} tone="danger" />
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

      <CandlestickChart
        title={`${activeSymbol} · ${mode === "LIVE" ? "실전 매매" : "모의 매매"}`}
        candles={candles}
        markers={markers}
        levels={levels}
        height={320}
      />

      {candles.length === 0 && (
        <p className="text-sm text-slate-400">차트 데이터가 없습니다. 네트워크 연결 또는 심볼을 확인하세요.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {equity && equity.data.length > 1 ? (
          <EquityCurveChart title="손익 곡선" series={equity} height={180} />
        ) : (
          <Card title="손익 곡선">
            <p className="text-sm text-slate-400">거래가 쌓이면 손익 곡선이 표시됩니다.</p>
          </Card>
        )}
        {daily && daily.data.length > 0 ? (
          <BarChart title="일별 자산·손익" series={daily} height={180} diverging />
        ) : (
          <Card title="일별 자산·손익">
            <p className="text-sm text-slate-400">일별 손익 데이터가 아직 없습니다.</p>
          </Card>
        )}
      </div>

      {exposure && <BarChart title="포지션 노출도" series={exposure} height={120} />}

      {costs && (costs.fees.data.length > 0 || costs.funding.data.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <EquityCurveChart title="수수료 내역" series={costs.fees} height={160} area={false} />
          <EquityCurveChart title="펀딩비 내역" series={costs.funding} height={160} area={false} />
        </div>
      )}

      <TimelineChart title="최근 거래" events={timeline} height={140} />

      {isLive && (
        <p className="text-xs text-orange-300">
          실전 매매 화면입니다. 차트는 지표만 표시하며 주문을 넣지 않습니다. 안전 조건이 충족될 때만 실전 주문이 가능합니다.
        </p>
      )}
    </div>
  );
}
