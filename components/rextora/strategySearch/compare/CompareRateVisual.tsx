"use client";

import {
  isMissingCompareDisplay,
  rateDifferenceInterval,
  rateDifferencePercentagePoints,
  rateScalePosition,
} from "../compareVisual";

const SCALE_LEFT = 160;
const SCALE_WIDTH = 650;
const TOP_Y = 48;
const BOTTOM_Y = 100;
const CONNECTOR_Y = 75;

function markerX(rate: number) {
  return SCALE_LEFT + SCALE_WIDTH * (rate / 100);
}

function RateLane(props: {
  side: "기준" | "비교";
  value: string;
  y: number;
  tone: "left" | "right";
}) {
  const rate = isMissingCompareDisplay(props.value) ? null : rateScalePosition(props.value);
  if (rate == null) {
    return (
      <g className={`ss-compare-rate-svg__lane is-${props.tone}`}>
        <text className="ss-compare-svg-side" x="20" y={props.y + 5}>{props.side}</text>
        <path className="ss-compare-rate-svg__empty-icon" d={`M${SCALE_LEFT} ${props.y + 7}h30m-25 0v-8m8 8v-15m8 15v-5m8 5v-11`} />
        <text className="ss-compare-rate-svg__empty-copy" x={SCALE_LEFT + 44} y={props.y + 5}>비교 가능한 결과 없음</text>
      </g>
    );
  }

  const x = markerX(rate);
  const placeValueLeft = rate >= 82;
  return (
    <g className={`ss-compare-rate-svg__lane is-${props.tone}`}>
      <text className="ss-compare-svg-side" x="20" y={props.y + 5}>{props.side}</text>
      <line className="ss-compare-rate-svg__track" x1={SCALE_LEFT} x2={SCALE_LEFT + SCALE_WIDTH} y1={props.y} y2={props.y} />
      <line
        className="ss-compare-rate-svg__fill"
        x1={SCALE_LEFT}
        x2={x}
        y1={props.y}
        y2={props.y}
        data-rate-position={rate}
      />
      <circle className="ss-compare-rate-svg__marker-halo" cx={x} cy={props.y} r="11" />
      <path className="ss-compare-rate-svg__marker" d={`M${x} ${props.y - 7}L${x + 7} ${props.y}L${x} ${props.y + 7}L${x - 7} ${props.y}Z`} />
      <text
        className="ss-compare-rate-svg__value"
        x={x + (placeValueLeft ? -14 : 14)}
        y={props.y + 6}
        textAnchor={placeValueLeft ? "end" : "start"}
      >
        {props.value}
      </text>
    </g>
  );
}

export function CompareRateVisual(props: {
  testId: string;
  index: string;
  label: string;
  infoCopy?: string;
  left: string;
  right: string;
}) {
  const left = isMissingCompareDisplay(props.left) ? null : rateScalePosition(props.left);
  const right = isMissingCompareDisplay(props.right) ? null : rateScalePosition(props.right);
  const interval = rateDifferenceInterval(props.left, props.right);
  const difference = rateDifferencePercentagePoints(props.left, props.right);
  const leftX = left == null ? null : markerX(left);
  const rightX = right == null ? null : markerX(right);
  const intervalStartX = interval == null ? null : markerX(interval.startPct);
  const intervalEndX = interval == null ? null : markerX(interval.endPct);

  return (
    <section className="ss-compare-core-stage ss-compare-rate-stage" data-testid={props.testId}>
      <div className="ss-compare-core-stage__label">
        <span>{props.index}</span>
        <h3>
          {props.label}
          {props.infoCopy ? (
            <span
              className="ss-compare-metric-hint"
              role="img"
              aria-label={props.infoCopy}
              title={props.infoCopy}
              data-tooltip={props.infoCopy}
              tabIndex={0}
            >
              i
            </span>
          ) : null}
        </h3>
        <em>0–100%</em>
      </div>
      <svg
        className="ss-compare-rate-svg"
        viewBox="0 0 1000 176"
        role="img"
        aria-label={`${props.label}. 기준 ${props.left}, 비교 ${props.right}. 0에서 100퍼센트 고정 척도`}
      >
        <line className="ss-compare-rate-svg__axis" x1={SCALE_LEFT} x2={SCALE_LEFT + SCALE_WIDTH} y1="145" y2="145" />
        {[0, 50, 100].map((tick) => {
          const x = markerX(tick);
          return (
            <g key={tick} className="ss-compare-rate-svg__tick">
              <line x1={x} x2={x} y1="140" y2="150" />
              <text x={x} y="168">{tick}%</text>
            </g>
          );
        })}
        <RateLane side="기준" value={props.left} y={TOP_Y} tone="left" />
        <RateLane side="비교" value={props.right} y={BOTTOM_Y} tone="right" />
        {interval && leftX != null && rightX != null && intervalStartX != null && intervalEndX != null ? (
          <g className="ss-compare-rate-svg__interval" aria-hidden="true">
            <line x1={leftX} x2={leftX} y1={TOP_Y + 9} y2={CONNECTOR_Y} />
            <line x1={rightX} x2={rightX} y1={CONNECTOR_Y} y2={BOTTOM_Y - 9} />
            <line x1={intervalStartX} x2={intervalEndX} y1={CONNECTOR_Y} y2={CONNECTOR_Y} />
          </g>
        ) : null}
      </svg>
      {difference != null ? (
        <p className="ss-compare-rate-difference" data-testid={`${props.testId}-difference`}>
          차이 {difference.toFixed(1)}%p
        </p>
      ) : null}
    </section>
  );
}
