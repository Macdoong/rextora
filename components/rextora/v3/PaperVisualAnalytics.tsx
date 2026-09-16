"use client";

import { useState } from "react";
import { V3Card } from "@/components/rextora/v3/V3Card";
import {
  paperOperatorCapitalDelta,
  paperOperatorCloseReasonPresentation,
  paperOperatorCumulativeRealizedPnl,
  paperOperatorNewestFirstToChronological,
  paperOperatorScaledSeries,
  paperOperatorSidePresentation,
  paperOperatorSignedFinancialText,
  paperOperatorSignedFinancialTone,
  paperOperatorTradeSetSummary,
  paperOperatorTradeTooltipModel,
} from "@/src/lib/rextora/paper/paperOperatorPresentation";

export type PaperVisualAnalyticsTrade = {
  time: string;
  symbol: string;
  direction: string;
  exitReason: string;
  netPnl: number | null;
  pnlPct: number | null;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function formatAxisNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 100) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

function formatWinRate(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "확인 필요";
  const rounded = Number(value.toFixed(1));
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
}

type TooltipState = {
  index: number;
  xPct: number;
  yPct: number;
};

function PaperChartTooltip({
  tooltip,
  trades,
  cumulative,
}: {
  tooltip: TooltipState;
  trades: PaperVisualAnalyticsTrade[];
  cumulative: number[];
}) {
  const trade = trades[tooltip.index];
  if (!trade) return null;
  const model = paperOperatorTradeTooltipModel({
    time: trade.time,
    symbol: trade.symbol,
    direction: trade.direction,
    exitReason: trade.exitReason,
    netPnl: trade.netPnl,
    pnlPct: trade.pnlPct,
    cumulativePnl: cumulative[tooltip.index] ?? null,
  });
  return (
    <div
      className="v3-pp-tooltip"
      data-testid="paper-chart-tooltip"
      style={{ left: `${tooltip.xPct}%`, top: `${tooltip.yPct}%` }}
    >
      <p>
        <span>시각</span>
        <b>{model.time}</b>
      </p>
      <p>
        <span>심볼</span>
        <b>{model.symbol}</b>
      </p>
      <p>
        <span>방향</span>
        <b>{model.side}</b>
      </p>
      <p>
        <span>종료 사유</span>
        <b>{model.closeReason}</b>
      </p>
      <p>
        <span>실현손익</span>
        <b>
          {model.realizedPnl}
          {model.realizedPnlPct ? ` (${model.realizedPnlPct})` : ""}
        </b>
      </p>
      <p>
        <span>누적 실현손익</span>
        <b>{model.cumulativePnl}</b>
      </p>
    </div>
  );
}

