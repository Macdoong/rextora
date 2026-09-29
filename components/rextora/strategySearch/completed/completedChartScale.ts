import type { CompletedCandidateCompareRow } from "./completedViewModel";

export type ScatterLayoutPoint = {
  id: string;
  label: string;
  shortLabel: string;
  rank: number;
  netReturn: number;
  mddAbs: number;
  /** Position within plot area (0–100). */
  plotX: number;
  plotY: number;
  isRecommended: boolean;
};

export type ScatterAxisTicks = {
  xTicks: number[];
  yTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
};

export type ScatterPlotBounds = {
  plotLeft: number;
  plotTop: number;
  plotW: number;
  plotH: number;
};

function padRange(min: number, max: number, padRatio = 0.12): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.max(0.01, Math.abs(min) * 0.2);
    return [min - pad, max + pad];
  }
  const span = max - min;
  return [min - span * padRatio, max + span * padRatio];
}

/** Higher return → smaller plotY (visually higher). */
export function returnToPlotY(
  ret: number,
  yMin: number,
  yMax: number,
  bounds: ScatterPlotBounds,
): number {
  const yNorm = yMax === yMin ? 0.5 : (ret - yMin) / (yMax - yMin);
  const y = bounds.plotTop + (1 - yNorm) * bounds.plotH;
  return Math.min(bounds.plotTop + bounds.plotH, Math.max(bounds.plotTop, y));
}

/** Lower drawdown magnitude → smaller plotX (visually left). */
export function mddToPlotX(
  mddAbs: number,
  xMin: number,
  xMax: number,
  bounds: ScatterPlotBounds,
): number {
  const xNorm = xMax === xMin ? 0.5 : (mddAbs - xMin) / (xMax - xMin);
  const x = bounds.plotLeft + xNorm * bounds.plotW;
  return Math.min(bounds.plotLeft + bounds.plotW, Math.max(bounds.plotLeft, x));
}

export function buildReturnMddScatterLayout(
  rows: CompletedCandidateCompareRow[],
  thresholds?: {
    minTotalReturn?: number | null;
    maxMdd?: number | null;
  },
): {
  points: ScatterLayoutPoint[];
  axes: ScatterAxisTicks;
  bounds: ScatterPlotBounds;
} | null {
  const valid = rows.filter(
    (r) => r.netReturn != null && r.maxDrawdown != null,
  );
  if (valid.length === 0) return null;

  const mddAbs = valid.map((r) => Math.abs(r.maxDrawdown!));
  if (thresholds?.maxMdd != null) {
    mddAbs.push(Math.abs(thresholds.maxMdd));
  }
  const returns = valid.map((r) => r.netReturn!);
  if (thresholds?.minTotalReturn != null) {
    returns.push(thresholds.minTotalReturn);
  }
  const [xMin, xMax] = padRange(Math.min(...mddAbs), Math.max(...mddAbs));
  const [yMin, yMax] = padRange(Math.min(...returns), Math.max(...returns));

  const xTicks = [xMin, (xMin + xMax) / 2, xMax];
  const yTicks = [yMax, (yMin + yMax) / 2, yMin];

  const bounds: ScatterPlotBounds = {
    plotLeft: 10,
    plotTop: 8,
    plotW: 86,
    plotH: 72,
  };

  const points: ScatterLayoutPoint[] = valid.map((row) => {
    const mdd = Math.abs(row.maxDrawdown!);
    const ret = row.netReturn!;
    const plotX = mddToPlotX(mdd, xMin, xMax, bounds);
    const plotY = returnToPlotY(ret, yMin, yMax, bounds);
    const shortLabel = row.isRecommended
      ? `후보 ${row.rank} · 추천`
      : `후보 ${row.rank}`;
    return {
      id: row.id,
      label: row.displayPrimary ?? row.label,
      shortLabel,
      rank: row.rank,
      netReturn: ret,
      mddAbs: mdd,
      plotX,
      plotY,
      isRecommended: row.isRecommended,
    };
  });

  return {
    points,
    axes: { xTicks, yTicks, xMin, xMax, yMin, yMax },
    bounds,
  };
}

export type QualificationThresholdLines = {
  minReturnY: number | null;
  maxMddX: number | null;
  minTotalReturn: number | null;
  maxMddMagnitude: number | null;
  showRegion: boolean;
};

export function buildQualificationThresholdLines(
  axes: ScatterAxisTicks,
  bounds: ScatterPlotBounds,
  thresholds: {
    minTotalReturn?: number | null;
    maxMdd?: number | null;
  },
): QualificationThresholdLines {
  const minTotalReturn = thresholds.minTotalReturn ?? null;
  const maxMddMagnitude =
    thresholds.maxMdd != null ? Math.abs(thresholds.maxMdd) : null;
  const minReturnY =
    minTotalReturn != null
      ? returnToPlotY(minTotalReturn, axes.yMin, axes.yMax, bounds)
      : null;
  const maxMddX =
    maxMddMagnitude != null
      ? mddToPlotX(maxMddMagnitude, axes.xMin, axes.xMax, bounds)
      : null;
  const plotBottom = bounds.plotTop + bounds.plotH;
  const plotRight = bounds.plotLeft + bounds.plotW;
  const linesInPlot =
    minReturnY != null &&
    maxMddX != null &&
    minReturnY >= bounds.plotTop &&
    minReturnY <= plotBottom &&
    maxMddX >= bounds.plotLeft &&
    maxMddX <= plotRight;

  return {
    minReturnY,
    maxMddX,
    minTotalReturn,
    maxMddMagnitude,
    showRegion: linesInPlot,
  };
}
