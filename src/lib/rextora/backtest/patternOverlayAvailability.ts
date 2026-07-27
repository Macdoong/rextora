/**
 * Classify whether pattern overlays can render from strategy + persisted traces.
 * Never invents geometry.
 */

import type { TradeEventTrace } from "./tradeEventTrace";
import type { RejectedSetup } from "../strategy/eventSequenceBacktest";

export type PatternOverlayKind =
  | "order_block"
  | "fvg"
  | "trendline"
  | "support_resistance"
  | "supply_demand";

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

export type PersistedRejectedSetup = RejectedSetup;

const LABELS: Record<PatternOverlayKind, string> = {
  order_block: "오더블럭",
  fvg: "FVG",
  trendline: "추세선",
  support_resistance: "지지·저항",
  supply_demand: "수요·공급",
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
    traces: TradeEventTrace[];
  },
): boolean {
  const family = opts.eventSequenceFamily ?? null;
  if (family === kind) return true;
  if (opts.conditionPatternKinds?.includes(kind)) return true;
  // Persisted traces are authoritative — never invent geometry, but do not
  // hide overlays when the run already stored this patternType.
  if (
    opts.traces.some(
      (t) =>
        t.patternType === kind ||
        t.patternBlocks?.some(
          (b) => b.family === kind && b.status === "detected",
        ),
    )
  ) {
    return true;
  }
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

/** Resolve pattern family from a stored strategy definition / metadata. */
export function resolveEventSequenceFamilyFromStrategy(strategy: {
  strategyType?: string | null;
  definition?: {
    eventSequence?: {
      steps?: Array<{ kind?: string; patternFamily?: string | null }>;
      combination?: {
        blocks?: Array<{ family?: string; role?: string }>;
      } | null;
    } | null;
    metadata?: Record<string, unknown> | null;
  } | null;
  metadata?: Record<string, unknown> | null;
} | null): PatternOverlayKind | null {
  if (!strategy) return null;
  const comboBlocks =
    strategy.definition?.eventSequence?.combination?.blocks ?? [];
  const entryZone = comboBlocks.find((b) => b.role === "entry_zone");
  if (
    entryZone?.family === "order_block" ||
    entryZone?.family === "fvg" ||
    entryZone?.family === "trendline" ||
    entryZone?.family === "support_resistance" ||
    entryZone?.family === "supply_demand"
  ) {
    return entryZone.family;
  }
  const steps = strategy.definition?.eventSequence?.steps;
  const creation = Array.isArray(steps)
    ? steps.find((s) => s.kind === "pattern_creation")
    : undefined;
  const fromStep = creation?.patternFamily;
  if (
    fromStep === "order_block" ||
    fromStep === "fvg" ||
    fromStep === "trendline" ||
    fromStep === "support_resistance" ||
    fromStep === "supply_demand"
  ) {
    return fromStep;
  }
  const meta = strategy.definition?.metadata ?? strategy.metadata ?? null;
  const raw =
    (typeof meta?.searchFamily === "string" && meta.searchFamily) ||
    (typeof meta?.pattern === "string" && meta.pattern) ||
    null;
  if (
    raw === "order_block" ||
    raw === "fvg" ||
    raw === "trendline" ||
    raw === "support_resistance" ||
    raw === "supply_demand"
  ) {
    return raw;
  }
  return null;
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
    "supply_demand",
  ];
  return kinds.map((kind) => {
    const used = strategyUsesPattern(kind, { ...input, traces: input.traces });
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
    const blockGeo = input.traces.some((t) =>
      t.patternBlocks?.some(
        (b) =>
          b.family === kind &&
          b.status === "detected" &&
          (kind === "trendline"
            ? Array.isArray(b.lineAnchors) && b.lineAnchors.length >= 2
            : b.zoneHigh != null &&
              b.zoneLow != null &&
              Number.isFinite(b.zoneHigh) &&
              Number.isFinite(b.zoneLow)),
      ),
    );
    const hasGeo =
      kind === "trendline"
        ? matching.some(hasTrendlineGeometry) || blockGeo
        : matching.some(hasZoneGeometry) || blockGeo;
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
