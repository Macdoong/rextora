import { NextResponse } from "next/server";
import { getStrategyById } from "@/src/lib/rextora/strategy/strategyStore";
import { storedToDefinition } from "@/src/lib/rextora/strategy/definition/bridge";
import { validateCanonicalDefinition } from "@/src/lib/rextora/strategy/definition/validator";
import { loadOhlcvCandles } from "@/src/lib/rextora/data/candleLoader";
import { evaluateBuilderSignal } from "@/src/lib/rextora/strategy/conditions/evaluator";
import { detectOrderBlocks } from "@/src/lib/rextora/strategy/conditions/orderBlock";
import { detectFvg } from "@/src/lib/rextora/strategy/conditions/fvg";
import { detectTrendLine } from "@/src/lib/rextora/strategy/conditions/trendLine";
import { detectSupportResistance } from "@/src/lib/rextora/strategy/conditions/supportResistance";
import { computeAtrSeries } from "@/src/lib/rextora/indicator/indicatorEngine";
import { candlesToPoints, tradesToMarkers } from "@/src/lib/rextora/charts/adapters";
import { evaluateSafeV44Signal } from "@/src/lib/rextora/signal/safeV44SignalEngine";
import { computeIndicators } from "@/src/lib/rextora/indicator/indicatorEngine";
import type { LevelLine, TradeMarker } from "@/src/lib/rextora/charts/types";
import { CHART_THEME } from "@/src/lib/rextora/charts/theme";

/** Preview strategy signals + structure overlays for Unified Chart Engine. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  const symbol = (url.searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();
  const interval = url.searchParams.get("interval") ?? "15m";
  if (!id) return NextResponse.json({ ok: false, error: "전략 고유번호가 필요합니다." }, { status: 400 });

  const strategy = getStrategyById(id);
  if (!strategy) return NextResponse.json({ ok: false, error: "전략을 찾을 수 없습니다." }, { status: 404 });

  const def = storedToDefinition(strategy);
  const validation = validateCanonicalDefinition(def);

  const { candles, source, error } = await loadOhlcvCandles(symbol, { interval, limit: 180, allowSynthetic: true });
  if (!candles.length) {
    return NextResponse.json({
      ok: true,
      data: {
        empty: true,
        emptyLabel: "캔들 데이터가 없습니다. 네트워크 또는 심볼을 확인하세요.",
        validation,
        candles: [],
        markers: [],
        levels: []
      }
    });
  }

  const points = candlesToPoints(candles);
  const atr = computeAtrSeries(
    candles.map((c) => c.high),
    candles.map((c) => c.low),
    candles.map((c) => c.close),
    14
  );
  const markers: TradeMarker[] = [];
  const levels: LevelLine[] = [];
  const bar = candles.length - 1;

  if (strategy.strategyType === "condition_builder") {
    const sig = evaluateBuilderSignal(def, { candles, bar });
    if (sig === "LONG") markers.push({ time: candles[bar].openTime, price: candles[bar].close, kind: "entry_long", label: "매수" });
    if (sig === "SHORT") markers.push({ time: candles[bar].openTime, price: candles[bar].close, kind: "entry_short", label: "매도" });
  } else {
    const series = computeIndicators(candles, strategy.params);
    const signal = evaluateSafeV44Signal({
      symbol,
      series,
      params: strategy.params,
      paramsHash: strategy.paramsHash
    });
    if (signal.side === "LONG") markers.push({ time: candles[bar].openTime, price: candles[bar].close, kind: "entry_long", label: "매수" });
    if (signal.side === "SHORT") markers.push({ time: candles[bar].openTime, price: candles[bar].close, kind: "entry_short", label: "매도" });
  }

  const a = atr[bar] ?? 0;
  const ob = detectOrderBlocks(candles, bar, a, "bullish", {
    bodyOnly: false,
    minImpulseAtrMult: 0.8,
    minImpulsePct: 0.15,
    minVolumeMult: 1,
    maxAgeBars: 40,
    mitigationPct: 50,
    firstTouchOnly: false,
    retestAllowed: true,
    entryInsideBlock: false,
    invalidateOnCloseBeyond: true
  });
  if (ob.zone) {
    levels.push({ price: ob.zone.high, color: CHART_THEME.entryLong, label: "OB↑", dashed: true });
    levels.push({ price: ob.zone.low, color: CHART_THEME.entryLong, label: "OB↑L", dashed: true });
  }
  const fvg = detectFvg(candles, bar, a, "bullish", {
    minGapAbs: 0,
    minGapPct: 0.05,
    atrRelativeMult: 0.2,
    partialFillPct: 1,
    fullFillInvalidates: true,
    maxAgeBars: 40,
    firstTouchOnly: false,
    entryInsideGap: false,
    invalidateOnCloseThrough: true
  });
  if (fvg.zone) {
    levels.push({ price: fvg.zone.high, color: CHART_THEME.up, label: "FVG", dashed: true });
    levels.push({ price: fvg.zone.low, color: CHART_THEME.up, label: "FVG L", dashed: true });
  }
  const tl = detectTrendLine(candles, bar, "support_trend_line", {
    minPivotCount: 2,
    minTouchCount: 2,
    slopeMin: 0,
    slopeMax: 10,
    tolerancePct: 0.4,
    breakoutByClose: true,
    breakoutByWick: false,
    confirmationCandles: 0,
    retestRequired: false,
    maxAgeBars: 80
  });
  if (tl.line) {
    levels.push({
      price: tl.line.startPrice,
      endPrice: tl.line.endPrice,
      color: CHART_THEME.accentAlt,
      label: "추세선",
      dashed: true
    });
  }
  const sr = detectSupportResistance(candles, bar, "support_zone", {
    lookback: 40,
    minTouches: 2,
    tolerancePct: 0.3,
    zoneWidthPct: 0.25,
    volumeConfirmation: false,
    breakoutConfirmation: false,
    maxAgeBars: 100
  });
  if (sr.zone) {
    levels.push({ price: sr.zone.high, color: CHART_THEME.resistance, label: "저항", dashed: true });
    levels.push({ price: sr.zone.low, color: CHART_THEME.support, label: "지지", dashed: true });
  }

  // SL/TP preview from risk settings
  const close = candles[bar].close;
  const slMult = def.risk.stopLossAtrMult;
  const tpMult = def.risk.takeProfitAtrMult;
  if (a > 0) {
    levels.push({ price: close - a * slMult, color: CHART_THEME.stopLoss, label: "손절" });
    levels.push({ price: close + a * tpMult, color: CHART_THEME.takeProfit, label: "익절" });
  }

  void tradesToMarkers;

  return NextResponse.json({
    ok: true,
    data: {
      empty: false,
      source,
      error: error ?? null,
      validation,
      candles: points,
      markers,
      levels,
      strategyId: strategy.id,
      strategyName: strategy.name
    }
  });
}
