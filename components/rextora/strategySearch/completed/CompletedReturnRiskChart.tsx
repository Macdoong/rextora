"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatMddAbsPct, formatPct } from "../formatters";
import {
  buildQualificationThresholdLines,
  buildReturnMddScatterLayout,
  mddToPlotX,
  returnToPlotY,
} from "./completedChartScale";
import type { CompletedDashboardViewModel } from "./completedViewModel";
import {
  formatCompositeScore,
  formatSignedReturnPct,
} from "./completedDisplayFormat";
import { useCompletedMotion } from "./useCompletedMotion";
import { usePresentationEnter } from "./usePresentationEnter";

const NARROW_MAX_WIDTH = 767;

function useNarrowLayout(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      setNarrow(false);
      return;
    }
    const mq = window.matchMedia(`(max-width: ${NARROW_MAX_WIDTH}px)`);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

function tooltipPlacement(plotX: number, plotY: number): {
  className: string;
  style: React.CSSProperties;
} {
  const nearRight = plotX > 72;
  const nearTop = plotY < 22;
  const className =
    "ss-completed-risk-chart__float-tooltip ss-completed-risk-chart__float-tooltip--readable" +
    (nearRight ? " ss-completed-risk-chart__float-tooltip--left" : "") +
    (nearTop ? " ss-completed-risk-chart__float-tooltip--below" : "");
  const style: React.CSSProperties = nearRight
    ? { left: `${plotX}%`, top: `${plotY}%`, transform: "translate(-108%, -100%)" }
    : nearTop
      ? { left: `${plotX}%`, top: `${plotY}%`, transform: "translate(-50%, 12px)" }
      : { left: `${plotX}%`, top: `${plotY}%`, transform: "translate(-50%, calc(-100% - 10px))" };
  return { className, style };
}

function pointLabelLayout(
  plotX: number,
  plotY: number,
): {
  labelStyle: React.CSSProperties;
  connectorStyle: React.CSSProperties;
  markerStyle: React.CSSProperties;
} {
  const placeAbove = plotY > 20;
  const gapPx = placeAbove ? -54 : 54;
  const dx = plotX > 75 ? -16 : plotX < 25 ? 16 : 0;
  const labelStyle: React.CSSProperties = {
    transform: `translate(calc(-50% + ${dx}px), calc(${gapPx}px - 50%))`,
  };
  const connectorLen = Math.abs(gapPx) - 18;
  const connectorStyle: React.CSSProperties = {
    height: `${Math.max(8, connectorLen)}px`,
    transform: placeAbove
      ? `translate(calc(-50% + ${dx}px), calc(-50% - 9px))`
      : `translate(calc(-50% + ${dx}px), calc(-50% + 9px))`,
  };
  const markerStyle: React.CSSProperties = {
    transform: "translate(-50%, -50%)",
  };
  return { labelStyle, connectorStyle, markerStyle };
}

