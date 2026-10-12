"use client";

import { parseDisplayedSearchDate, sharedPeriodTimeline } from "../compareVisual";
import type { SearchJobCompareRow } from "../searchJobComparison";

const PLOT_LEFT = 126;
const PLOT_WIDTH = 814;

function rowById(rows: SearchJobCompareRow[], id: string) {
  return rows.find((row) => row.id === id);
}

function shortTick(value: string): string {
  const time = parseDisplayedSearchDate(value);
  if (time == null) return value;
  const date = new Date(time);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function overlapDurationLabel(input: {
  leftStart: string;
  leftEnd: string;
  rightStart: string;
  rightEnd: string;
}): string | null {
  const points = [input.leftStart, input.leftEnd, input.rightStart, input.rightEnd].map(
    parseDisplayedSearchDate,
  );
  if (points.some((value) => value == null)) return null;
  const [leftStart, leftEnd, rightStart, rightEnd] = points as number[];
  const duration = Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart);
  if (duration <= 0) return null;
  const days = Math.floor(duration / 86_400_000);
  if (days >= 1) return `${days}일 공통`;
  const hours = Math.floor(duration / 3_600_000);
  if (hours >= 1) return `${hours}시간 공통`;
  return `${Math.max(1, Math.floor(duration / 60_000))}분 공통`;
}

function pctX(value: number) {
  return PLOT_LEFT + PLOT_WIDTH * (value / 100);
}

