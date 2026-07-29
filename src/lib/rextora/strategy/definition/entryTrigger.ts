/**
 * Canonical entry-trigger contract for event-sequence strategies.
 * Absent / incomplete triggers resolve to legacy behavior (no silent rewrite).
 */

import type { OhlcvCandle } from "../../data/ohlcvTypes";

export const ENTRY_TRIGGER_SCHEMA_VERSION = 1 as const;

export type EntryTriggerMode =
  | "TOUCH"
  | "PENETRATION"
  | "CLOSE_INSIDE"
  | "REJECTION_CANDLE"
  | "BREAK_AND_RETEST"
  | "CONFIRMATION_SEQUENCE";

/** Only mode executed by the eventSequence walker for schema v1 definitions. */
export const ENGINE_SUPPORTED_TRIGGER_MODE = "PENETRATION" as const;

export type EntryTriggerValidationCode = "UNSUPPORTED_TRIGGER_MODE";

export class EntryTriggerValidationError extends Error {
  readonly code: EntryTriggerValidationCode = "UNSUPPORTED_TRIGGER_MODE";

  constructor(
    public readonly triggerMode: string,
    message?: string,
  ) {
    super(
      message ??
        `triggerMode "${triggerMode}" is not supported; only ${ENGINE_SUPPORTED_TRIGGER_MODE} is executable`,
    );
    this.name = "EntryTriggerValidationError";
  }
}

export function validateEntryTriggerParams(
  entryParams: Record<string, unknown> | null | undefined,
): { ok: true } | { ok: false; code: EntryTriggerValidationCode; triggerMode: string } {
  if (!entryParams || entryParams.entryTriggerSchemaVersion !== 1) {
    return { ok: true };
  }
  const raw = entryParams.triggerMode;
  const mode =
    typeof raw === "string" && raw.trim().length > 0
      ? raw.trim()
      : ENGINE_SUPPORTED_TRIGGER_MODE;
  if (mode !== ENGINE_SUPPORTED_TRIGGER_MODE) {
    return { ok: false, code: "UNSUPPORTED_TRIGGER_MODE", triggerMode: mode };
  }
  return { ok: true };
}

export type EntryTouchBasis = "WICK" | "BODY" | "CLOSE" | "ANY";

export type EntryPenetrationMode =
  | "FIRST_TOUCH"
  | "PERCENT_OF_ZONE"
  | "MIDPOINT"
  | "FULL_FILL"
  | "CUSTOM_RANGE";

export type EntryConfirmationMode =
  | "NONE"
  | "SINGLE_CLOSE"
  | "CONSECUTIVE_CLOSES"
  | "THRESHOLD_COUNT"
  | "REVERSAL_CANDLE"
  | "STRUCTURE_CONFIRMATION";

export type EntryExecutionMode =
  | "TOUCH_PRICE"
  | "CONFIRMATION_CLOSE"
  | "NEXT_BAR_OPEN"
  | "LIMIT_AT_ZONE_LEVEL";

export type EntryInvalidationBasis =
  | "WICK_BEYOND_ZONE"
  | "CLOSE_BEYOND_ZONE"
  | "BODY_BEYOND_ZONE"
  | "CUSTOM_EXTENSION";

export type PatternLifecycleStage =
  | "DETECTED"
  | "WAITING_FOR_TOUCH"
  | "TOUCHED"
  | "WAITING_FOR_CONFIRMATION"
  | "CONFIRMED"
  | "ENTRY_READY"
  | "ENTERED"
  | "EXPIRED"
  | "INVALIDATED"
  | "REJECTED"
  | "CANCELLED";

