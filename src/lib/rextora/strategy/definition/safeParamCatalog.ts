import type { SafeV44Params } from "../strategyTypes";
import { CONTEXT_FALLBACK_PARAMS } from "../safeV44Params";
import fs from "node:fs";
import path from "node:path";

export type ParamConfirmSource = "data_file" | "context_fallback" | "locked_file" | "unconfirmed";

export interface SafeParamCatalogEntry {
  key: keyof SafeV44Params;
  koreanName: string;
  unit: string;
  min: number | boolean | null;
  max: number | boolean | null;
  explanation: string;
  increaseEffect: string;
  decreaseEffect: string;
  /** Confirmed in data/strategies/SAFE_v44_i4060.json params object */
  confirmedInDataFile: boolean;
  sourceLabel: string;
}

/** Keys present in data/strategies/SAFE_v44_i4060.json — confirmed from on-disk snapshot only. */
export const SNAPSHOT_CONFIRMED_KEYS = [
  "ema_fast",
  "ema_mid",
  "ema_slow",
  "rsi_period",
  "atr_period",
  "sl_atr_mult",
  "tp_atr_mult",
  "max_hold_bars",
  "use_trailing",
  "use_dynamic_leverage",
  "lev_min",
  "lev_base",
  "lev_max"
] as const satisfies ReadonlyArray<keyof SafeV44Params>;