export function CompareTimelineVisual(props: {
  settings: SearchJobCompareRow[];
  elapsed: SearchJobCompareRow | undefined;
}) {
  const start = rowById(props.settings, "setting-분석 구간 시작");
  const end = rowById(props.settings, "setting-분석 구간 종료");
  const layout =
    start && end
      ? sharedPeriodTimeline({
          leftStart: start.left,
          leftEnd: end.left,
          rightStart: start.right,
          rightEnd: end.right,
        })
      : null;
  const overlapLabel =
    start && end
      ? overlapDurationLabel({
          leftStart: start.left,
          leftEnd: end.left,
          rightStart: start.right,
          rightEnd: end.right,
        })
      : null;
  const rawPoints = start && end
    ? [start.left, end.left, start.right, end.right].map(parseDisplayedSearchDate)
    : [];
  const times = rawPoints.every((value) => value != null) ? rawPoints as number[] : [];
  const spanStart = times.length ? Math.min(...times) : 0;
  const spanEnd = times.length ? Math.max(...times) : 0;
  const ticks = spanEnd > spanStart
    ? [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const date = new Date(spanStart + (spanEnd - spanStart) * ratio);
        return { x: PLOT_LEFT + PLOT_WIDTH * ratio, label: `${date.getMonth() + 1}/${date.getDate()}` };
      })
    : [];

  if (!start || !end || !layout) {
    return (
      <div className="ss-compare-timeline-empty">
        <svg viewBox="0 0 64 40" aria-hidden="true"><path d="M6 30h52M12 30V18m13 12V10m13 20V21m13 9V14" /></svg>
        <strong>비교 가능한 분석 기간 없음</strong>
      </div>
    );
  }

  const leftX = pctX(layout.left.startPct);
  const rightX = pctX(layout.right.startPct);
  const leftWidth = PLOT_WIDTH * (layout.left.widthPct / 100);
  const rightWidth = PLOT_WIDTH * (layout.right.widthPct / 100);
  const overlapX = layout.overlap ? pctX(layout.overlap.startPct) : 0;
  const overlapWidth = layout.overlap ? PLOT_WIDTH * (layout.overlap.widthPct / 100) : 0;
  const overlapCenter = overlapX + overlapWidth / 2;
  const overlapLabelX = Math.min(
    PLOT_LEFT + PLOT_WIDTH - 108,
    Math.max(PLOT_LEFT, overlapCenter - 54),
  );

  return (
    <figure className="ss-compare-timeline-figure" data-testid="ss-compare-timeline">
      <svg
        className="ss-compare-timeline-svg"
        viewBox="0 0 1000 310"
        role="img"
        aria-label={`분석 기간. 기준 ${start.left}부터 ${end.left}, 비교 ${start.right}부터 ${end.right}${overlapLabel ? `, ${overlapLabel}` : ""}`}
      >
        <defs>
          <linearGradient id="ss-timeline-left" x1="0" x2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.45" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="ss-timeline-right" x1="0" x2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.95" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.4" />
          </linearGradient>
          <pattern id="ss-overlap-pattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" className="ss-compare-timeline-svg__overlap-bg" />
            <line x1="0" y1="0" x2="0" y2="8" className="ss-compare-timeline-svg__overlap-line" />
          </pattern>
        </defs>
        {ticks.map((tick) => (
          <g key={tick.x} className="ss-compare-timeline-svg__tick">
            <line x1={tick.x} x2={tick.x} y1="42" y2="260" />
            <text x={tick.x} y="26">{tick.label}</text>
          </g>
        ))}
        <text className="ss-compare-svg-side is-left" x="20" y="112">기준</text>
        <text className="ss-compare-svg-side is-right" x="20" y="224">비교</text>
        <line className="ss-compare-timeline-svg__axis" x1={PLOT_LEFT} x2={PLOT_LEFT + PLOT_WIDTH} y1="104" y2="104" />
        <line className="ss-compare-timeline-svg__axis" x1={PLOT_LEFT} x2={PLOT_LEFT + PLOT_WIDTH} y1="216" y2="216" />
        <rect className="ss-compare-timeline-svg__period is-left" x={leftX} y="87" width={leftWidth} height="34" rx="17">
          <title>{`${start.left} – ${end.left}`}</title>
        </rect>
        <rect className="ss-compare-timeline-svg__period is-right" x={rightX} y="199" width={rightWidth} height="34" rx="17">
          <title>{`${start.right} – ${end.right}`}</title>
        </rect>
        <circle className="ss-compare-timeline-svg__endpoint is-left" cx={leftX} cy="104" r="5" />
        <circle className="ss-compare-timeline-svg__endpoint is-left" cx={leftX + leftWidth} cy="104" r="5" />
        <circle className="ss-compare-timeline-svg__endpoint is-right" cx={rightX} cy="216" r="5" />
        <circle className="ss-compare-timeline-svg__endpoint is-right" cx={rightX + rightWidth} cy="216" r="5" />
        {layout.overlap ? (
          <g className="ss-compare-timeline__overlap-band">
            <rect x={overlapX} y="126" width={overlapWidth} height="68" rx="8" fill="url(#ss-overlap-pattern)" />
            <line x1={overlapX} x2={overlapX} y1="121" y2="199" />
            <line x1={overlapX + overlapWidth} x2={overlapX + overlapWidth} y1="121" y2="199" />
            <rect className="ss-compare-timeline-svg__overlap-label-bg" x={overlapLabelX} y="145" width="108" height="30" rx="15" />
            <text className="ss-compare-timeline-svg__overlap-label" x={overlapLabelX + 54} y="165">{overlapLabel ?? "공통 기간"}</text>
          </g>
        ) : null}
        <text className="ss-compare-timeline-svg__date is-left" x={leftX + 8} y="145">{shortTick(start.left)}</text>
        <text className="ss-compare-timeline-svg__date is-left is-end" x={leftX + leftWidth - 8} y="145">{shortTick(end.left)}</text>
        <text className="ss-compare-timeline-svg__date is-right" x={rightX + 8} y="257">{shortTick(start.right)}</text>
        <text className="ss-compare-timeline-svg__date is-right is-end" x={rightX + rightWidth - 8} y="257">{shortTick(end.right)}</text>
      </svg>
      {props.elapsed ? (
        <figcaption className="ss-compare-duration" data-testid="ss-compare-duration">
          <span>처리 시간</span>
          <strong>{props.elapsed.left}</strong>
          <i aria-hidden="true" />
          <strong>{props.elapsed.right}</strong>
        </figcaption>
      ) : null}
      <span className="ss-compare-timeline__overlap-swatch" aria-hidden="true" />
      {overlapLabel ? <span className="ss-sr" data-testid="ss-compare-overlap">{overlapLabel}</span> : null}
    </figure>
  );
}