export interface PatternEntryTrigger {
  schemaVersion: typeof ENTRY_TRIGGER_SCHEMA_VERSION;
  triggerMode: EntryTriggerMode;
  touchBasis: EntryTouchBasis;
  penetrationMode: EntryPenetrationMode;
  /** Fraction of zone height (0–1+) for PERCENT_OF_ZONE / CUSTOM_RANGE. */
  penetrationValue: number;
  requireCloseInsideZone: boolean;
  requireCloseBackOutsideZone: boolean;
  confirmationMode: EntryConfirmationMode;
  confirmationBars: number;
  /** null = unlimited (legacy). */
  maxBarsAfterTouch: number | null;
  /** null = unlimited (legacy). 0 = same bar only. */
  maxBarsAfterConfirmation: number | null;
  entryExecution: EntryExecutionMode;
  /**
   * Max distance from zone edge as a multiple of zone height.
   * 0 = must touch/overlap zone; 0.5 = within 0.5× zone height outside.
   */
  entryPriceTolerancePct: number;
  revalidateAtEntry: boolean;
  invalidateWhenZoneBroken: boolean;
  invalidationBasis: EntryInvalidationBasis;
}

/** New-strategy defaults derived from catalog ranges (penetration 0.2–0.8, confirm window 1–24). */
export const NEW_STRATEGY_ENTRY_TRIGGER_DEFAULTS: PatternEntryTrigger = {
  schemaVersion: ENTRY_TRIGGER_SCHEMA_VERSION,
  triggerMode: "PENETRATION",
  touchBasis: "WICK",
  penetrationMode: "PERCENT_OF_ZONE",
  penetrationValue: 0.25,
  requireCloseInsideZone: false,
  requireCloseBackOutsideZone: false,
  confirmationMode: "SINGLE_CLOSE",
  confirmationBars: 1,
  maxBarsAfterTouch: 8,
  maxBarsAfterConfirmation: 1,
  entryExecution: "CONFIRMATION_CLOSE",
  entryPriceTolerancePct: 0.5,
  revalidateAtEntry: true,
  invalidateWhenZoneBroken: true,
  invalidationBasis: "CLOSE_BEYOND_ZONE",
};

/** Legacy: unlimited timing, no entry-time spatial revalidation. */
export const LEGACY_ENTRY_TRIGGER: PatternEntryTrigger = {
  schemaVersion: ENTRY_TRIGGER_SCHEMA_VERSION,
  triggerMode: "CONFIRMATION_SEQUENCE",
  touchBasis: "ANY",
  penetrationMode: "PERCENT_OF_ZONE",
  penetrationValue: 0,
  requireCloseInsideZone: false,
  requireCloseBackOutsideZone: false,
  confirmationMode: "NONE",
  confirmationBars: 1,
  maxBarsAfterTouch: null,
  maxBarsAfterConfirmation: null,
  entryExecution: "CONFIRMATION_CLOSE",
  entryPriceTolerancePct: Number.POSITIVE_INFINITY,
  revalidateAtEntry: false,
  invalidateWhenZoneBroken: false,
  invalidationBasis: "CLOSE_BEYOND_ZONE",
};

export type EntryRejectCode =
  | "entry_zone_not_valid_at_execution"
  | "touch_expired"
  | "confirmation_expired"
  | "pattern_expired"
  | "zone_invalidated"
  | "sequence_timeout"
  | "entry_price_outside_tolerance"
  | "required_block_not_active"
  | "operator_not_satisfied";

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function asNullableInt(v: unknown, fallback: number | null): number | null {
  if (v === null || v === undefined) return fallback;
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  return fallback;
}

/**
 * Resolve entry trigger from entry-step params.
 * Missing schemaVersion → legacy (historical strategies unchanged).
 */