const LABELS: Record<keyof SafeV44Params, Omit<SafeParamCatalogEntry, "key" | "confirmedInDataFile" | "sourceLabel">> = {
  ema_fast: { koreanName: "빠른 이동평균 기간", unit: "봉", min: 2, max: 100, explanation: "단기 추세를 보는 이동평균 길이입니다.", increaseEffect: "신호가 둔해지고 노이즈가 줄어듭니다.", decreaseEffect: "반응이 빨라지고 신호가 잦아집니다." },
  ema_mid: { koreanName: "중간 이동평균 기간", unit: "봉", min: 5, max: 200, explanation: "중기 추세 기준선입니다.", increaseEffect: "추세 판단이 더 느려집니다.", decreaseEffect: "추세 전환을 더 빨리 봅니다." },
  ema_slow: { koreanName: "느린 이동평균 기간", unit: "봉", min: 20, max: 400, explanation: "장기 추세 기준선입니다.", increaseEffect: "큰 추세만 따릅니다.", decreaseEffect: "장기 추세 민감도가 올라갑니다." },
  rsi_period: { koreanName: "RSI 기간", unit: "봉", min: 2, max: 50, explanation: "과매수·과매도 측정 구간입니다.", increaseEffect: "RSI가 완만해집니다.", decreaseEffect: "RSI가 민감해집니다." },
  atr_period: { koreanName: "ATR 기간", unit: "봉", min: 2, max: 50, explanation: "변동성(ATR) 계산 기간입니다.", increaseEffect: "변동성 추정이 평활해집니다.", decreaseEffect: "최근 변동성에 더 민감합니다." },
  vol_lookback: { koreanName: "거래량 비교 구간", unit: "봉", min: 1, max: 50, explanation: "평균 거래량 대비 비율을 볼 때 사용합니다.", increaseEffect: "평균이 안정됩니다.", decreaseEffect: "최근 거래량에 민감합니다." },
  res_lookback: { koreanName: "저항 탐색 구간", unit: "봉", min: 5, max: 100, explanation: "최근 고점(저항)을 찾는 구간입니다.", increaseEffect: "더 먼 고점을 봅니다.", decreaseEffect: "가까운 고점만 봅니다." },
  slope_lookback: { koreanName: "기울기 계산 구간", unit: "봉", min: 5, max: 100, explanation: "추세 기울기를 계산하는 길이입니다.", increaseEffect: "기울기가 완만해집니다.", decreaseEffect: "기울기 변화가 커집니다." },
  slope_min: { koreanName: "최소 추세 기울기", unit: "비율", min: 0, max: 0.01, explanation: "롱 진입에 필요한 최소 상승 기울기입니다.", increaseEffect: "더 강한 상승만 허용합니다.", decreaseEffect: "약한 상승도 허용합니다." },
  pullback_max_dist: { koreanName: "최대 되돌림 거리", unit: "비율", min: 0, max: 0.2, explanation: "이동평균 대비 허용 되돌림입니다.", increaseEffect: "깊은 되돌림도 허용합니다.", decreaseEffect: "얕은 되돌림만 허용합니다." },
  vol_ratio_min: { koreanName: "최소 거래량 비율", unit: "배", min: 0, max: 5, explanation: "평균 대비 최소 거래량 배수입니다.", increaseEffect: "거래량이 많을 때만 진입합니다.", decreaseEffect: "거래량 조건이 느슨해집니다." },
  max_atr_pct: { koreanName: "최대 ATR 비율", unit: "비율", min: 0, max: 0.1, explanation: "변동성이 이 값을 넘으면 진입을 제한합니다.", increaseEffect: "더 큰 변동성도 허용합니다.", decreaseEffect: "변동성 제한이 빡빡해집니다." },
  min_room_to_resist: { koreanName: "저항까지 최소 여유", unit: "비율", min: 0, max: 0.1, explanation: "저항까지 남은 공간이 부족하면 롱을 제한합니다.", increaseEffect: "더 먼 저항이 필요합니다.", decreaseEffect: "저항 가까이에서도 허용합니다." },
  confirm_bull: { koreanName: "롱 추가 확인", unit: "여부", min: false, max: true, explanation: "롱에 추가 확인 캔들을 요구할지 여부입니다.", increaseEffect: "켜면 진입이 보수적입니다.", decreaseEffect: "끄면 진입이 빨라집니다." },
  rsi_max_long: { koreanName: "롱 최대 RSI", unit: "점수", min: 50, max: 100, explanation: "이 값보다 RSI가 높으면 롱을 제한합니다.", increaseEffect: "과열 구간에서도 롱 가능.", decreaseEffect: "과열이면 롱을 막습니다." },
  break_lookback: { koreanName: "돌파 탐색 구간", unit: "봉", min: 2, max: 50, explanation: "돌파 기준 고저점 구간입니다.", increaseEffect: "더 넓은 돌파를 봅니다.", decreaseEffect: "최근 구간 돌파만 봅니다." },
  break_margin: { koreanName: "돌파 여유", unit: "비율", min: 0, max: 0.01, explanation: "돌파로 인정하는 최소 여유입니다.", increaseEffect: "확실한 돌파만 인정.", decreaseEffect: "약한 돌파도 인정." },
  vol_ratio_min_break: { koreanName: "돌파 최소 거래량 비율", unit: "배", min: 0, max: 5, explanation: "돌파 시 필요한 거래량 배수입니다.", increaseEffect: "강한 거래량 돌파만.", decreaseEffect: "거래량 조건 완화." },
  max_atr_pct_break: { koreanName: "돌파 최대 ATR 비율", unit: "비율", min: 0, max: 0.1, explanation: "돌파 국면 허용 변동성 상한입니다.", increaseEffect: "변동성 허용 확대.", decreaseEffect: "변동성 허용 축소." },
  confirm_bear: { koreanName: "숏 허용", unit: "여부", min: false, max: true, explanation: "숏 진입을 허용할지 여부입니다.", increaseEffect: "켜면 숏 가능.", decreaseEffect: "끄면 숏 비활성." },
  rsi_min_short: { koreanName: "숏 최소 RSI", unit: "점수", min: 0, max: 50, explanation: "이 값보다 RSI가 낮을 때만 숏을 제한하는 기준입니다.", increaseEffect: "더 높은 RSI에서도 숏 가능.", decreaseEffect: "더 과매도일 때만 숏." },
  sl_atr_mult: { koreanName: "손절 ATR 배수", unit: "배", min: 0.1, max: 10, explanation: "손절 거리를 ATR 배수로 정합니다.", increaseEffect: "손절이 멀어져 여유가 생깁니다.", decreaseEffect: "손절이 가까워집니다." },
  tp_atr_mult: { koreanName: "익절 ATR 배수", unit: "배", min: 0.1, max: 20, explanation: "익절 목표를 ATR 배수로 정합니다.", increaseEffect: "목표가 멀어집니다.", decreaseEffect: "목표가 가까워집니다." },
  cooldown_bars: { koreanName: "재진입 대기 봉수", unit: "봉", min: 0, max: 50, explanation: "청산 후 다시 들어가기 전 대기입니다.", increaseEffect: "거래 빈도가 줄어듭니다.", decreaseEffect: "더 빨리 재진입합니다." },
  allow_in_range: { koreanName: "횡보장 진입 허용", unit: "여부", min: false, max: true, explanation: "횡보 구간 진입 허용 여부입니다.", increaseEffect: "켜면 횡보도 거래.", decreaseEffect: "끄면 추세 위주." },
  range_vol_ratio_min: { koreanName: "횡보 최소 거래량 비율", unit: "배", min: 0, max: 5, explanation: "횡보 진입 시 거래량 조건입니다.", increaseEffect: "조건 강화.", decreaseEffect: "조건 완화." },
  max_hold_bars: { koreanName: "최대 보유 봉수", unit: "봉", min: 1, max: 500, explanation: "포지션을 들고 있을 수 있는 최대 봉 수입니다.", increaseEffect: "더 오래 보유.", decreaseEffect: "빨리 강제 청산." },
  use_trailing: { koreanName: "트레일링 손절 사용", unit: "여부", min: false, max: true, explanation: "이익 구간에서 손절을 따라올지 여부입니다.", increaseEffect: "켜면 이익 보호.", decreaseEffect: "끄면 고정 손절만." },
  trail_atr_mult: { koreanName: "트레일링 ATR 배수", unit: "배", min: 0.1, max: 20, explanation: "트레일링 손절 거리입니다.", increaseEffect: "여유 있는 트레일.", decreaseEffect: "타이트한 트레일." },
  use_vol_target: { koreanName: "변동성 목표 비중", unit: "여부", min: false, max: true, explanation: "변동성에 따라 비중을 조절합니다.", increaseEffect: "켜면 변동성 조절 활성.", decreaseEffect: "고정 비중에 가깝게." },
  target_atr_pct: { koreanName: "목표 ATR 비율", unit: "비율", min: 0.001, max: 0.1, explanation: "목표로 하는 포지션 변동성입니다.", increaseEffect: "비중 확대 여지.", decreaseEffect: "비중 축소." },
  size_min: { koreanName: "최소 비중 배수", unit: "배", min: 0.1, max: 2, explanation: "포지션 크기 하한입니다.", increaseEffect: "최소 진입이 커집니다.", decreaseEffect: "더 작게 진입 가능." },
  size_max: { koreanName: "최대 비중 배수", unit: "배", min: 0.5, max: 5, explanation: "포지션 크기 상한입니다.", increaseEffect: "더 큰 진입 허용.", decreaseEffect: "진입 상한 축소." },
  use_dynamic_leverage: { koreanName: "동적 레버리지", unit: "여부", min: false, max: true, explanation: "시장 상태에 따라 레버리지를 조절합니다.", increaseEffect: "켜면 레버리지 가변.", decreaseEffect: "고정 레버리지에 가깝게." },
  lev_min: { koreanName: "최소 레버리지", unit: "배", min: 1, max: 10, explanation: "사용할 수 있는 최소 레버리지입니다.", increaseEffect: "바닥 레버리지 상승.", decreaseEffect: "더 낮은 레버리지 허용." },
  lev_base: { koreanName: "기본 레버리지", unit: "배", min: 1, max: 20, explanation: "기본으로 쓰는 레버리지입니다.", increaseEffect: "위험이 커집니다.", decreaseEffect: "위험이 줄어듭니다." },
  lev_max: { koreanName: "최대 레버리지", unit: "배", min: 1, max: 25, explanation: "허용 최대 레버리지입니다.", increaseEffect: "상한 상승.", decreaseEffect: "상한 하락." },
  lev_atr_ok_max: { koreanName: "레버리지 유지 ATR 상한", unit: "비율", min: 0, max: 0.05, explanation: "이 변동성 이하면 레버리지 유지·상향 가능.", increaseEffect: "더 큰 변동성에도 유지.", decreaseEffect: "빨리 레버리지 축소." },
  lev_atr_too_high: { koreanName: "레버리지 축소 ATR", unit: "비율", min: 0, max: 0.1, explanation: "이 변동성 이상이면 레버리지를 줄입니다.", increaseEffect: "축소 기준이 느슨.", decreaseEffect: "빨리 축소." },
  lev_down_on_dd: { koreanName: "낙폭 시 레버리지 하향 기준", unit: "비율", min: -1, max: 0, explanation: "계좌 낙폭이 이 값 이하면 레버리지 하향.", increaseEffect: "(덜 음수) 하향이 늦음.", decreaseEffect: "(더 음수) 빨리 하향." },
  lev_up_on_dd: { koreanName: "낙폭 회복 시 레버리지 상향 기준", unit: "비율", min: -1, max: 0, explanation: "낙폭이 이 값보다 가벼우면 상향 가능.", increaseEffect: "상향이 쉬워짐.", decreaseEffect: "상향이 어려워짐." },
  risk_mult_cap: { koreanName: "위험 배수 상한", unit: "배", min: 0.5, max: 5, explanation: "포지션 위험 배수의 상한입니다.", increaseEffect: "더 공격적 가능.", decreaseEffect: "보수적 상한." },
  range_risk_mult: { koreanName: "횡보 위험 배수", unit: "배", min: 0.1, max: 2, explanation: "횡보 구간 위험 축소 배수입니다.", increaseEffect: "횡보에서도 비중 확대.", decreaseEffect: "횡보 비중 축소." },
  mark_to_market: { koreanName: "평가손익 반영", unit: "여부", min: false, max: true, explanation: "미실현 손익을 위험 계산에 반영할지 여부입니다.", increaseEffect: "켜면 평가손익 반영.", decreaseEffect: "끄면 실현 위주." },
  base_bal_pct: { koreanName: "진입 금액 비율", unit: "비율", min: 0.001, max: 0.2, explanation: "계좌 대비 진입에 쓰는 기본 비율입니다.", increaseEffect: "포지션이 커집니다.", decreaseEffect: "포지션이 작아집니다." },
  cost_guard: { koreanName: "거래 비용 가드", unit: "여부", min: false, max: true, explanation: "예상 수익이 비용보다 충분히 클 때만 진입합니다.", increaseEffect: "켜면 비용 검증 활성.", decreaseEffect: "끄면 비용 검증 생략." },
  cost_guard_k: { koreanName: "거래 비용 제한 배수", unit: "배", min: 1, max: 10, explanation: "예상 수익 ≥ 총비용 × 이 배수여야 통과합니다.", increaseEffect: "더 엄격한 비용 검증.", decreaseEffect: "느슨한 비용 검증." }
};

