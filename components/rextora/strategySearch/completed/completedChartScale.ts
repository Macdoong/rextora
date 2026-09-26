import type { CompletedCandidateCompareRow } from "./completedViewModel";

export type ScatterLayoutPoint = {
  id: string;
  label: string;
  netReturn: number;
  mddAbs: number;
  xPct: number;
  yPct: number;
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

function padRange(min: number, max: number, padRatio = 0.12): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.max(0.01, Math.abs(min) * 0.2);
    return [min - pad, max + pad];
  }
  const span = max - min;
  return [min - span * padRatio, max + span * padRatio];
}

export function buildReturnMddScatterLayout(
  rows: CompletedCandidateCompareRow[],
): { points: ScatterLayoutPoint[]; axes: ScatterAxisTicks } | null {
  const valid = rows.filter(
    (r) => r.netReturn != null && r.maxDrawdown != null,
  );
  if (valid.length === 0) return null;

  const mddAbs = valid.map((r) => Math.abs(r.maxDrawdown!));
  const returns = valid.map((r) => r.netReturn!);
  const [xMin, xMax] = padRange(Math.min(...mddAbs), Math.max(...mddAbs));
  const [yMin, yMax] = padRange(Math.min(...returns), Math.max(...returns));

  const xTicks = [xMin, (xMin + xMax) / 2, xMax];
  const yTicks = [yMin, (yMin + yMax) / 2, yMax];

  const points: ScatterLayoutPoint[] = valid.map((row) => {
    const mdd = Math.abs(row.maxDrawdown!);
    const ret = row.netReturn!;
    const xPct = xMax === xMin ? 50 : ((mdd - xMin) / (xMax - xMin)) * 100;
    const yPct = yMax === yMin ? 50 : ((ret - yMin) / (yMax - yMin)) * 100;
    return {
      id: row.id,
      label: row.label,
      netReturn: ret,
      mddAbs: mdd,
      xPct: Math.min(96, Math.max(4, xPct)),
      yPct: Math.min(96, Math.max(4, 100 - yPct)),
      isRecommended: row.isRecommended,
    };
  });

  return {
    points,
    axes: { xTicks, yTicks, xMin, xMax, yMin, yMax },
  };
}
