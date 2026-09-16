import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { displaySettingsFieldLabel } from "../src/lib/rextora/displayLabels";
import {
  SETTINGS_COST_FIELD_KEYS,
  SETTINGS_COST_FIELD_UNITS,
  settingsCostDisplayUnit,
  settingsCostSummaryFacts,
} from "../src/lib/rextora/settings/settingsDataPresentation";

const KOREAN_COST_LABELS: Record<(typeof SETTINGS_COST_FIELD_KEYS)[number], string> = {
  makerFeePct: "지정가 수수료",
  takerFeePct: "시장가 수수료",
  useTakerFeeForMarketOrders: "시장가에 테이커 수수료 적용",
  slippageBasePct: "기본 슬리피지",
  slippageVolatilityMultiplier: "슬리피지 변동성 배수",
  safetyMarginPct: "안전 마진",
  minExpectedEdgePct: "최소 기대 수익",
  includeFundingFee: "펀딩 비용 포함",
  maxFundingFeePct: "최대 펀딩 비용",
  maxSpreadPct: "최대 스프레드",
};

describe("Settings Cost presentation", () => {
  it("uses Korean-first labels for all cost fields", () => {
    for (const key of SETTINGS_COST_FIELD_KEYS) {
      const label = displaySettingsFieldLabel(key);
      expect(label).toBe(KOREAN_COST_LABELS[key]);
      expect(label).not.toMatch(/[A-Z][a-z]+ [A-Z]/);
    }
  });

  it("maps display units without converting stored numbers", () => {
    expect(settingsCostDisplayUnit("makerFeePct")).toBe("%");
    expect(settingsCostDisplayUnit("takerFeePct")).toBe("%");
    expect(settingsCostDisplayUnit("slippageBasePct")).toBe("%");
    expect(settingsCostDisplayUnit("safetyMarginPct")).toBe("%");
    expect(settingsCostDisplayUnit("minExpectedEdgePct")).toBe("%");
    expect(settingsCostDisplayUnit("maxFundingFeePct")).toBe("%");
    expect(settingsCostDisplayUnit("maxSpreadPct")).toBe("%");
    expect(settingsCostDisplayUnit("slippageVolatilityMultiplier")).toBe("배수");
    expect(settingsCostDisplayUnit("useTakerFeeForMarketOrders")).toBeNull();
    expect(settingsCostDisplayUnit("includeFundingFee")).toBeNull();
    expect(Object.keys(SETTINGS_COST_FIELD_UNITS)).toHaveLength(SETTINGS_COST_FIELD_KEYS.length);
  });

  it("summarizes existing cost flags without inventing models", () => {
    expect(settingsCostSummaryFacts({ useTakerFeeForMarketOrders: true, includeFundingFee: true })).toEqual([
      { label: "적용 기준", value: "시스템 설정값" },
      { label: "입력 방식", value: "직접 설정 · 저장 가능" },
      { label: "시장가 주문", value: "테이커 수수료 적용" },
      { label: "펀딩 비용", value: "포함" },
    ]);
    expect(settingsCostSummaryFacts({ useTakerFeeForMarketOrders: false, includeFundingFee: false })).toEqual([
      { label: "적용 기준", value: "시스템 설정값" },
      { label: "입력 방식", value: "직접 설정 · 저장 가능" },
      { label: "시장가 주문", value: "테이커 수수료 미적용" },
      { label: "펀딩 비용", value: "제외" },
    ]);
  });

  it("keeps the cost disclosure and does not convert numeric inputs", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/settings/SettingsTabs.tsx"),
      "utf8",
    );
    expect(src).toContain("settings-cost-source-keys");
    expect(src).toContain("원본 설정 키");
    expect(src).toContain("costSourceKeys.length > 0");
    expect(src).toContain("settingsCostDisplayUnit");
    expect(src).not.toContain("/ 100");
    expect(src).not.toContain("* 100");
    expect(src).not.toContain("* 10000");
    const keysSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/settings/settingsDataPresentation.ts"),
      "utf8",
    );
    for (const key of SETTINGS_COST_FIELD_KEYS) {
      expect(keysSrc).toContain(`"${key}"`);
    }
  });
});
