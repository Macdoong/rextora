/**
 * Return-vs-drawdown scatter domain helpers.
 *
 * Convention: X = absolute maximum drawdown magnitude (%), Y = net return (%).
 * Engine stores mdd as a signed fraction ≤ 0; we display |mdd|*100 so risk
 * increases to the right. Axis label must state this in Korean.
 */

export interface ScatterMetricPoint {
  symbol: string;
  /** Absolute drawdown magnitude in percent (always ≥ 0) */
  drawdownPct: number;
  /** Net return in percent (may be negative) */
  returnPct: number;
  tradeCount?: number | null;
  winRate?: number | null;
  profitFactor?: number | null;
  totalCost?: number | null;
}

export interface ScatterDomain {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** Korean X-axis caption explaining convention */
  xLabelKo: string;
  yLabelKo: string;
}

export function toScatterPoint(input: {
  symbol: string;
  mdd: number | null | undefined;
  totalReturn: number | null | undefined;
  tradeCount?: number | null;
  winRate?: number | null;
  profitFactor?: number | null;
  totalCost?: number | null;
}): ScatterMetricPoint | null {
  if (input.mdd == null || input.totalReturn == null) return null;
  if (!Number.isFinite(input.mdd) || !Number.isFinite(input.totalReturn)) {
    return null;
  }
  return {
    symbol: input.symbol,
    drawdownPct: Math.abs(input.mdd) * 100,
    returnPct: input.totalReturn * 100,
    tradeCount: input.tradeCount,
    winRate: input.winRate,
    profitFactor: input.profitFactor,
    totalCost: input.totalCost,
  };
}

/** Adaptive padded domain from finite points. Never forces positive-only Y. */
export function computeScatterDomain(
  points: ScatterMetricPoint[],
): ScatterDomain {
  const xs = points.map((p) => p.drawdownPct).filter(Number.isFinite);
  const ys = points.map((p) => p.returnPct).filter(Number.isFinite);

  let minX = 0;
  let maxX = 5;
  if (xs.length) {
    const dataMax = Math.max(...xs);
    const dataMin = Math.min(...xs);
    // Always include 0 on X (risk origin). Pad max; ensure visible spread.
    const span = Math.max(dataMax - Math.min(0, dataMin), 0.5);
    maxX = Math.max(dataMax, 0) + span * 0.15;
    if (maxX - minX < 1) maxX = minX + 1;
  }

  let minY = -1;
  let maxY = 1;
  if (ys.length) {
    const dataMin = Math.min(...ys);
    const dataMax = Math.max(...ys);
    const span = Math.max(dataMax - dataMin, 0.5);
    const pad = Math.max(span * 0.15, 0.25);
    minY = dataMin - pad;
    maxY = dataMax + pad;
    // Ensure zero is visible when data straddles or touches near zero
    if (minY > 0) minY = Math.min(0, minY);
    if (maxY < 0) maxY = Math.max(0, maxY);
    if (maxY - minY < 1) {
      const mid = (minY + maxY) / 2;
      minY = mid - 0.5;
      maxY = mid + 0.5;
    }
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    xLabelKo: "최대낙폭 크기 % (|MDD|)",
    yLabelKo: "순수익률 %",
  };
}

/** Map data → pixel. Returns null if domain is degenerate. */
export function projectScatterPoint(
  p: ScatterMetricPoint,
  domain: ScatterDomain,
  plot: { left: number; top: number; width: number; height: number },
): { cx: number; cy: number } | null {
  const dx = domain.maxX - domain.minX;
  const dy = domain.maxY - domain.minY;
  if (!(dx > 0) || !(dy > 0)) return null;
  const cx = plot.left + ((p.drawdownPct - domain.minX) / dx) * plot.width;
  const cy =
    plot.top + plot.height - ((p.returnPct - domain.minY) / dy) * plot.height;
  return { cx, cy };
}

/** True when every point projects inside the plot (with small edge tolerance). */
export function allPointsInsidePlot(
  points: ScatterMetricPoint[],
  domain: ScatterDomain,
  plot: { left: number; top: number; width: number; height: number },
  tolerance = 2,
): boolean {
  return points.every((p) => {
    const proj = projectScatterPoint(p, domain, plot);
    if (!proj) return false;
    return (
      proj.cx >= plot.left - tolerance &&
      proj.cx <= plot.left + plot.width + tolerance &&
      proj.cy >= plot.top - tolerance &&
      proj.cy <= plot.top + plot.height + tolerance
    );
  });
}