export function resolveEntryTrigger(
  entryParams: Record<string, unknown> | null | undefined,
): { trigger: PatternEntryTrigger; legacy: boolean } {
  if (!entryParams || entryParams.entryTriggerSchemaVersion !== 1) {
    return { trigger: { ...LEGACY_ENTRY_TRIGGER }, legacy: true };
  }
  const validated = validateEntryTriggerParams(entryParams);
  if (!validated.ok) {
    throw new EntryTriggerValidationError(validated.triggerMode);
  }
  const d = NEW_STRATEGY_ENTRY_TRIGGER_DEFAULTS;
  return {
    legacy: false,
    trigger: {
      schemaVersion: ENTRY_TRIGGER_SCHEMA_VERSION,
      triggerMode: ENGINE_SUPPORTED_TRIGGER_MODE,
      touchBasis: (entryParams.touchBasis as EntryTouchBasis) ?? d.touchBasis,
      penetrationMode:
        (entryParams.penetrationMode as EntryPenetrationMode) ?? d.penetrationMode,
      penetrationValue: asNumber(entryParams.penetrationValue, d.penetrationValue),
      requireCloseInsideZone: asBool(
        entryParams.requireCloseInsideZone,
        d.requireCloseInsideZone,
      ),
      requireCloseBackOutsideZone: asBool(
        entryParams.requireCloseBackOutsideZone,
        d.requireCloseBackOutsideZone,
      ),
      confirmationMode:
        (entryParams.confirmationMode as EntryConfirmationMode) ??
        d.confirmationMode,
      confirmationBars: Math.max(
        1,
        asNumber(entryParams.confirmationBars, d.confirmationBars),
      ),
      maxBarsAfterTouch: asNullableInt(
        entryParams.maxBarsAfterTouch,
        d.maxBarsAfterTouch,
      ),
      maxBarsAfterConfirmation: asNullableInt(
        entryParams.maxBarsAfterConfirmation,
        d.maxBarsAfterConfirmation,
      ),
      entryExecution:
        (entryParams.entryExecution as EntryExecutionMode) ?? d.entryExecution,
      entryPriceTolerancePct: asNumber(
        entryParams.entryPriceTolerancePct,
        d.entryPriceTolerancePct,
      ),
      revalidateAtEntry: asBool(entryParams.revalidateAtEntry, d.revalidateAtEntry),
      invalidateWhenZoneBroken: asBool(
        entryParams.invalidateWhenZoneBroken,
        d.invalidateWhenZoneBroken,
      ),
      invalidationBasis:
        (entryParams.invalidationBasis as EntryInvalidationBasis) ??
        d.invalidationBasis,
    },
  };
}

/** Flatten trigger into entry-step params (identity-hashable primitives). */
export function entryTriggerToStepParams(
  trigger: PatternEntryTrigger,
): Record<string, number | string | boolean | null> {
  return {
    rule:
      trigger.entryExecution === "NEXT_BAR_OPEN"
        ? "next_bar_open"
        : trigger.entryExecution === "TOUCH_PRICE"
          ? "touch_price"
          : trigger.entryExecution === "LIMIT_AT_ZONE_LEVEL"
            ? "limit_at_zone"
            : "confirmation_close",
    entryTriggerSchemaVersion: ENTRY_TRIGGER_SCHEMA_VERSION,
    triggerMode: trigger.triggerMode,
    touchBasis: trigger.touchBasis,
    penetrationMode: trigger.penetrationMode,
    penetrationValue: trigger.penetrationValue,
    requireCloseInsideZone: trigger.requireCloseInsideZone,
    requireCloseBackOutsideZone: trigger.requireCloseBackOutsideZone,
    confirmationMode: trigger.confirmationMode,
    confirmationBars: trigger.confirmationBars,
    maxBarsAfterTouch: trigger.maxBarsAfterTouch,
    maxBarsAfterConfirmation: trigger.maxBarsAfterConfirmation,
    entryExecution: trigger.entryExecution,
    entryPriceTolerancePct: trigger.entryPriceTolerancePct,
    revalidateAtEntry: trigger.revalidateAtEntry,
    invalidateWhenZoneBroken: trigger.invalidateWhenZoneBroken,
    invalidationBasis: trigger.invalidationBasis,
  };
}

export function zoneWidth(zoneHigh: number, zoneLow: number): number {
  return Math.max(1e-12, zoneHigh - zoneLow);
}

export function candleTouchesZone(
  c: Pick<OhlcvCandle, "high" | "low">,
  zoneHigh: number,
  zoneLow: number,
): boolean {
  return c.low <= zoneHigh && c.high >= zoneLow;
}

