import type { SafeV44Params } from "../strategy/strategyTypes";
import type { SignalSide, SignalType } from "../signal/safeV44SignalEngine";

export interface RiskEngineInput {
  entryPrice: number;
  atr: number;
  atrPct: number;
  side: Exclude<SignalSide, "NONE">;
  signalType: SignalType;
  balance: number;
  params: SafeV44Params;
  currentDrawdown?: number;
}

export interface RiskEngineResult {
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  trailingStopDistance: number;
  leverage: number;
  marginAmount: number;
  positionNotional: number;
  sizeMultiplier: number;
  quantity: number;
  maxHoldBars: number;
  useTrailing: boolean;
  riskReason: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function calculateSafeV44Risk(input: RiskEngineInput): RiskEngineResult {
  const { entryPrice, atr, atrPct, side, signalType, balance, params } = input;
  const dd = input.currentDrawdown ?? 0;
  const isLong = side === "LONG";

  const stopLossPrice = isLong
    ? entryPrice - atr * params.sl_atr_mult
    : entryPrice + atr * params.sl_atr_mult;
  const takeProfitPrice = isLong
    ? entryPrice + atr * params.tp_atr_mult
    : entryPrice - atr * params.tp_atr_mult;
  const trailingStopDistance = params.use_trailing ? atr * params.trail_atr_mult : 0;

  let sizeMultiplier = 1;
  if (params.use_vol_target && atrPct > 0 && params.target_atr_pct > 0) {
    sizeMultiplier = params.target_atr_pct / atrPct;
  }
  sizeMultiplier = clamp(sizeMultiplier, params.size_min, params.size_max);

  if (signalType === "range_long") {
    sizeMultiplier *= params.range_risk_mult;
  }
  sizeMultiplier = Math.min(sizeMultiplier, params.risk_mult_cap);

  let leverage = params.lev_base;
  if (params.use_dynamic_leverage) {
    if (atrPct <= params.lev_atr_ok_max) {
      leverage = params.lev_max;
    } else if (atrPct >= params.lev_atr_too_high) {
      leverage = params.lev_min;
    } else {
      const t =
        (atrPct - params.lev_atr_ok_max) / Math.max(1e-9, params.lev_atr_too_high - params.lev_atr_ok_max);
      leverage = params.lev_max + (params.lev_min - params.lev_max) * t;
    }

    if (dd <= params.lev_down_on_dd) {
      leverage = Math.min(leverage, params.lev_min);
    } else if (dd >= params.lev_up_on_dd) {
      leverage = Math.min(params.lev_max, leverage * 1.05);
    }
  }

  leverage = clamp(leverage, params.lev_min, params.lev_max);

  const marginAmount = balance * params.base_bal_pct * sizeMultiplier;
  const positionNotional = marginAmount * leverage;
  const quantity = entryPrice > 0 ? positionNotional / entryPrice : 0;

  return {
    entryPrice,
    stopLossPrice: Number(stopLossPrice.toFixed(8)),
    takeProfitPrice: Number(takeProfitPrice.toFixed(8)),
    trailingStopDistance: Number(trailingStopDistance.toFixed(8)),
    leverage: Number(leverage.toFixed(4)),
    marginAmount: Number(marginAmount.toFixed(4)),
    positionNotional: Number(positionNotional.toFixed(4)),
    sizeMultiplier: Number(sizeMultiplier.toFixed(4)),
    quantity: Number(quantity.toFixed(8)),
    maxHoldBars: params.max_hold_bars,
    useTrailing: params.use_trailing,
    riskReason: `SL=${params.sl_atr_mult}ATR TP=${params.tp_atr_mult}ATR lev=${leverage.toFixed(2)} size=${sizeMultiplier.toFixed(2)}`
  };
}

export function updateTrailingStop(
  side: "LONG" | "SHORT",
  currentPrice: number,
  currentStop: number,
  trailDistance: number
): number {
  if (trailDistance <= 0) return currentStop;
  if (side === "LONG") {
    const candidate = currentPrice - trailDistance;
    return Math.max(currentStop, candidate);
  }
  const candidate = currentPrice + trailDistance;
  return Math.min(currentStop, candidate);
}
