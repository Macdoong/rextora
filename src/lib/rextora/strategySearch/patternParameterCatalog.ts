import type { StrategySearchParameterRange } from "./types";
import type { PatternSearchFamilyId } from "./patternSearchSpaces";

export type PatternParameterType = "enum" | "int" | "float" | "bool";
export type PatternParameterValue = string | number | boolean;

export interface PatternParameterCatalogEntry {
  key: string;
  type: PatternParameterType;
  allowedEnumValues: readonly string[] | null;
  min: number | boolean | null;
  default: PatternParameterValue;
  max: number | boolean | null;
  step: number | null;
  labelKo: string;
  /** Concrete event-sequence or detector contract field. */
  detectorField: string;
  mutationEligible: boolean;
  explanationLabel: string;
}

const field = (
  key: string,
  type: PatternParameterType,
  config: Omit<
    PatternParameterCatalogEntry,
    "key" | "type" | "allowedEnumValues"
  > & { allowedEnumValues?: readonly string[] | null },
): PatternParameterCatalogEntry => ({
  key,
  type,
  allowedEnumValues: config.allowedEnumValues ?? null,
  ...config,
});

const COMMON: readonly PatternParameterCatalogEntry[] = [
  field("direction", "enum", { allowedEnumValues: ["both", "long", "short"], min: null, default: "both", max: null, step: null, labelKo: "거래 방향", detectorField: "eventSequence.direction", mutationEligible: true, explanationLabel: "패턴 거래 방향" }),
  field("penetrationPct", "float", { min: 0.2, default: 0.45, max: 0.8, step: 0.05, labelKo: "존 침투 비율", detectorField: "penetration.penetrationPct", mutationEligible: true, explanationLabel: "재진입 깊이" }),
  field("requireTouch", "bool", { min: false, default: true, max: true, step: null, labelKo: "재접촉 필수", detectorField: "revisit.requireTouch", mutationEligible: true, explanationLabel: "재접촉 조건" }),
  field("confirmationMode", "enum", { allowedEnumValues: ["none", "single_close", "consecutive_closes", "threshold_count"], min: null, default: "single_close", max: null, step: null, labelKo: "확인 방식", detectorField: "confirmation.confirmationMode", mutationEligible: true, explanationLabel: "진입 확인 방식" }),
  field("confirmationCandleCount", "int", { min: 1, default: 1, max: 8, step: 1, labelKo: "확인 봉 수", detectorField: "confirmation.confirmationCandleCount", mutationEligible: true, explanationLabel: "필요 확인 횟수" }),
  field("confirmationWindow", "int", { min: 1, default: 4, max: 24, step: 1, labelKo: "확인 구간", detectorField: "confirmation.confirmationWindow", mutationEligible: true, explanationLabel: "확인 허용 구간" }),
  field("invalidationMode", "enum", { allowedEnumValues: ["close_beyond_zone", "none"], min: null, default: "close_beyond_zone", max: null, step: null, labelKo: "무효화 방식", detectorField: "invalidation.rule", mutationEligible: true, explanationLabel: "패턴 무효화 기준" }),
  field("touchBasis", "enum", { allowedEnumValues: ["WICK", "BODY", "CLOSE", "ANY"], min: null, default: "WICK", max: null, step: null, labelKo: "접촉 기준", detectorField: "entry.touchBasis", mutationEligible: true, explanationLabel: "꼬리/몸통/종가 접촉" }),
  field("revalidateAtEntry", "bool", { min: false, default: true, max: true, step: null, labelKo: "진입 시 영역 재확인", detectorField: "entry.revalidateAtEntry", mutationEligible: true, explanationLabel: "실행 시 공간 검증" }),
  field("maxBarsAfterTouch", "int", { min: 1, default: 8, max: 48, step: 1, labelKo: "접촉 후 최대 봉", detectorField: "entry.maxBarsAfterTouch", mutationEligible: true, explanationLabel: "되돌림 유효기간" }),
  field("maxBarsAfterConfirmation", "int", { min: 0, default: 1, max: 8, step: 1, labelKo: "확인 후 최대 봉", detectorField: "entry.maxBarsAfterConfirmation", mutationEligible: true, explanationLabel: "확인 유효기간" }),
  field("entryExecution", "enum", { allowedEnumValues: ["CONFIRMATION_CLOSE", "NEXT_BAR_OPEN", "TOUCH_PRICE", "LIMIT_AT_ZONE_LEVEL"], min: null, default: "CONFIRMATION_CLOSE", max: null, step: null, labelKo: "진입 체결 방식", detectorField: "entry.entryExecution", mutationEligible: true, explanationLabel: "진입 가격 규칙" }),
  field("entryPriceTolerancePct", "float", { min: 0, default: 0.5, max: 5, step: 0.1, labelKo: "진입 허용(존높이 배수)", detectorField: "entry.entryPriceTolerancePct", mutationEligible: true, explanationLabel: "영역 밖 허용 거리" }),
  field("stopAtrMult", "float", { min: 0.5, default: 1.2, max: 3, step: 0.1, labelKo: "손절 ATR 배수", detectorField: "stop_loss.atrMult", mutationEligible: true, explanationLabel: "손절 거리" }),
  field("tpAtrMult", "float", { min: 0.75, default: 2, max: 6, step: 0.25, labelKo: "익절 ATR 배수", detectorField: "take_profit.atrMult", mutationEligible: true, explanationLabel: "목표 거리" }),
  field("maxHoldBars", "int", { min: 6, default: 48, max: 192, step: 6, labelKo: "최대 보유 봉", detectorField: "max_hold_exit.maxHoldBars", mutationEligible: true, explanationLabel: "보유 만료" }),
  field("zoneLookback", "int", { min: 10, default: 40, max: 160, step: 5, labelKo: "패턴 탐색 구간", detectorField: "pattern_creation.maxAgeBars", mutationEligible: true, explanationLabel: "패턴 유효 기간" }),
];

