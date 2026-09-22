"use client";

import { useMemo, useState } from "react";
import {
  PATTERN_LAYER_HELP,
  PREVIEW_ENTRY_RULE,
  PREVIEW_LAYER_MARK,
  PREVIEW_STOP_ATR,
  PREVIEW_STOP_RULE,
  PREVIEW_TP_ATR,
  PREVIEW_TP_RULE,
} from "./searchVisualCopy";

const ILLUSTRATIVE_CANDLES = [
  { o: 44, c: 49, h: 51, l: 42, bull: true },
  { o: 49, c: 45, h: 52, l: 43, bull: false },
  { o: 45, c: 53, h: 55, l: 44, bull: true },
  { o: 53, c: 50, h: 56, l: 48, bull: false },
  { o: 50, c: 58, h: 60, l: 49, bull: true },
  { o: 58, c: 54, h: 61, l: 52, bull: false },
  { o: 54, c: 62, h: 64, l: 53, bull: true },
  { o: 62, c: 67, h: 69, l: 60, bull: true },
  { o: 67, c: 61, h: 68, l: 59, bull: false },
  { o: 61, c: 66, h: 68, l: 60, bull: true },
  { o: 66, c: 72, h: 74, l: 64, bull: true },
  { o: 72, c: 68, h: 73, l: 66, bull: false },
  { o: 68, c: 74, h: 76, l: 67, bull: true },
  { o: 74, c: 70, h: 75, l: 68, bull: false },
  { o: 70, c: 76, h: 78, l: 69, bull: true },
  { o: 76, c: 73, h: 77, l: 71, bull: false },
] as const;

const VIEW = { w: 960, h: 520 };
const PLOT = { x0: 44, x1: 848, y0: 36, y1: 468 };
const PRICE_MIN = 36;
const PRICE_MAX = 82;
const ATR_STEP = 5.4;

