/**
 * Documents the verified equity-curve basis produced by the engines.
 *
 * Verified (SAFE v44 + event-sequence): equity is appended only at trade
 * exits (plus the starting balance). Candle-level mark-to-market while a
 * position is open is NOT calculated. MDD is derived from that same series.
 */

export const EQUITY_BASIS = "trade_exit_realized" as const;

export type EquityBasis = typeof EQUITY_BASIS;

export const EQUITY_BASIS_TITLE_KO = "실현 자산곡선";
export const EQUITY_BASIS_SUBTITLE_KO = "거래 청산 시점 기준";
export const EQUITY_BASIS_HELP_KO =
  "포지션 보유 중 평가손익은 포함되지 않으며 거래 청산 시점의 실현 자산을 표시합니다.";

export const DRAWDOWN_BASIS_TITLE_KO = "실현 낙폭";
export const DRAWDOWN_BASIS_HELP_KO =
  "거래 청산 시점 실현 자산의 최고점 대비 하락률입니다. 캔들별 평가손익 낙폭이 아닙니다.";