const OB: readonly PatternParameterCatalogEntry[] = [
  ...COMMON,
  field("zoneBasis", "enum", { allowedEnumValues: ["BODY", "FULL_CANDLE", "BODY_PLUS_WICK_PERCENT"], min: null, default: "BODY", max: null, step: null, labelKo: "존 경계", detectorField: "orderBlock.zoneBasis", mutationEligible: true, explanationLabel: "Order Block 존 기준" }),
  field("wickExtensionPct", "float", { min: 0, default: 25, max: 100, step: 5, labelKo: "꼬리 확장 %", detectorField: "orderBlock.wickExtensionPct", mutationEligible: true, explanationLabel: "몸통+꼬리 % 확장" }),
  field("institutionalQuality", "bool", { min: false, default: true, max: true, step: null, labelKo: "기관형 품질 필터", detectorField: "orderBlock.institutionalQuality", mutationEligible: true, explanationLabel: "장악·몸통 품질 적용" }),
  field("requireBodyEngulf", "bool", { min: false, default: true, max: true, step: null, labelKo: "몸통 장악 필수", detectorField: "orderBlock.requireBodyEngulf", mutationEligible: true, explanationLabel: "충격 종가 장악" }),
  field("minBodyEngulfPct", "float", { min: 0, default: 0, max: 200, step: 5, labelKo: "최소 장악률 %", detectorField: "orderBlock.minBodyEngulfPct", mutationEligible: true, explanationLabel: "장악 여유" }),
  field("minDisplacementBodyMult", "float", { min: 1, default: 2, max: 10, step: 0.25, labelKo: "충격/기준 몸통 배율", detectorField: "orderBlock.minDisplacementBodyMult", mutationEligible: true, explanationLabel: "몸통 배율" }),
  field("minSourceBodyPct", "float", { min: 0, default: 0.05, max: 2, step: 0.01, labelKo: "최소 기준 몸통 %", detectorField: "orderBlock.minSourceBodyPct", mutationEligible: true, explanationLabel: "기준 몸통 비율" }),
  field("minSourceBodyAtrMult", "float", { min: 0, default: 0.15, max: 3, step: 0.05, labelKo: "최소 기준 몸통 ATR", detectorField: "orderBlock.minSourceBodyAtrMult", mutationEligible: true, explanationLabel: "기준 ATR" }),
  field("minSourceBodyRangeRatio", "float", { min: 0, default: 0.35, max: 1, step: 0.05, labelKo: "기준 몸통/전체 비율", detectorField: "orderBlock.minSourceBodyRangeRatio", mutationEligible: true, explanationLabel: "기준 품질" }),
  field("maxSourceUpperWickPct", "float", { min: 0, default: 60, max: 100, step: 5, labelKo: "기준 위꼬리 상한 %", detectorField: "orderBlock.maxSourceUpperWickPct", mutationEligible: true, explanationLabel: "위꼬리" }),
  field("maxSourceLowerWickPct", "float", { min: 0, default: 60, max: 100, step: 5, labelKo: "기준 아래꼬리 상한 %", detectorField: "orderBlock.maxSourceLowerWickPct", mutationEligible: true, explanationLabel: "아래꼬리" }),
  field("minImpulseBodyRangeRatio", "float", { min: 0, default: 0.45, max: 1, step: 0.05, labelKo: "충격 몸통/전체 비율", detectorField: "orderBlock.minImpulseBodyRangeRatio", mutationEligible: true, explanationLabel: "충격 품질" }),
  field("minZoneHeightPct", "float", { min: 0, default: 0.08, max: 2, step: 0.01, labelKo: "최소 존 높이 %", detectorField: "orderBlock.minZoneHeightPct", mutationEligible: true, explanationLabel: "존 최소 크기" }),
  field("minZoneHeightAtrMult", "float", { min: 0, default: 0.2, max: 3, step: 0.05, labelKo: "최소 존 높이 ATR", detectorField: "orderBlock.minZoneHeightAtrMult", mutationEligible: true, explanationLabel: "존 ATR 하한" }),
  field("maxZoneHeightAtrMult", "float", { min: 1, default: 8, max: 20, step: 0.5, labelKo: "최대 존 높이 ATR", detectorField: "orderBlock.maxZoneHeightAtrMult", mutationEligible: true, explanationLabel: "존 ATR 상한" }),
  field("requireStructureBreak", "bool", { min: false, default: false, max: true, step: null, labelKo: "구조 돌파 필수", detectorField: "orderBlock.requireStructureBreak", mutationEligible: true, explanationLabel: "스윙 돌파" }),
  field("structureBreakLookback", "int", { min: 2, default: 20, max: 80, step: 1, labelKo: "구조 돌파 구간", detectorField: "orderBlock.structureBreakLookback", mutationEligible: true, explanationLabel: "스윙 룩백" }),
  field("minImpulseAtrMult", "float", { min: 0.2, default: 0.8, max: 3, step: 0.1, labelKo: "최소 충격 ATR", detectorField: "orderBlock.minImpulseAtrMult", mutationEligible: true, explanationLabel: "생성 충격 강도" }),
  field("minImpulsePct", "float", { min: 0.05, default: 0.25, max: 2, step: 0.05, labelKo: "최소 충격 비율", detectorField: "orderBlock.minImpulsePct", mutationEligible: true, explanationLabel: "생성 변동률" }),
  field("minVolumeMult", "float", { min: 0, default: 0.5, max: 3, step: 0.1, labelKo: "최소 거래량 배수", detectorField: "orderBlock.minVolumeMult", mutationEligible: true, explanationLabel: "생성 거래량" }),
  field("mitigationPct", "float", { min: 1, default: 50, max: 100, step: 5, labelKo: "완화 비율", detectorField: "orderBlock.mitigationPct", mutationEligible: true, explanationLabel: "존 소진 기준" }),
  field("firstTouchOnly", "bool", { min: false, default: false, max: true, step: null, labelKo: "첫 접촉만", detectorField: "orderBlock.firstTouchOnly", mutationEligible: true, explanationLabel: "재접촉 제한" }),
  field("retestAllowed", "bool", { min: false, default: true, max: true, step: null, labelKo: "재시험 허용", detectorField: "orderBlock.retestAllowed", mutationEligible: true, explanationLabel: "반복 접촉 허용" }),
  field("entryInsideBlock", "bool", { min: false, default: false, max: true, step: null, labelKo: "블록 내부 종가", detectorField: "orderBlock.entryInsideBlock", mutationEligible: true, explanationLabel: "진입 위치" }),
  field("invalidateOnCloseBeyond", "bool", { min: false, default: true, max: true, step: null, labelKo: "종가 이탈 무효", detectorField: "orderBlock.invalidateOnCloseBeyond", mutationEligible: true, explanationLabel: "무효화 기준" }),
];

