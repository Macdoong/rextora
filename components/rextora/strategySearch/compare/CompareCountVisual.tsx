"use client";

import { isMissingCompareDisplay, pairRelativeBarWidths } from "../compareVisual";

function MissingValue() {
  return (
    <g className="ss-compare-svg-missing">
      <path d="M0 0h32M4-8v8M12-15V0M20-6V0M28-11V0" />
      <text x="42" y="1">비교 가능한 결과 없음</text>
    </g>
  );
}

function MetricInfo(props: { copy: string }) {
  return (
    <span
      className="ss-compare-metric-hint"
      role="img"
      aria-label={props.copy}
      title={props.copy}
      data-tooltip={props.copy}
      tabIndex={0}
    >
      i
    </span>
  );
}

export function CompareCountVisual(props: { left: string; right: string }) {
  const widths = pairRelativeBarWidths(props.left, props.right);
  const leftWidth = 350 * (widths.left.widthPct / 100);
  const rightWidth = 350 * (widths.right.widthPct / 100);

  return (
    <section className="ss-compare-core-stage ss-compare-count-stage" data-testid="ss-compare-count">
      <div className="ss-compare-core-stage__label">
        <span>01</span>
        <h3>
          평가한 전략 수
          <MetricInfo copy="이번 탐색에서 평가한 후보 수입니다." />
        </h3>
      </div>
      <svg
        className="ss-compare-count-svg"
        viewBox="0 0 1000 190"
        role="img"
        aria-label={`평가한 전략 수. 기준 ${props.left}, 비교 ${props.right}`}
      >
        <defs>
          <linearGradient id="ss-count-left" x1="0" x2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="ss-count-right" x1="0" x2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.9" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        <line className="ss-compare-count-svg__guide" x1="500" y1="24" x2="500" y2="166" />
        <circle className="ss-compare-count-svg__hub" cx="500" cy="95" r="7" />
        <text className="ss-compare-svg-side is-left" x="455" y="43">기준</text>
        <text className="ss-compare-svg-side is-right" x="545" y="43">비교</text>
        {widths.left.missing ? (
          <g transform="translate(95 104)"><MissingValue /></g>
        ) : (
          <>
            <rect className="ss-compare-count-svg__track" x="100" y="80" width="350" height="30" rx="15" />
            <rect
              className="ss-compare-count-svg__bar is-left"
              x={450 - leftWidth}
              y="80"
              width={leftWidth}
              height="30"
              rx="15"
            />
            <circle className="ss-compare-count-svg__endpoint is-left" cx={450 - leftWidth} cy="95" r="5" />
            <text className="ss-compare-svg-value is-left" x="450" y="151">{props.left}</text>
          </>
        )}
        {widths.right.missing ? (
          <g transform="translate(560 104)"><MissingValue /></g>
        ) : (
          <>
            <rect className="ss-compare-count-svg__track" x="550" y="80" width="350" height="30" rx="15" />
            <rect
              className="ss-compare-count-svg__bar is-right"
              x="550"
              y="80"
              width={rightWidth}
              height="30"
              rx="15"
            />
            <circle className="ss-compare-count-svg__endpoint is-right" cx={550 + rightWidth} cy="95" r="5" />
            <text className="ss-compare-svg-value is-right" x="550" y="151">{props.right}</text>
          </>
        )}
      </svg>
    </section>
  );
}
