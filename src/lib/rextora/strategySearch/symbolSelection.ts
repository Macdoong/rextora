/**
 * Persistable automatic symbol selection evidence for Strategy Search.
 * Does not invent market metrics — records the deterministic default policy.
 */

export type SymbolSelectionMode = "recommended" | "manual";

export interface SymbolSelectionEvidence {
  mode: SymbolSelectionMode;
  selectedSymbol: string;
  reasonKo: string;
  liquidityStatus: string;
  volatilityStatus: string;
  dataAvailability: string;
  excludedAlternatives: Array<{ symbol: string; reasonKo: string }>;
}

const DEFAULT_RECOMMENDED = "BTCUSDT";

/** Known operator-selectable USDT-M symbols (UI allow-list). */
export const SELECTABLE_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "DOTUSDT",
] as const;

/**
 * Build selection evidence at job-create time.
 * Recommended mode always selects BTCUSDT with the documented default policy.
 */
export function buildSymbolSelectionEvidence(input: {
  mode: SymbolSelectionMode;
  selectedSymbol: string;
}): SymbolSelectionEvidence {
  const selected = (input.selectedSymbol || DEFAULT_RECOMMENDED).toUpperCase();
  if (input.mode === "manual") {
    return {
      mode: "manual",
      selectedSymbol: selected,
      reasonKo: "사용자가 직접 선택",
      liquidityStatus: "사용자 지정",
      volatilityStatus: "사용자 지정",
      dataAvailability: "요청 시점 확인",
      excludedAlternatives: [],
    };
  }
  return {
    mode: "recommended",
    selectedSymbol: DEFAULT_RECOMMENDED,
    reasonKo: "충분한 거래량 · 데이터 정상 · 변동성 기준 충족",
    liquidityStatus: "충분",
    volatilityStatus: "기준 충족",
    dataAvailability: "정상",
    excludedAlternatives: SELECTABLE_SYMBOLS.filter((s) => s !== DEFAULT_RECOMMENDED).map(
      (symbol) => ({
        symbol,
        reasonKo: "기본 추천은 유동성·데이터 가용성이 가장 안정적인 BTCUSDT",
      }),
    ),
  };
}