const FVG: readonly PatternParameterCatalogEntry[] = [
  ...COMMON,
  field("minGapAbs", "float", { min: 0, default: 0, max: 1000, step: 1, labelKo: "최소 갭 절대값", detectorField: "fvg.minGapAbs", mutationEligible: false, explanationLabel: "절대 갭 크기" }),
  field("minGapPct", "float", { min: 0.01, default: 0.08, max: 1, step: 0.01, labelKo: "최소 갭 비율", detectorField: "fvg.minGapPct", mutationEligible: true, explanationLabel: "갭 생성 크기" }),
  field("atrRelativeMult", "float", { min: 0.05, default: 0.2, max: 1.5, step: 0.05, labelKo: "갭 ATR 배수", detectorField: "fvg.atrRelativeMult", mutationEligible: true, explanationLabel: "변동성 대비 갭" }),
  field("partialFillPct", "float", { min: 1, default: 45, max: 100, step: 5, labelKo: "부분 채움 비율", detectorField: "fvg.partialFillPct", mutationEligible: true, explanationLabel: "재진입 채움 기준" }),
  field("fullFillInvalidates", "bool", { min: false, default: true, max: true, step: null, labelKo: "완전 채움 무효", detectorField: "fvg.fullFillInvalidates", mutationEligible: true, explanationLabel: "갭 소진 기준" }),
  field("firstTouchOnly", "bool", { min: false, default: false, max: true, step: null, labelKo: "첫 접촉만", detectorField: "fvg.firstTouchOnly", mutationEligible: true, explanationLabel: "재접촉 제한" }),
  field("entryInsideGap", "bool", { min: false, default: false, max: true, step: null, labelKo: "갭 내부 종가", detectorField: "fvg.entryInsideGap", mutationEligible: true, explanationLabel: "진입 위치" }),
  field("invalidateOnCloseThrough", "bool", { min: false, default: true, max: true, step: null, labelKo: "종가 관통 무효", detectorField: "fvg.invalidateOnCloseThrough", mutationEligible: true, explanationLabel: "무효화 기준" }),
];

