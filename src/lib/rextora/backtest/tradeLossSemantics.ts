/**
 * Documents and computes max-trade-loss display semantics.
 *
 * Engine convention (backtestEngine):
 *   pnlPct = (rawPriceReturn - costRates) * leverage
 * i.e. leveraged position return on margin — NOT account equity return.
 */

import type { BacktestTrade } from "./backtestEngine";

export const MAX_TRADE_LOSS_LABEL_KO = "최대 단일 거래 손실";
export const MAX_TRADE_LOSS_UNIT = "%";
export const MAX_TRADE_LOSS_HELP_KO =
  "포지션 손익률은 레버리지가 반영된 거래 기준 수치입니다. 실제 계좌 전체 자산 영향은 별도로 표시됩니다.";
export const LEVERAGED_POSITION_PNL_LABEL_KO = "레버리지 적용 포지션 손익률";
export const ACCOUNT_EQUITY_IMPACT_LABEL_KO = "계좌 자산 영향";

export interface MaxTradeLossStats {
  /** Min pnlPct across trades (leveraged margin return). */
  leveragedPnlPct: number | null;
  /** Worst trade netPnlUsdt / startingBalance (account equity impact). */
  accountEquityImpactPct: number | null;
  worstTradeLeverage: number | null;
  labelKo: typeof MAX_TRADE_LOSS_LABEL_KO;
  unit: typeof MAX_TRADE_LOSS_UNIT;
  helpKo: typeof MAX_TRADE_LOSS_HELP_KO;
}

export function computeMaxTradeLossStats(
  trades: Array<Pick<BacktestTrade, "pnlPct" | "netPnlUsdt" | "leverage">>,
  startingBalance: number,
): MaxTradeLossStats {
  if (!trades.length) {
    return {
      leveragedPnlPct: null,
      accountEquityImpactPct: null,
      worstTradeLeverage: null,
      labelKo: MAX_TRADE_LOSS_LABEL_KO,
      unit: MAX_TRADE_LOSS_UNIT,
      helpKo: MAX_TRADE_LOSS_HELP_KO,
    };
  }
  let worst = trades[0]!;
  for (const t of trades) {
    if (t.pnlPct < worst.pnlPct) worst = t;
  }
  const worstNet = worst.netPnlUsdt ?? null;
  const equityImpact =
    startingBalance > 0 && worstNet != null && Number.isFinite(worstNet)
      ? worstNet / startingBalance
      : null;
  return {
    leveragedPnlPct: worst.pnlPct,
    accountEquityImpactPct: equityImpact,
    worstTradeLeverage: worst.leverage,
    labelKo: MAX_TRADE_LOSS_LABEL_KO,
    unit: MAX_TRADE_LOSS_UNIT,
    helpKo: MAX_TRADE_LOSS_HELP_KO,
  };
}
