import type { CompletedDashboardViewModel } from "./completedViewModel";

export type QualificationGaugeModel =
  | {
      kind: "higher-is-better";
      id: string;
      label: string;
      threshold: number;
      actual: number;
      thresholdPct: string;
      actualPct: string;
      deltaLabel: string;
      met: boolean;
      thresholdMarkerRatio: number;
      resultMarkerRatio: number;
    }
  | {
      kind: "lower-is-better";
      id: string;
      label: string;
      limit: number;
      actual: number;
      limitPct: string;
      actualPct: string;
      deltaLabel: string;
      met: boolean;
      limitMarkerRatio: number;
      resultMarkerRatio: number;
    }
  | {
      kind: "count-min";
      id: string;
      label: string;
      minimum: number;
      actual: number;
      deltaLabel: string;
      met: boolean;
      thresholdMarkerRatio: number;
      resultMarkerRatio: number;
    }
  | {
      kind: "stability";
      id: "jitter";
      label: string;
      met: boolean;
    };

export function buildQualificationGaugeModels(
  model: CompletedDashboardViewModel,
): QualificationGaugeModel[] {
  const ctx = model.analysisContext;
  const t = ctx?.passThresholds;
  const r = model.recommendation;
  if (!t || !r) return [];

  const gauges: QualificationGaugeModel[] = [];

  if (t.minTotalReturn != null && r.netReturn != null) {
    const threshold = t.minTotalReturn;
    const actual = r.netReturn;
    const span = Math.max(threshold * 0.5, actual - threshold, 0.01);
    const base = Math.min(threshold - span * 0.15, actual - span);
    const max = base + span;
    const thresholdMarkerRatio = Math.min(1, Math.max(0, (threshold - base) / (max - base)));
    const resultMarkerRatio = Math.min(1, Math.max(0, (actual - base) / (max - base)));
    const delta = (actual - threshold) * 100;
    gauges.push({
      kind: "higher-is-better",
      id: "minTotalReturn",
      label: "최소 수익률",
      threshold,
      actual,
      thresholdPct: `${(threshold * 100).toFixed(2)}%`,
      actualPct: `${(actual * 100).toFixed(2)}%`,
      deltaLabel: `기준보다 ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}%p`,
      met: actual >= threshold,
      thresholdMarkerRatio,
      resultMarkerRatio,
    });
  }

  if (t.maxMdd != null && r.maxDrawdown != null) {
    const limit = Math.abs(t.maxMdd);
    const actual = Math.abs(r.maxDrawdown);
    const span = Math.max(limit * 0.35, 0.01);
    const max = limit + span * 0.2;
    const limitMarkerRatio = limit / max;
    const resultMarkerRatio = Math.min(1, actual / max);
    const delta = (limit - actual) * 100;
    gauges.push({
      kind: "lower-is-better",
      id: "maxMdd",
      label: "최대 낙폭",
      limit,
      actual,
      limitPct: `${(limit * 100).toFixed(2)}%`,
      actualPct: `${(actual * 100).toFixed(2)}%`,
      deltaLabel: `한도보다 ${delta.toFixed(2)}%p 낮음`,
      met: actual <= limit,
      limitMarkerRatio,
      resultMarkerRatio,
    });
  }

  if (t.minTradeCount != null && r.tradeCount != null) {
    const minimum = t.minTradeCount;
    const actual = r.tradeCount;
    const max = Math.max(minimum * 2, actual, minimum + 1);
    gauges.push({
      kind: "count-min",
      id: "minTradeCount",
      label: "최소 거래수",
      minimum,
      actual,
      deltaLabel: `기준보다 ${actual - minimum}회 많음`,
      met: actual >= minimum,
      thresholdMarkerRatio: minimum / max,
      resultMarkerRatio: Math.min(1, actual / max),
    });
  }

  if (ctx?.jitterEnabled === true && r.passed) {
    gauges.push({
      kind: "stability",
      id: "jitter",
      label: "안정성 검증",
      met: true,
    });
  }

  return gauges;
}
