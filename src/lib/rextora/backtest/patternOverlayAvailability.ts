/**
 * Classify whether pattern overlays can render from strategy + persisted traces.
 * Never invents geometry.
 */

import type { TradeEventTrace } from "./tradeEventTrace";

export type PatternOverlayKind =
  | "order_block"
  | "fvg"
  | "trendline"
  | "support_resistance";

export type PatternOverlayStatus =
  | "available"
  | "strategy_unused"
  | "missing_geometry"
  | "unsupported";

export interface PatternOverlayAvailability {
  kind: PatternOverlayKind;
  status: PatternOverlayStatus;
  labelKo: string;
  reasonKo: string;
  defaultOn: boolean;
}

export interface PersistedRejectedSetup {
  bar: number;
  at?: string | null;
  reasonCode: string;
  patternType: string;
  measured: number | null;
  required: number | null;
  rejectionStage?: string | null;
}

const LABELS: Record<PatternOverlayKind, string> = {
  order_block: "오더블럭",
  fvg: "FVG",
  trendline: "추세선",
  support_resistance: "지지·저항",
};

function hasZoneGeometry(t: TradeEventTrace): boolean {
  return (
    t.zoneHigh != null &&
    t.zoneLow != null &&
    Number.isFinite(t.zoneHigh) &&
    Number.isFinite(t.zoneLow)
  );
}

function hasTrendlineGeometry(t: TradeEventTrace): boolean {
  return Array.isArray(t.lineAnchors) && t.lineAnchors.length >= 2;
}

function strategyUsesPattern(
  kind: PatternOverlayKind,
  opts: {
    strategyType?: string | null;
    eventSequenceFamily?: string | null;
    conditionPatternKinds?: string[] | null;
  },
): boolean {
  const family = opts.eventSequenceFamily ?? null;
  if (family === kind) return true;
  if (opts.conditionPatternKinds?.includes(kind)) return true;
  // SAFE / params strategies do not use structural pattern families.
  if (
    !opts.strategyType ||
    opts.strategyType === "safe_params" ||
    opts.strategyType === "safe"
  ) {
    return false;
  }
  return false;
}

export function classifyPatternOverlays(input: {
  strategyType?: string | null;
  eventSequenceFamily?: string | null;
  conditionPatternKinds?: string[] | null;
  traces: TradeEventTrace[];
}): PatternOverlayAvailability[] {
  const kinds: PatternOverlayKind[] = [
    "order_block",
    "fvg",
    "trendline",
    "support_resistance",
  ];
  return kinds.map((kind) => {
    const used = strategyUsesPattern(kind, input);
    const labelKo = LABELS[kind];
    if (!used) {
      const unusedReason =
        kind === "order_block"
          ? "이 전략은 오더블럭 조건을 사용하지 않습니다."
          : kind === "fvg"
            ? "이 전략은 FVG 조건을 사용하지 않습니다."
            : kind === "trendline"
              ? "이 전략은 추세선 조건을 사용하지 않습니다."
              : "이 전략은 지지·저항 조건을 사용하지 않습니다.";
      return {
        kind,
        status: "strategy_unused",
        labelKo,
        reasonKo: unusedReason,
        defaultOn: false,
      };
    }
    const matching = input.traces.filter((t) => t.patternType === kind);
    const hasGeo =
      kind === "trendline"
        ? matching.some(hasTrendlineGeometry)
        : matching.some(hasZoneGeometry);
    if (!hasGeo) {
      const missingReason =
        kind === "fvg"
          ? "이 실행에는 저장된 FVG 도형 데이터가 없습니다. 새 trace-enabled 백테스트가 필요합니다."
          : "이 실행에는 저장된 패턴 도형 데이터가 없습니다. 새 trace-enabled 백테스트가 필요합니다.";
      return {
        kind,
        status: "missing_geometry",
        labelKo,
        reasonKo: missingReason,
        defaultOn: false,
      };
    }
    return {
      kind,
      status: "available",
      labelKo,
      reasonKo: "저장된 트레이스 geometry를 표시합니다.",
      defaultOn: true,
    };
  });
}
