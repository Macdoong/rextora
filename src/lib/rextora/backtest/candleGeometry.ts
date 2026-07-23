/**
 * Candle slot / body geometry for SVG chart display only.
 * Tuned to TradingView-like readability (density / body / default range).
 * Does not alter OHLC values or the backtest engine.
 *
 * Custom SVG category slots — not a TradingView barSpacing API.
 */

/** Minimum readable body width when the slot can fit it (CSS px). */
export const MIN_CANDLE_BODY_PX = 10;
/** Preferred body width band at desktop default zoom (TV reference ~10–12). */
export const PREFERRED_BODY_MIN_PX = 10;
export const PREFERRED_BODY_MAX_PX = 14;
export const MIN_WICK_PX = 2;
export const MAX_WICK_PX = 3;
/** Body stroke (CSS px) for edge definition. */
export const BODY_STROKE_PX = 1;
/** Minimum rendered body height for doji / near-doji candles (CSS px). */
export const MIN_CANDLE_BODY_HEIGHT_PX = 3;
/**
 * Fraction of each category slot filled by the candle body.
 * TradingView reference ≈ 75–85% with a thin 1–2px visual gap.
 */
export const BODY_FILL_RATIO = 0.82;
/** Minimum gap between adjacent bodies (px) — never overlap. */
export const MIN_BODY_GAP_PX = 1;
/** Sharp rectangles — TradingView bodies have no rounded corners. */
export const BODY_CORNER_RADIUS_MIN = 0;
export const BODY_CORNER_RADIUS_MAX = 0;
/**
 * Vertical domain pad — OHLC span occupies ~1/(1+2p) of the candle pane.
 * pad 0.06 → ~89% of pane; with volume subordinate → ~80–90% chart height.
 */
export const PRICE_DOMAIN_PAD = 0.06;
/** Volume pane as fraction of plot height (subordinate to price). */
export const VOLUME_FRACTION = 0.12;
/** Markers — ~50% larger than prior 5.5/7 for readable Entry/Exit/TP/SL. */
export const MARKER_BASE_RADIUS = 8.5;
export const MARKER_SELECTED_RADIUS = 11;
export const MARKER_OPACITY = 0.88;
export const MARKER_OFFSET_PX = 16;

/** Last pre-TV-match desktop body (for docs). Target band is now 10–14. */
export const PREVIOUS_DEFAULT_BODY_PX = 20;

export interface CandleGeometry {
  slot: number;
  bodyWidth: number;
  gap: number;
  wickWidth: number;
  cornerRadius: number;
  /** Slot occupancy bodyWidth/slot (0–1). */
  occupancy: number;
  /** 0 = mobile, 1 = tablet, 2 = desktop */
  densityTier: 0 | 1 | 2;
}

/** Responsive tier from plot width (CSS px). */
export function candleDensityTier(plotWidthPx: number): 0 | 1 | 2 {
  if (plotWidthPx < 480) return 0;
  if (plotWidthPx < 900) return 1;
  return 2;
}

/**
 * Default visible candle count from viewport plot width.
 * Matches TradingView-like default density (~65 bars on desktop).
 * Mobile 28–40 · Tablet 40–55 · Desktop 55–75.
 */
export function defaultVisibleCandleTarget(
  plotWidthPx: number,
  dataPointCount: number,
): number {
  if (dataPointCount <= 0) return 0;
  const tier = candleDensityTier(plotWidthPx);
  // Slot budget ≈ body/fill → ~10–14px bodies at 80% fill on desktop
  const slotBudget = tier === 0 ? 10 : tier === 1 ? 14 : 17;
  const [lo, hi] =
    tier === 0
      ? ([28, 40] as const)
      : tier === 1
        ? ([40, 55] as const)
        : ([55, 75] as const);
  const raw = Math.floor(Math.max(160, plotWidthPx) / slotBudget);
  const capped = Math.min(hi, Math.max(lo, raw));
  return Math.min(dataPointCount, capped);
}