let cachedSnapshotKeys: Set<string> | null = null;

export function loadSnapshotConfirmedKeys(): Set<string> {
  if (cachedSnapshotKeys) return cachedSnapshotKeys;
  const keys = new Set<string>(SNAPSHOT_CONFIRMED_KEYS);
  try {
    const p = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "strategies", "SAFE_v44_i4060.json");
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, "utf8")) as { params?: Record<string, unknown> };
      for (const k of Object.keys(raw.params ?? {})) keys.add(k);
    }
  } catch {
    /* keep static list */
  }
  cachedSnapshotKeys = keys;
  return keys;
}

export function getSafeParamCatalog(): SafeParamCatalogEntry[] {
  const confirmed = loadSnapshotConfirmedKeys();
  const lockedExists = fs.existsSync(path.join(/* turbopackIgnore: true */ process.cwd(), "research", "results", "v44", "locked_final_i4060.json"));
  return (Object.keys(CONTEXT_FALLBACK_PARAMS) as Array<keyof SafeV44Params>).map((key) => {
    const base = LABELS[key];
    const inData = confirmed.has(key);
    return {
      key,
      ...base,
      confirmedInDataFile: inData,
      sourceLabel: lockedExists && inData ? "locked_file" : inData ? "data/strategies/SAFE_v44_i4060.json" : "원본에서 확인되지 않음"
    };
  });
}

export function getParamConfirmSource(key: keyof SafeV44Params): ParamConfirmSource {
  const locked = path.join(/* turbopackIgnore: true */ process.cwd(), "research", "results", "v44", "locked_final_i4060.json");
  if (fs.existsSync(locked)) return "locked_file";
  return loadSnapshotConfirmedKeys().has(key) ? "data_file" : "unconfirmed";
}