const TL: readonly PatternParameterCatalogEntry[] = [
  ...COMMON,
  field("minPivotCount", "int", { min: 2, default: 2, max: 6, step: 1, labelKo: "최소 피벗 수", detectorField: "trendLine.minPivotCount", mutationEligible: true, explanationLabel: "라인 생성 피벗" }),
  field("minTouchCount", "int", { min: 2, default: 2, max: 8, step: 1, labelKo: "최소 접촉 수", detectorField: "trendLine.minTouchCount", mutationEligible: true, explanationLabel: "라인 검증 접촉" }),
  field("slopeMin", "float", { min: 0, default: 0, max: 1, step: 0.05, labelKo: "최소 기울기", detectorField: "trendLine.slopeMin", mutationEligible: true, explanationLabel: "라인 기울기 하한" }),
  field("slopeMax", "float", { min: 0.25, default: 2, max: 10, step: 0.25, labelKo: "최대 기울기", detectorField: "trendLine.slopeMax", mutationEligible: true, explanationLabel: "라인 기울기 상한" }),
  field("tolerancePct", "float", { min: 0.05, default: 0.35, max: 2, step: 0.05, labelKo: "접촉 허용 오차", detectorField: "trendLine.tolerancePct", mutationEligible: true, explanationLabel: "라인 접촉 폭" }),
  field("breakoutByClose", "bool", { min: false, default: false, max: true, step: null, labelKo: "종가 돌파", detectorField: "trendLine.breakoutByClose", mutationEligible: true, explanationLabel: "돌파 판정" }),
  field("breakoutByWick", "bool", { min: false, default: false, max: true, step: null, labelKo: "꼬리 돌파", detectorField: "trendLine.breakoutByWick", mutationEligible: true, explanationLabel: "꼬리 돌파 판정" }),
  field("retestRequired", "bool", { min: false, default: false, max: true, step: null, labelKo: "돌파 재시험 필수", detectorField: "trendLine.retestRequired", mutationEligible: true, explanationLabel: "돌파 후 재접촉" }),
  field("detectorConfirmationCandles", "int", { min: 0, default: 0, max: 8, step: 1, labelKo: "라인 확인 봉", detectorField: "trendLine.confirmationCandles", mutationEligible: true, explanationLabel: "라인 성숙 기간" }),
];