export function CompletedReturnRiskChart(props: {
  model: CompletedDashboardViewModel;
  activeCandidateId?: string | null;
  onActiveCandidateIdChange?: (id: string | null) => void;
}) {
  const animate = useCompletedMotion() && props.model.dataStable;
  const chartEntered = usePresentationEnter(1300, props.model.dataStable);
  const narrow = useNarrowLayout();
  const passThresholds = props.model.analysisContext?.passThresholds;
  const layout = useMemo(
    () =>
      buildReturnMddScatterLayout(
        props.model.compareCandidates,
        passThresholds ?? undefined,
      ),
    [props.model.compareCandidates, passThresholds],
  );
  const thresholdLines = useMemo(() => {
    if (!layout || !passThresholds) return null;
    return buildQualificationThresholdLines(
      layout.axes,
      layout.bounds,
      passThresholds,
    );
  }, [layout, passThresholds]);
  const candidates = props.model.compareCandidates.filter(
    (c) => c.netReturn != null || c.maxDrawdown != null,
  );
  const [localActiveId, setLocalActiveId] = useState<string | null>(null);
  const activeId = props.activeCandidateId ?? localActiveId;
  const setActiveId = useCallback(
    (id: string | null) => {
      setLocalActiveId(id);
      props.onActiveCandidateIdChange?.(id);
    },
    [props.onActiveCandidateIdChange],
  );

  const activePoint = useMemo(
    () => layout?.points.find((p) => p.id === activeId) ?? null,
    [activeId, layout],
  );
  const activeRow = useMemo(
    () => candidates.find((c) => c.id === activeId) ?? null,
    [activeId, candidates],
  );
  const tooltipPos = useMemo(
    () =>
      activePoint
        ? tooltipPlacement(activePoint.plotX, activePoint.plotY)
        : null,
    [activePoint],
  );

  if (candidates.length === 0) return null;

  const strategySecondary = (row: (typeof candidates)[number]) => {
    const sub = row.displaySecondary?.trim();
    if (!sub) return null;
    return sub.length > 48 ? `${sub.slice(0, 45)}…` : sub;
  };

  return (
    <section
      className="ss-completed-risk-chart ss-completed-risk-chart--enter"
      data-testid="ss-completed-return-risk-section"
      aria-label="성과 위험 비교"
    >
      <h3 className="ss-completed-risk-chart__title ss-completed-type-section">
        성과 · 위험 지도
      </h3>
      <p className="ss-completed-risk-chart__hint">
        왼쪽일수록 최대 낙폭이 낮고, 위쪽일수록 수익률이 높습니다.
      </p>

      {!narrow && layout ? (
        <div
          className="ss-completed-risk-chart__desktop"
          data-testid="ss-completed-return-mdd-scatter"
        >
          <div
            className={
              "ss-completed-risk-chart__plot" +
              (chartEntered ? " ss-completed-risk-chart__plot--entered" : "") +
              (animate ? " ss-completed-risk-chart__plot--animate" : "")
            }
            role="img"
            aria-label="수익률 대 최대 낙폭 산점도"
          >
            <div className="ss-completed-risk-chart__axis-hints" aria-hidden="true">
              <span
                className="ss-completed-risk-chart__axis-hint-y"
                data-testid="ss-completed-risk-axis-y-hint"
              >
                ↑ 수익률
              </span>
              <span
                className="ss-completed-risk-chart__axis-hint-x"
                data-testid="ss-completed-risk-axis-x-hint"
              >
                최대 낙폭 →
              </span>
            </div>
            {thresholdLines?.showRegion ? (
              <div
                className="ss-completed-risk-chart__qual-region"
                data-testid="ss-completed-risk-qual-region"
                aria-hidden="true"
                style={{
                  left: `${layout.bounds.plotLeft}%`,
                  top: `${layout.bounds.plotTop}%`,
                  width: `${thresholdLines.maxMddX! - layout.bounds.plotLeft}%`,
                  height: `${thresholdLines.minReturnY! - layout.bounds.plotTop}%`,
                }}
              >
                <span className="ss-completed-risk-chart__qual-region-label">
                  검증 기준 충족 영역
                </span>
              </div>
            ) : null}
            {thresholdLines?.minReturnY != null ? (
              <div
                className="ss-completed-risk-chart__threshold ss-completed-risk-chart__threshold--h"
                data-testid="ss-completed-risk-min-return-line"
                style={{ top: `${thresholdLines.minReturnY}%` }}
              >
                <span>
                  최소 수익률 기준{" "}
                  {formatPct(thresholdLines.minTotalReturn!) ?? ""}
                </span>
              </div>
            ) : null}
            {thresholdLines?.maxMddX != null ? (
              <div
                className="ss-completed-risk-chart__threshold ss-completed-risk-chart__threshold--v"
                data-testid="ss-completed-risk-max-mdd-line"
                style={{ left: `${thresholdLines.maxMddX}%` }}
              >
                <span>
                  최대 낙폭 한도{" "}
                  {formatMddAbsPct(thresholdLines.maxMddMagnitude!) ?? ""}
                </span>
              </div>
            ) : null}
            <div className="ss-completed-risk-chart__grid-layer" aria-hidden="true">
              {[25, 50, 75].map((y) => (
                <div
                  key={`gy-${y}`}
                  className="ss-completed-risk-chart__grid-h"
                  style={{ top: `${y}%` }}
                />
              ))}
              {[25, 50, 75].map((x) => (
                <div
                  key={`gx-${x}`}
                  className="ss-completed-risk-chart__grid-v"
                  style={{ left: `${x}%` }}
                />
              ))}
            </div>
            {layout.axes.yTicks.map((tick, i) => (
              <span
                key={`yt-${i}`}
                className="ss-completed-risk-chart__tick-y"
                style={{
                  top: `${returnToPlotY(tick, layout.axes.yMin, layout.axes.yMax, layout.bounds)}%`,
                }}
              >
                {formatPct(tick) ?? ""}
              </span>
            ))}
            {layout.axes.xTicks.map((tick, i) => (
              <span
                key={`xt-${i}`}
                className="ss-completed-risk-chart__tick-x"
                style={{
                  left: `${mddToPlotX(tick, layout.axes.xMin, layout.axes.xMax, layout.bounds)}%`,
                }}
              >
                {formatMddAbsPct(tick) ?? ""}
              </span>
            ))}
            {layout.points.map((pt, index) => {
              const labelLayout = pointLabelLayout(pt.plotX, pt.plotY);
              return (
                <div key={pt.id}>
                  <div
                    className={
                      "ss-completed-risk-chart__label-card" +
                      (pt.isRecommended
                        ? " ss-completed-risk-chart__label-card--rec"
                        : "") +
                      (activeId === pt.id
                        ? " ss-completed-risk-chart__label-card--active"
                        : "")
                    }
                    style={{
                      left: `${pt.plotX}%`,
                      top: `${pt.plotY}%`,
                      ...labelLayout.labelStyle,
                    }}
                    data-testid={
                      pt.isRecommended
                        ? "ss-completed-risk-point-label-recommended"
                        : "ss-completed-risk-point-label"
                    }
                  >
                    <strong>
                      {pt.isRecommended ? `★ ${pt.shortLabel}` : pt.shortLabel}
                    </strong>
                    <span>{formatSignedReturnPct(pt.netReturn)}</span>
                    <span>낙폭 {formatMddAbsPct(pt.mddAbs)}</span>
                  </div>
                  <div
                    className="ss-completed-risk-chart__label-connector"
                    aria-hidden="true"
                    style={{
                      left: `${pt.plotX}%`,
                      top: `${pt.plotY}%`,
                      ...labelLayout.connectorStyle,
                    }}
                  />
                  <button
                    type="button"
                    tabIndex={0}
                    aria-label={`${pt.shortLabel} 수익률 ${formatPct(pt.netReturn)} 최대 낙폭 ${formatMddAbsPct(pt.mddAbs)}`}
                    className={
                      "ss-completed-risk-chart__point-btn" +
                      (pt.isRecommended
                        ? " ss-completed-risk-chart__point-btn--rec"
                        : "") +
                      (activeId === pt.id
                        ? " ss-completed-risk-chart__point-btn--active"
                        : "") +
                      (animate ? " ss-completed-risk-chart__point-btn--animate" : "")
                    }
                    style={{
                      left: `${pt.plotX}%`,
                      top: `${pt.plotY}%`,
                      ...labelLayout.markerStyle,
                      animationDelay: `${160 + index * 45}ms`,
                    }}
                    data-testid={
                      pt.isRecommended
                        ? "ss-completed-risk-point-recommended"
                        : "ss-completed-risk-point"
                    }
                    data-net-return={pt.netReturn}
                    data-mdd-abs={pt.mddAbs}
                    onMouseEnter={() => setActiveId(pt.id)}
                    onMouseLeave={() => setActiveId(null)}
                    onFocus={() => setActiveId(pt.id)}
                    onBlur={() => setActiveId(null)}
                  />
                </div>
              );
            })}
            {activeRow && activePoint && tooltipPos ? (
              <div
                className={tooltipPos.className}
                style={tooltipPos.style}
                data-testid="ss-completed-risk-tooltip"
                role="tooltip"
              >
                <div className="ss-completed-risk-chart__tooltip-head">
                  <strong>{activeRow.displayPrimary}</strong>
                  {activeRow.isRecommended ? (
                    <span className="ss-completed-risk-chart__tooltip-rec">추천</span>
                  ) : null}
                </div>
                {strategySecondary(activeRow) ? (
                  <p className="ss-completed-risk-chart__tooltip-sub">
                    {strategySecondary(activeRow)}
                  </p>
                ) : null}
                <dl className="ss-completed-risk-chart__tooltip-metrics">
                  <div>
                    <dt>수익률</dt>
                    <dd>{formatSignedReturnPct(activeRow.netReturn)}</dd>
                  </div>
                  <div>
                    <dt>최대 낙폭</dt>
                    <dd>
                      {activeRow.maxDrawdown != null
                        ? formatMddAbsPct(activeRow.maxDrawdown)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt>거래수</dt>
                    <dd>{activeRow.tradeCount ?? "—"}회</dd>
                  </div>
                  <div>
                    <dt>종합 평가</dt>
                    <dd>{formatCompositeScore(activeRow.score)}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>
          <table
            className="ss-completed-risk-chart__compact-table"
            data-testid="ss-completed-risk-compact-table"
          >
            <thead>
              <tr>
                <th scope="col">후보</th>
                <th scope="col">수익률</th>
                <th scope="col">최대 낙폭</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((row) => (
                <tr
                  key={row.id}
                  className={
                    (row.isRecommended ? "ss-completed-risk-chart__table-rec " : "") +
                    (activeId === row.id ? "ss-completed-risk-chart__table-row--active" : "")
                  }
                  data-testid={`ss-completed-risk-table-row-${row.rank}`}
                  tabIndex={0}
                  onMouseEnter={() => setActiveId(row.id)}
                  onMouseLeave={() => setActiveId(null)}
                  onFocus={() => setActiveId(row.id)}
                  onBlur={() => setActiveId(null)}
                >
                  <td>{row.displayPrimary}</td>
                  <td>{formatSignedReturnPct(row.netReturn)}</td>
                  <td>
                    {row.maxDrawdown != null
                      ? formatMddAbsPct(row.maxDrawdown)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <ul
        className="ss-completed-risk-chart__mobile"
        data-testid="ss-completed-return-mdd-cards"
      >
        {candidates.map((row) => (
          <li
            key={row.id}
            className={
              "ss-completed-risk-chart__card" +
              (row.isRecommended ? " ss-completed-risk-chart__card--rec" : "")
            }
          >
            <strong>{row.displayPrimary}</strong>
            {row.isRecommended ? (
              <span className="ss-completed-risk-chart__badge">추천</span>
            ) : null}
            <span>수익률 {formatSignedReturnPct(row.netReturn)}</span>
            <span>
              최대 낙폭{" "}
              {row.maxDrawdown != null ? formatMddAbsPct(row.maxDrawdown) : "—"}
            </span>
            <span>거래수 {row.tradeCount ?? "—"}</span>
            <span>종합 평가 {formatCompositeScore(row.score)}</span>
            {passThresholds ? (
              <div
                className="ss-completed-risk-chart__mobile-qual"
                data-testid="ss-completed-risk-mobile-qual-badges"
              >
                {passThresholds.minTotalReturn != null && row.netReturn != null ? (
                  <span>
                    수익률 기준{" "}
                    {row.netReturn >= passThresholds.minTotalReturn ? "충족 ✓" : "미충족"}
                  </span>
                ) : null}
                {passThresholds.maxMdd != null && row.maxDrawdown != null ? (
                  <span>
                    낙폭 기준{" "}
                    {row.maxDrawdown >= passThresholds.maxMdd ? "충족 ✓" : "미충족"}
                  </span>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <p
        className="ss-completed-visuals__no-equity"
        data-testid="ss-completed-no-equity-chart"
      >
        누적 수익 곡선 데이터는 이 탐색 결과에 포함되어 있지 않습니다.
      </p>
    </section>
  );
}