export function candleBodyOverlapsZone(
  c: Pick<OhlcvCandle, "open" | "close">,
  zoneHigh: number,
  zoneLow: number,
): boolean {
  const bodyHigh = Math.max(c.open, c.close);
  const bodyLow = Math.min(c.open, c.close);
  return bodyLow <= zoneHigh && bodyHigh >= zoneLow;
}

export function closeInsideZone(
  c: Pick<OhlcvCandle, "close">,
  zoneHigh: number,
  zoneLow: number,
): boolean {
  return c.close >= zoneLow && c.close <= zoneHigh;
}

export function distanceOutsideZone(
  price: number,
  zoneHigh: number,
  zoneLow: number,
): number {
  if (price > zoneHigh) return price - zoneHigh;
  if (price < zoneLow) return zoneLow - price;
  return 0;
}

export function measurePenetrationAtCandle(
  c: Pick<OhlcvCandle, "high" | "low">,
  zoneHigh: number,
  zoneLow: number,
  side: "LONG" | "SHORT",
): number {
  const w = zoneWidth(zoneHigh, zoneLow);
  if (side === "LONG") {
    return Math.max(0, zoneHigh - Math.min(c.low, zoneHigh)) / w;
  }
  return Math.max(0, Math.max(c.high, zoneLow) - zoneLow) / w;
}

export interface EntrySpatialCheck {
  ok: boolean;
  reasonCode: EntryRejectCode | null;
  touchOk: boolean;
  penetrationPct: number;
  distanceOutside: number;
  distanceZoneMult: number;
  toleranceMult: number;
  entryPrice: number;
}

/**
 * Revalidate that the entry candle / price still satisfies the configured zone rule.
 */
export function validateEntryZoneAtExecution(args: {
  side: "LONG" | "SHORT";
  candle: Pick<OhlcvCandle, "open" | "high" | "low" | "close">;
  zoneHigh: number;
  zoneLow: number;
  entryPrice: number;
  trigger: PatternEntryTrigger;
}): EntrySpatialCheck {
  const { side, candle, zoneHigh, zoneLow, entryPrice, trigger } = args;
  const w = zoneWidth(zoneHigh, zoneLow);
  const distanceOutside = distanceOutsideZone(entryPrice, zoneHigh, zoneLow);
  const distanceZoneMult = distanceOutside / w;
  const toleranceMult = trigger.entryPriceTolerancePct;
  const penetrationPct = measurePenetrationAtCandle(
    candle,
    zoneHigh,
    zoneLow,
    side,
  );

  let touchOk = false;
  switch (trigger.touchBasis) {
    case "WICK":
    case "ANY":
      touchOk = candleTouchesZone(candle, zoneHigh, zoneLow);
      break;
    case "BODY":
      touchOk = candleBodyOverlapsZone(candle, zoneHigh, zoneLow);
      break;
    case "CLOSE":
      touchOk = closeInsideZone(candle, zoneHigh, zoneLow);
      break;
    default:
      touchOk = candleTouchesZone(candle, zoneHigh, zoneLow);
  }

  if (trigger.requireCloseInsideZone && !closeInsideZone(candle, zoneHigh, zoneLow)) {
    touchOk = false;
  }

  const withinTolerance =
    Number.isFinite(toleranceMult) && distanceZoneMult <= toleranceMult + 1e-12;

  if (!trigger.revalidateAtEntry) {
    return {
      ok: true,
      reasonCode: null,
      touchOk,
      penetrationPct,
      distanceOutside,
      distanceZoneMult,
      toleranceMult,
      entryPrice,
    };
  }

  if (touchOk || withinTolerance) {
    return {
      ok: true,
      reasonCode: null,
      touchOk,
      penetrationPct,
      distanceOutside,
      distanceZoneMult,
      toleranceMult,
      entryPrice,
    };
  }

  return {
    ok: false,
    reasonCode:
      distanceOutside > 0
        ? "entry_price_outside_tolerance"
        : "entry_zone_not_valid_at_execution",
    touchOk,
    penetrationPct,
    distanceOutside,
    distanceZoneMult,
    toleranceMult,
    entryPrice,
  };
}