function PaperCumulativeChart({
  trades,
  values,
  title,
  focusedIndex,
  onFocus,
}: {
  trades: PaperVisualAnalyticsTrade[];
  values: number[];
  title: string;
  focusedIndex: number | null;
  onFocus: (index: number | null) => void;
}) {
  const width = 640;
  const height = 132;
  const pad = { top: 12, right: 12, bottom: 24, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const scaled = paperOperatorScaledSeries(values, plotW, plotH);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  if (scaled.points.length < 2) return null;
  const d = scaled.points
    .map((p, i) => `${i === 0 ? "M" : "L"}${pad.left + p.x} ${pad.top + p.y}`)
    .join(" ");
  const zeroY =
    pad.top +
    (scaled.max === scaled.min
      ? plotH / 2
      : plotH - ((0 - scaled.min) / (scaled.max - scaled.min || 1)) * plotH);
  const last = scaled.points[scaled.points.length - 1];
  const lastTone = paperOperatorSignedFinancialTone(last?.value);
  const ticks = [scaled.min, 0, scaled.max].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  );
  const startLabel = trades[0]?.time ?? "";
  const endLabel = trades[trades.length - 1]?.time ?? "";

  return (
    <div
      className="v3-pp-chart v3-chart-reveal"
      data-testid="paper-cumulative-pnl"
      onMouseLeave={() => {
        setTooltip(null);
        onFocus(null);
      }}
    >
      <p className="v3-pp-chart-title">{title}</p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={title}
        preserveAspectRatio="xMidYMid meet"
      >
        <line
          x1={pad.left}
          x2={pad.left + plotW}
          y1={zeroY}
          y2={zeroY}
          className="v3-pp-chart-zero"
        />
        {ticks.map((tick) => {
          const y =
            pad.top +
            plotH -
            ((tick - scaled.min) / (scaled.max - scaled.min || 1)) * plotH;
          return (
            <text
              key={tick}
              x={pad.left - 6}
              y={y + 3}
              textAnchor="end"
              className="v3-pp-chart-axis"
            >
              {formatAxisNumber(tick)}
            </text>
          );
        })}
        <path
          d={d}
          className={cx("v3-pp-chart-line", "v3-chart-line", `is-${lastTone}`)}
        />
        {scaled.points.map((p, i) => (
          <circle
            key={i}
            cx={pad.left + p.x}
            cy={pad.top + p.y}
            r={focusedIndex === i ? 5 : i === scaled.points.length - 1 ? 3.5 : 2.5}
            className={cx(
              "v3-pp-chart-dot",
              "v3-chart-marker",
              `is-${paperOperatorSignedFinancialTone(p.value)}`,
              focusedIndex === i && "is-focused",
            )}
            onMouseEnter={() => {
              onFocus(i);
              setTooltip({
                index: i,
                xPct: ((pad.left + p.x) / width) * 100,
                yPct: ((pad.top + p.y) / height) * 100,
              });
            }}
          />
        ))}
        <text
          x={pad.left}
          y={height - 6}
          className="v3-pp-chart-axis"
          textAnchor="start"
        >
          {startLabel}
        </text>
        <text
          x={pad.left + plotW}
          y={height - 6}
          className="v3-pp-chart-axis"
          textAnchor="end"
        >
          {endLabel}
        </text>
      </svg>
      {tooltip ? (
        <PaperChartTooltip
          tooltip={tooltip}
          trades={trades}
          cumulative={values}
        />
      ) : null}
    </div>
  );
}

