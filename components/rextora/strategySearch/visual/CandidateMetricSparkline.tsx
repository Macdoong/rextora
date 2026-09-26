"use client";

import {
  buildCandidateMetricChart,
  type MetricChartKind,
  type SparklinePoint,
} from "./runningVisualModel";

export function CandidateMetricSparkline({
  titleKo,
  points,
  formatValue,
  kind,
  testId,
}: {
  titleKo: string;
  points: readonly SparklinePoint[];
  formatValue: (value: number) => string | null;
  kind: MetricChartKind;
  testId: string;
}) {
  const values = points.map((point) => point.value);
  const latest = points[points.length - 1];
  const latestText = latest ? formatValue(latest.value) : null;
  const chart = buildCandidateMetricChart(values, kind);
  const footerValues =
    kind === "mdd" ? values.map((value) => Math.abs(value)) : values;
  const footerMin = footerValues.length > 0 ? Math.min(...footerValues) : null;
  const footerMax = footerValues.length > 0 ? Math.max(...footerValues) : null;
  const minText =
    footerMin != null && Number.isFinite(footerMin) ? formatValue(footerMin) : null;
  const maxText =
    footerMax != null && Number.isFinite(footerMax) ? formatValue(footerMax) : null;
  const minFooterLabel = kind === "mdd" ? "최저" : "최저";
  const maxFooterLabel = kind === "mdd" ? "최대" : "최고";
  const latestTone =
    latest && kind === "return"
      ? latest.value > 0
        ? "pos"
        : latest.value < 0
          ? "neg"
          : "neutral"
      : "neutral";

  const summary =
    chart && latestText
      ? `${titleKo} 현재 ${latestText}. ${minFooterLabel} ${minText ?? "—"}. ${maxFooterLabel} ${maxText ?? "—"}. 최근 ${points.length}개 후보 결과.`
      : `${titleKo} 표시할 최근 후보 데이터가 없습니다.`;

  return (
    <section
      className="ss-spark"
      data-testid={testId}
      data-sparkline={chart?.mode ?? "empty"}
      data-point-count={points.length}
      data-metric-kind={kind}
      aria-label={titleKo}
    >
      <header className="ss-spark__head">
        <h3 className="ss-spark__title">{titleKo}</h3>
        <div className="ss-spark__head-meta">
          <strong
            className={`ss-spark__latest ss-spark__latest--${latestTone}`}
            data-testid={`${testId}-latest`}
          >
            {latestText ?? "—"}
          </strong>
          <span className="ss-spark__count" data-testid={`${testId}-count`}>
            최근 {points.length}개
          </span>
        </div>
      </header>

      <p className="ss-sr-only">{summary}</p>

      {chart && chart.mode !== "empty" ? (
        <div className="ss-spark__plot" data-chart-mode={chart.mode}>
          <svg
            className="ss-spark__svg"
            viewBox={`0 0 ${chart.width} ${chart.height}`}
            width="100%"
            height={chart.height}
            role="img"
            aria-hidden="true"
            focusable="false"
          >
            {[0.25, 0.5, 0.75].map((ratio) => (
              <line
                key={ratio}
                className="ss-spark__grid"
                x1={10}
                x2={chart.width - 10}
                y1={10 + (chart.height - 20) * ratio}
                y2={10 + (chart.height - 20) * ratio}
              />
            ))}
            {chart.linePoints ? (
              <polyline
                className="ss-spark__line"
                points={chart.linePoints}
                fill="none"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {chart.points.map((plotPoint) => {
              const source = points[plotPoint.index];
              if (!source) return null;
              const label = formatValue(source.value);
              return (
                <g key={source.sequenceLabel}>
                  <circle
                    className="ss-spark__dot"
                    cx={plotPoint.x}
                    cy={plotPoint.y}
                    r={chart.mode === "single" ? 5 : 3.5}
                    tabIndex={0}
                    role="graphics-symbol"
                    aria-label={`후보 ${source.sequenceLabel.replace("#", "")} ${label ?? "—"}`}
                  >
                    <title>{`후보 ${source.sequenceLabel.replace("#", "")}\n${titleKo} ${label ?? "—"}`}</title>
                  </circle>
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <p className="ss-spark__empty" data-testid={`${testId}-empty`}>
          표시할 최근 후보 데이터가 없습니다.
        </p>
      )}

      {chart && chart.mode !== "empty" ? (
        <footer className="ss-spark__foot">
          <span data-testid={`${testId}-min`}>
            {minFooterLabel} {minText ?? "—"}
          </span>
          <span data-testid={`${testId}-max`}>
            {maxFooterLabel} {maxText ?? "—"}
          </span>
        </footer>
      ) : null}
    </section>
  );
}