/** Snap to whole CSS pixels to avoid blurry half-pixel SVG edges. */
export function snapPx(v: number): number {
  return Math.round(v);
}

/**
 * Compute body/wick sizes for the current zoom window.
 * Bodies occupy ~75–85% of each slot; never overlap.
 * Slot uses center-to-center spacing (matches xScale domain 0…n-1).
 * Deep zoom: body grows with slot (no artificial 14px cap).
 */
export function computeCandleGeometry(
  plotWidthPx: number,
  visibleCount: number,
): CandleGeometry {
  const n = Math.max(1, visibleCount);
  // Centers are spaced by plotW/(n-1); size bodies from that pitch.
  const slot = n <= 1 ? plotWidthPx : plotWidthPx / (n - 1);
  const tier = candleDensityTier(plotWidthPx);
  const preferredMin =
    tier === 0 ? 8 : tier === 1 ? 9 : PREFERRED_BODY_MIN_PX;
  const preferredMax =
    tier === 0 ? 12 : tier === 1 ? 13 : PREFERRED_BODY_MAX_PX;
  const gapFloor = Math.min(MIN_BODY_GAP_PX, Math.max(0.25, slot * 0.1));
  const maxBodyForSlot = Math.max(0.25, slot - gapFloor);
  // Default zoom: soft hard-max. Deep zoom: grow with slot (individual candles).
  const deepZoom = slot >= 22;
  const hardMax = deepZoom
    ? maxBodyForSlot
    : Math.min(maxBodyForSlot, tier === 0 ? 14 : tier === 1 ? 16 : 18);

  let body = Math.min(slot * BODY_FILL_RATIO, hardMax);

  if (maxBodyForSlot >= MIN_CANDLE_BODY_PX) {
    body = Math.max(MIN_CANDLE_BODY_PX, body);
    if (slot >= preferredMin + gapFloor) {
      body = Math.max(body, Math.min(preferredMin, hardMax));
    }
    // Prefer band only at default density — deep zoom must grow
    if (!deepZoom) {
      body = Math.min(body, preferredMax, hardMax);
    }
  }

  body = Math.min(hardMax, Math.max(0.25, body));

  // Occupancy band 75–85%
  const minOcc = 0.75;
  const maxOcc = 0.85;
  if (slot >= MIN_CANDLE_BODY_PX + MIN_BODY_GAP_PX) {
    let occ = body / slot;
    if (occ > maxOcc) body = Math.min(hardMax, slot * maxOcc);
    if (occ < minOcc && slot * minOcc <= hardMax) {
      body = Math.max(body, Math.min(hardMax, slot * minOcc));
    }
    if (maxBodyForSlot >= MIN_CANDLE_BODY_PX && !deepZoom) {
      body = Math.max(MIN_CANDLE_BODY_PX, Math.min(hardMax, body));
      body = Math.min(body, preferredMax, hardMax);
    }
  }

  if (body + gapFloor > slot) {
    body = Math.max(0.25, slot - gapFloor);
  }

  // Round to whole pixels without exceeding occupancy band or slot
  const rounded = Math.round(body);
  if (
    rounded <= maxBodyForSlot &&
    rounded / slot <= 0.85 + 1e-9 &&
    (rounded / slot >= 0.75 - 1e-9 || rounded === Math.floor(body))
  ) {
    body = Math.max(0.25, rounded);
  } else {
    body = Math.max(0.25, Math.min(maxBodyForSlot, Math.floor(body + 1e-9)));
  }
  if (body + gapFloor > slot) {
    body = Math.max(0.25, slot - gapFloor);
  }

  const wickWidth =
    body >= MIN_CANDLE_BODY_PX
      ? Math.max(MIN_WICK_PX, Math.min(MAX_WICK_PX, Math.round(body * 0.18)))
      : Math.max(1, Math.min(2, Math.round(body * 0.35)));

  return {
    slot,
    bodyWidth: body,
    gap: Math.max(gapFloor, slot - body),
    wickWidth,
    cornerRadius: 0,
    occupancy: body / slot,
    densityTier: tier,
  };
}