function PaperPnlBars({
  trades,
  values,
  cumulative,
  focusedIndex,
  onFocus,
}: {
  trades: PaperVisualAnalyticsTrade[];
  values: number[];
  cumulative: number[];
  focusedIndex: number | null;
  onFocus: (index: number | null) => void;
}) {
  const width = 640;
  const height = 88;
  const pad = { top: 8, right: 8, bottom: 8, left: 8 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const scaled = paperOperatorScaledSeries(values, plotW, plotH);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  if (scaled.points.length < 2) return null;
  const zeroY =
    pad.top +
    (scaled.max === scaled.min
      ? plotH / 2
      : plotH - ((0 - scaled.min) / (scaled.max - scaled.min || 1)) * plotH);
  const barW = Math.max(3, (plotW / values.length) * 0.62);

  return (
    <div
      className="v3-pp-chart v3-chart-reveal"
      data-testid="paper-trade-pnl-bars"
      onMouseLeave={() => {
        setTooltip(null);
        onFocus(null);
      }}
    >
      <p className="v3-pp-chart-title">거래별 실현손익</p>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="거래별 실현손익"
        preserveAspectRatio="xMidYMid meet"
      >
        <line
          x1={pad.left}
          x2={pad.left + plotW}
          y1={zeroY}
          y2={zeroY}
          className="v3-pp-chart-zero"
        />
        {values.map((value, i) => {
          const x =
            pad.left + ((i + 0.5) / values.length) * plotW - barW / 2;
          const y =
            pad.top +
            plotH -
            ((value - scaled.min) / (scaled.max - scaled.min || 1)) * plotH;
          const top = Math.min(y, zeroY);
          const h = Math.max(1, Math.abs(y - zeroY));
          return (
            <rect
              key={i}
              x={x}
              y={top}
              width={barW}
              height={h}
              rx={1}
              className={cx(
                "v3-pp-bar",
                `is-${paperOperatorSignedFinancialTone(value)}`,
                focusedIndex === i && "is-focused",
              )}
              onMouseEnter={() => {
                onFocus(i);
                setTooltip({
                  index: i,
                  xPct: ((x + barW / 2) / width) * 100,
                  yPct: (top / height) * 100,
                });
              }}
            />
          );
        })}
      </svg>
      {tooltip ? (
        <PaperChartTooltip
          tooltip={tooltip}
          trades={trades}
          cumulative={cumulative}
        />
      ) : null}
    </div>
  );
}

function SingleTradeOutcome({ trade }: { trade: PaperVisualAnalyticsTrade }) {
  const pnl = trade.netPnl;
  const tone = paperOperatorSignedFinancialTone(pnl);
  const close = paperOperatorCloseReasonPresentation(trade.exitReason);
  const side = paperOperatorSidePresentation(trade.direction);
  return (
    <div className="v3-pp-outcome v3-screen-in" data-testid="paper-single-trade-outcome">
      <p className="v3-pp-chart-title">완료 거래 1건</p>
      <div className="v3-pp-outcome-row">
        <span className="v3-pp-outcome-symbol">{trade.symbol}</span>
        <span className={cx("v3-pp-chip", `is-${side.tone}`)}>{side.label}</span>
        <span className={cx("v3-pp-chip", `is-${close.tone}`)}>{close.label}</span>
      </div>
      <b className={cx("v3-pp-outcome-pnl", `is-${tone}`)}>
        {paperOperatorSignedFinancialText(pnl, " USDT")}
        {trade.pnlPct != null && Number.isFinite(trade.pnlPct)
          ? ` (${paperOperatorSignedFinancialText(trade.pnlPct, "%")})`
          : ""}
      </b>
      <p className="v3-pp-outcome-time">{trade.time}</p>
    </div>
  );
}

export function PaperVisualAnalytics({
  scope,
  scopeComplete,
  startCapital,
  currentCapital,
  realizedPnl,
  trades,
  focusedChronoIndex = null,
  onFocusChronoIndex,
}: {
  scope: "session" | "all";
  scopeComplete: boolean;
  startCapital: number | null;
  currentCapital: number | null;
  realizedPnl: number | null;
  trades: PaperVisualAnalyticsTrade[];
  focusedChronoIndex?: number | null;
  onFocusChronoIndex?: (index: number | null) => void;
}) {
  const delta =
    startCapital != null && currentCapital != null
      ? paperOperatorCapitalDelta(startCapital, currentCapital)
      : null;
  const chrono = paperOperatorNewestFirstToChronological(trades);
  const pnls = chrono
    .map((trade) => trade.netPnl)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const showCumulative = scopeComplete && pnls.length > 1;
  const showSingle = scopeComplete && pnls.length === 1;
  const cumulative = showCumulative
    ? paperOperatorCumulativeRealizedPnl(pnls)
    : [];
  const summary =
    scope === "all" && showCumulative
      ? paperOperatorTradeSetSummary(pnls)
      : null;
  const scopeLabel = scope === "session" ? "현재 세션" : "전체 거래";
  const cumulativeTitle =
    scope === "session"
      ? "현재 세션 누적 실현손익"
      : "전체 거래 누적 실현손익";
  const pnlTone = paperOperatorSignedFinancialTone(
    scope === "all" && summary ? summary.totalRealizedPnl : realizedPnl,
  );
  const setFocus = onFocusChronoIndex ?? (() => undefined);

  return (
    <V3Card
      className="v3-pp-full"
      title="성과"
      meta={scopeLabel}
      data-testid="paper-visual-analytics"
    >
      {summary ? (
        <div className="v3-pp-kpi" data-testid="paper-global-summary">
          <div className="v3-pp-kpi-cell v3-kpi-pop">
            <span>거래</span>
            <b>{summary.totalTrades}건</b>
          </div>
          <div className={cx("v3-pp-kpi-cell", "v3-kpi-pop", `is-${pnlTone}`)}>
            <span>실현손익</span>
            <b>
              {paperOperatorSignedFinancialText(summary.totalRealizedPnl, " USDT")}
            </b>
          </div>
          <div className="v3-pp-kpi-cell v3-kpi-pop">
            <span>승 / 패 / 보합</span>
            <b>
              {summary.wins} / {summary.losses} / {summary.zeros}
            </b>
          </div>
          <div className="v3-pp-kpi-cell v3-kpi-pop">
            <span>승률</span>
            <b>{formatWinRate(summary.winRatePct)}</b>
          </div>
          <div className="v3-pp-kpi-cell v3-kpi-pop is-positive">
            <span>최고</span>
            <b>{paperOperatorSignedFinancialText(summary.bestTrade, " USDT")}</b>
          </div>
          <div className="v3-pp-kpi-cell v3-kpi-pop is-negative">
            <span>최저</span>
            <b>{paperOperatorSignedFinancialText(summary.worstTrade, " USDT")}</b>
          </div>
        </div>
      ) : null}
      <div className="v3-pp-analytics">
        <div className="v3-pp-analytics-main">
          {showCumulative ? (
            <>
              <PaperCumulativeChart
                trades={chrono}
                values={cumulative}
                title={cumulativeTitle}
                focusedIndex={focusedChronoIndex}
                onFocus={setFocus}
              />
              <PaperPnlBars
                trades={chrono}
                values={pnls}
                cumulative={cumulative}
                focusedIndex={focusedChronoIndex}
                onFocus={setFocus}
              />
            </>
          ) : showSingle ? (
            <SingleTradeOutcome trade={chrono[0]!} />
          ) : scope === "all" && !scopeComplete ? (
            <p className="v3-pp-analytics-note">
              로드된 거래가 전체 기록이 아닐 수 있어 누적 곡선은 표시하지
              않습니다. 아래 목록은 최근 로드분입니다.
            </p>
          ) : (
            <p className="v3-pp-analytics-note">표시할 완료 거래가 없습니다.</p>
          )}
        </div>
        <div className="v3-pp-analytics-side">
          {delta ? (
            <div className="v3-pp-delta v3-screen-in" data-testid="paper-capital-delta">
              <p className="v3-pp-chart-title">현재 세션 자본 변화</p>
              <p className="v3-pp-delta-flow">
                <span>
                  시작
                  <b>{delta.start.toFixed(2)}</b>
                </span>
                <em aria-hidden="true">→</em>
                <span>
                  현재
                  <b>{delta.current.toFixed(2)} USDT</b>
                </span>
              </p>
              <b className={cx("v3-pp-delta-abs", `is-${delta.tone}`)}>
                {paperOperatorSignedFinancialText(delta.absolute, " USDT")}
                {delta.percent != null
                  ? ` (${paperOperatorSignedFinancialText(Number(delta.percent.toFixed(4)), "%")})`
                  : ""}
              </b>
            </div>
          ) : null}
          {scope === "session" ? (
            <div className={cx("v3-pp-delta", "is-pnl", "v3-screen-in")}>
              <p className="v3-pp-chart-title">실현 손익</p>
              <b className={cx("v3-pp-outcome-pnl", `is-${paperOperatorSignedFinancialTone(realizedPnl)}`)}>
                {paperOperatorSignedFinancialText(realizedPnl, " USDT")}
              </b>
            </div>
          ) : null}
        </div>
      </div>
    </V3Card>
  );
}