const SR: readonly PatternParameterCatalogEntry[] = [
  ...COMMON,
  field("minTouches", "int", { min: 2, default: 2, max: 10, step: 1, labelKo: "최소 접촉 수", detectorField: "supportResistance.minTouches", mutationEligible: true, explanationLabel: "존 검증 접촉" }),
  field("tolerancePct", "float", { min: 0.05, default: 0.35, max: 2, step: 0.05, labelKo: "접촉 허용 오차", detectorField: "supportResistance.tolerancePct", mutationEligible: true, explanationLabel: "존 접촉 폭" }),
  field("zoneWidthPct", "float", { min: 0.05, default: 0.25, max: 2, step: 0.05, labelKo: "존 너비", detectorField: "supportResistance.zoneWidthPct", mutationEligible: true, explanationLabel: "지지저항 폭" }),
  field("volumeConfirmation", "bool", { min: false, default: false, max: true, step: null, labelKo: "거래량 확인", detectorField: "supportResistance.volumeConfirmation", mutationEligible: true, explanationLabel: "접촉 거래량" }),
  field("breakoutConfirmation", "bool", { min: false, default: false, max: true, step: null, labelKo: "돌파 확인", detectorField: "supportResistance.breakoutConfirmation", mutationEligible: true, explanationLabel: "종가 돌파 기준" }),
];

const SD: readonly PatternParameterCatalogEntry[] = [
  ...COMMON,
  field("baseCandleCount", "int", { min: 1, default: 2, max: 6, step: 1, labelKo: "베이스 봉 수", detectorField: "supplyDemand.baseCandleCount", mutationEligible: true, explanationLabel: "존 생성 베이스" }),
  field("maxBaseRangeAtrMult", "float", { min: 0.2, default: 1, max: 3, step: 0.1, labelKo: "베이스 최대 ATR", detectorField: "supplyDemand.maxBaseRangeAtrMult", mutationEligible: true, explanationLabel: "베이스 압축도" }),
  field("minDepartureAtrMult", "float", { min: 0.2, default: 1, max: 4, step: 0.1, labelKo: "이탈 최소 ATR", detectorField: "supplyDemand.minDepartureAtrMult", mutationEligible: true, explanationLabel: "이탈 충격 강도" }),
  field("minDeparturePct", "float", { min: 0.05, default: 0.3, max: 3, step: 0.05, labelKo: "이탈 최소 비율", detectorField: "supplyDemand.minDeparturePct", mutationEligible: true, explanationLabel: "이탈 변동률" }),
  field("zoneBodyOnly", "bool", { min: false, default: false, max: true, step: null, labelKo: "몸통 존", detectorField: "supplyDemand.zoneBodyOnly", mutationEligible: true, explanationLabel: "존 경계 기준" }),
  field("firstTouchOnly", "bool", { min: false, default: true, max: true, step: null, labelKo: "첫 접촉만", detectorField: "supplyDemand.firstTouchOnly", mutationEligible: true, explanationLabel: "재접촉 제한" }),
  field("requireRejectionClose", "bool", { min: false, default: false, max: true, step: null, labelKo: "거절 종가 필수", detectorField: "supplyDemand.requireRejectionClose", mutationEligible: true, explanationLabel: "재진입 확인" }),
  field("invalidateOnCloseBeyond", "bool", { min: false, default: true, max: true, step: null, labelKo: "종가 이탈 무효", detectorField: "supplyDemand.invalidateOnCloseBeyond", mutationEligible: true, explanationLabel: "무효화 기준" }),
];

export const PATTERN_PARAMETER_CATALOG: Readonly<
  Record<PatternSearchFamilyId, readonly PatternParameterCatalogEntry[]>
> = {
  order_block: OB,
  fvg: FVG,
  trendline: TL,
  support_resistance: SR,
  supply_demand: SD,
};

export function catalogForPatternFamily(
  family: PatternSearchFamilyId,
): readonly PatternParameterCatalogEntry[] {
  return PATTERN_PARAMETER_CATALOG[family];
}

export function catalogDefaultsForPatternFamily(
  family: PatternSearchFamilyId,
): Record<string, PatternParameterValue> {
  return Object.fromEntries(
    catalogForPatternFamily(family).map((entry) => [entry.key, entry.default]),
  );
}

export function catalogRangesForPatternFamily(
  family: PatternSearchFamilyId,
): StrategySearchParameterRange[] {
  return catalogForPatternFamily(family)
    .filter((entry) => entry.mutationEligible)
    .map((entry) => ({
      key: entry.key,
      min: entry.min,
      max: entry.max,
      step: entry.step,
      valueType:
        entry.type === "int"
          ? "integer"
          : entry.type === "bool"
            ? "boolean"
            : entry.type,
      ...(entry.allowedEnumValues
        ? { enumValues: [...entry.allowedEnumValues] }
        : {}),
      defaultValue: entry.default,
    }));
}