function y(value: number): number {
  return (
    PLOT.y1 -
    ((value - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * (PLOT.y1 - PLOT.y0)
  );
}

function ruleLevels(side: "long" | "short") {
  const entry = side === "short" ? 70 : 58;
  const stop =
    side === "short"
      ? entry + PREVIEW_STOP_ATR * ATR_STEP
      : entry - PREVIEW_STOP_ATR * ATR_STEP;
  const takeProfit =
    side === "short"
      ? entry - PREVIEW_TP_ATR * ATR_STEP
      : entry + PREVIEW_TP_ATR * ATR_STEP;
  return { entry, stop, takeProfit };
}

function candleX(index: number, step: number): number {
  return PLOT.x0 + step * (index + 0.5);
}

export function StrategyVisualPreview({
  selectedIds,
  direction,
}: {
  selectedIds: readonly string[];
  direction: "both" | "long" | "short";
}) {
  const [bothExample, setBothExample] = useState<"long" | "short">("long");
  const visualSide = direction === "both" ? bothExample : direction;
  const showOb = selectedIds.includes("order_block");
  const showFvg = selectedIds.includes("fvg");
  const showEma = selectedIds.includes("ema_core");
  const showSr = selectedIds.includes("support_resistance");
  const showTrend = selectedIds.includes("trendline");
  const showSd = selectedIds.includes("supply_demand");
  const levels = useMemo(() => ruleLevels(visualSide), [visualSide]);
  const entryY = y(levels.entry);
  const stopY = y(levels.stop);
  const tpY = y(levels.takeProfit);
  const candleStep = (PLOT.x1 - PLOT.x0) / ILLUSTRATIVE_CANDLES.length;
  const bodyW = Math.max(8, candleStep * 0.42);
  const obCandle = ILLUSTRATIVE_CANDLES[3];
  const obX = candleX(3, candleStep) - bodyW * 0.7;
  const obTop = y(Math.max(obCandle.o, obCandle.c));
  const obHeight = Math.max(18, Math.abs(y(obCandle.o) - y(obCandle.c)) + 10);
  const fvgLeft = candleX(6, candleStep);
  const fvgWidth = candleStep * 1.6;
  const legendIds = selectedIds.filter((id) => PATTERN_LAYER_HELP[id]);

  return (
    <section
      className="ss-preview"
      data-testid="ss-strategy-preview"
      data-preview-side={visualSide}
      data-entry-rule="pattern-zone"
      data-stop-rule={`${PREVIEW_STOP_ATR}-atr`}
      data-tp-rule={`${PREVIEW_TP_ATR}-atr`}
    >
      <div className="ss-preview__head">
        <div>
          <h3 className="ss-subsection-title">전략 구조 미리보기</h3>
          <p className="ss-helper">설명용 차트입니다. 현재 시세가 아닙니다.</p>
        </div>
        {direction === "both" ? (
          <div
            className="ss-preview__side-toggle"
            role="group"
            aria-label="미리보기 방향 예시"
          >
            <button
              type="button"
              className={
                "ss-preview__side-btn" +
                (bothExample === "long" ? " ss-preview__side-btn--active" : "")
              }
              data-testid="ss-preview-side-long"
              aria-pressed={bothExample === "long"}
              onClick={() => setBothExample("long")}
            >
              롱 예시
            </button>
            <button
              type="button"
              className={
                "ss-preview__side-btn" +
                (bothExample === "short" ? " ss-preview__side-btn--active" : "")
              }
              data-testid="ss-preview-side-short"
              aria-pressed={bothExample === "short"}
              onClick={() => setBothExample("short")}
            >
              숏 예시
            </button>
          </div>
        ) : null}
      </div>
      <div className="ss-preview__frame">
        <svg
          viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
          className="ss-preview__chart"
          role="img"
          aria-label="전략 구조 미리보기"
          preserveAspectRatio="xMidYMid meet"
        >
          {Array.from({ length: 6 }, (_, index) => {
            const gy = PLOT.y0 + ((PLOT.y1 - PLOT.y0) / 5) * index;
            return (
              <line
                key={`g-${index}`}
                x1={PLOT.x0}
                x2={PLOT.x1}
                y1={gy}
                y2={gy}
                stroke="currentColor"
                className="ss-preview__grid"
              />
            );
          })}
          {showSd ? (
            <g data-preview-layer="supply_demand">
              <rect
                x={PLOT.x0 + 10}
                y={y(52)}
                width={candleStep * 3.4}
                height={Math.abs(y(42) - y(52))}
                fill="#22c55e2e"
                stroke="#22c55e99"
              />
              <text
                x={PLOT.x0 + 18}
                y={y(42) - 8}
                className="ss-preview__layer-label"
                data-preview-layer-label="supply_demand"
                fill="#86efac"
              >
                수요
              </text>
              <rect
                x={PLOT.x1 - candleStep * 3.8}
                y={y(80)}
                width={candleStep * 3.2}
                height={Math.abs(y(72) - y(80))}
                fill="#fb71852e"
                stroke="#fb718599"
              />
              <text
                x={PLOT.x1 - candleStep * 3.6}
                y={y(80) - 8}
                className="ss-preview__layer-label"
                fill="#fda4af"
              >
                공급
              </text>
            </g>
          ) : null}
          {showOb ? (
            <g data-preview-layer="order_block">
              <rect
                x={obX}
                y={obTop - 4}
                width={bodyW * 1.8}
                height={obHeight}
                fill="#60a5fa33"
                stroke="#60a5fa"
                strokeWidth="1.6"
              />
              <text
                x={obX + 4}
                y={obTop - 14}
                className="ss-preview__layer-label"
                data-preview-layer-label="order_block"
                fill="#93c5fd"
              >
                오더블럭 (OB)
              </text>
            </g>
          ) : null}
          {showFvg ? (
            <g data-preview-layer="fvg">
              <rect
                x={fvgLeft}
                y={y(66)}
                width={fvgWidth}
                height={Math.abs(y(61) - y(66))}
                fill="#f59e0b3d"
                stroke="#f59e0b"
                strokeWidth="1.4"
                strokeDasharray="4 3"
              />
              <text
                x={fvgLeft + 6}
                y={y(63.5) + 4}
                className="ss-preview__layer-label"
                data-preview-layer-label="fvg"
                fill="#fbbf24"
              >
                FVG
              </text>
            </g>
          ) : null}
          {showSr ? (
            <g data-preview-layer="support_resistance">
              <line
                x1={PLOT.x0}
                x2={PLOT.x1}
                y1={y(50)}
                y2={y(50)}
                stroke="#94a3b8"
                strokeWidth="1.8"
                strokeDasharray="7 5"
              />
              <text
                x={PLOT.x1 - 8}
                y={y(50) - 10}
                className="ss-preview__layer-label"
                data-preview-layer-label="support_resistance"
                fill="#cbd5e1"
                textAnchor="end"
              >
                지지
              </text>
              <line
                x1={PLOT.x0}
                x2={PLOT.x1}
                y1={y(74)}
                y2={y(74)}
                stroke="#e2e8f0"
                strokeWidth="1.8"
                strokeDasharray="7 5"
              />
              <text
                x={PLOT.x1 - 8}
                y={y(74) - 10}
                className="ss-preview__layer-label"
                fill="#e2e8f0"
                textAnchor="end"
              >
                저항
              </text>
            </g>
          ) : null}
          {showTrend ? (
            <g data-preview-layer="trendline">
              <line
                x1={PLOT.x0 + 12}
                y1={y(44)}
                x2={PLOT.x1 - 8}
                y2={y(72)}
                stroke="#a78bfa"
                strokeWidth="2.4"
              />
              <text
                x={PLOT.x1 - 12}
                y={y(72) - 12}
                className="ss-preview__layer-label"
                data-preview-layer-label="trendline"
                fill="#c4b5fd"
                textAnchor="end"
              >
                추세선
              </text>
            </g>
          ) : null}
          {showEma ? (
            <g data-preview-layer="ema_core">
              <path
                d={`M${PLOT.x0 + 8} ${y(46)} C ${PLOT.x0 + 180} ${y(52)}, ${PLOT.x0 + 430} ${y(61)}, ${PLOT.x1 - 8} ${y(71)}`}
                fill="none"
                stroke="#22d3ee"
                strokeWidth="2.6"
              />
              <text
                x={PLOT.x1 - 12}
                y={y(71) + 20}
                className="ss-preview__layer-label"
                data-preview-layer-label="ema_core"
                fill="#67e8f9"
                textAnchor="end"
              >
                EMA
              </text>
            </g>
          ) : null}
          {ILLUSTRATIVE_CANDLES.map((candle, index) => {
            const x = candleX(index, candleStep);
            return (
              <g key={index}>
                <line
                  x1={x}
                  x2={x}
                  y1={y(candle.h)}
                  y2={y(candle.l)}
                  stroke={candle.bull ? "#34d399" : "#fb7185"}
                  strokeWidth="2"
                />
                <rect
                  x={x - bodyW / 2}
                  y={y(Math.max(candle.o, candle.c))}
                  width={bodyW}
                  height={Math.max(4, Math.abs(y(candle.o) - y(candle.c)))}
                  fill={candle.bull ? "#34d399" : "#fb7185"}
                  rx="1"
                />
              </g>
            );
          })}
          <line
            x1={PLOT.x0}
            x2={PLOT.x1}
            y1={entryY}
            y2={entryY}
            stroke="#38bdf8"
            strokeWidth="2"
            data-preview-line="entry"
          />
          <line
            x1={PLOT.x0}
            x2={PLOT.x1}
            y1={stopY}
            y2={stopY}
            stroke="#fb7185"
            strokeWidth="2"
            data-preview-line="stop"
          />
          <line
            x1={PLOT.x0}
            x2={PLOT.x1}
            y1={tpY}
            y2={tpY}
            stroke="#34d399"
            strokeWidth="2"
            data-preview-line="take-profit"
          />
          <text x={PLOT.x1 + 12} y={entryY + 4} className="ss-preview__label">
            진입
          </text>
          <text x={PLOT.x1 + 12} y={stopY + 4} className="ss-preview__label ss-preview__label--stop">
            손절
          </text>
          <text x={PLOT.x1 + 12} y={tpY + 4} className="ss-preview__label ss-preview__label--tp">
            익절
          </text>
        </svg>
      </div>
      <ul className="ss-preview__legend">
        <li data-testid="ss-preview-entry-rule">진입 · {PREVIEW_ENTRY_RULE}</li>
        <li data-testid="ss-preview-stop-rule">손절 · {PREVIEW_STOP_RULE}</li>
        <li data-testid="ss-preview-tp-rule">익절 · {PREVIEW_TP_RULE}</li>
        {legendIds.map((id) => {
          const mark = PREVIEW_LAYER_MARK[id as keyof typeof PREVIEW_LAYER_MARK];
          return (
            <li key={id} data-preview-legend={id}>
              {mark ? (
                <i
                  className="ss-preview__swatch"
                  style={{ background: mark.color }}
                  aria-hidden="true"
                />
              ) : null}
              {PATTERN_LAYER_HELP[id]!.title}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
