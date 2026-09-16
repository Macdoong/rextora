import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { displaySettingsFieldLabel } from "../src/lib/rextora/displayLabels";
import {
  compactSymbolPreview,
  SETTINGS_ALLOWED_SYMBOL_PREVIEW_LIMIT,
  SETTINGS_MARKET_FIELD_KEYS,
} from "../src/lib/rextora/settings/settingsDataPresentation";

const KOREAN_MARKET_LABELS: Record<(typeof SETTINGS_MARKET_FIELD_KEYS)[number], string> = {
  watchedSymbolCount: "감시 종목 수",
  allowedSymbols: "허용 종목",
  excludedSymbols: "제외 종목",
  minQuoteVolume: "최소 거래대금",
  scanIntervalMs: "스캔 간격",
  marketCacheTtlMs: "시장 데이터 캐시 시간",
  staleDataThresholdMs: "데이터 만료 기준",
  maxKlineSymbolsPerScan: "스캔당 최대 캔들 종목 수",
  klineInterval: "캔들 주기",
  candidateRefreshIntervalMs: "후보 갱신 간격",
};

describe("Settings Data presentation", () => {
  it("uses Korean-first labels for market fields", () => {
    for (const key of SETTINGS_MARKET_FIELD_KEYS) {
      const label = displaySettingsFieldLabel(key);
      expect(label).toBe(KOREAN_MARKET_LABELS[key]);
      expect(label).not.toMatch(/[A-Z][a-z]+ [A-Z]/);
    }
  });

  it("shows all symbols when there are 8 or fewer", () => {
    const values = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "AVAXUSDT"];
    const preview = compactSymbolPreview(values, false);
    expect(values).toHaveLength(SETTINGS_ALLOWED_SYMBOL_PREVIEW_LIMIT);
    expect(preview.visible).toEqual(values);
    expect(preview.hiddenCount).toBe(0);
    expect(preview.compact).toBe(false);
  });

  it("compacts more than 8 symbols and reports +N", () => {
    const values = Array.from({ length: 40 }, (_, i) => `SYM${i}USDT`);
    const collapsed = compactSymbolPreview(values, false);
    expect(collapsed.visible).toHaveLength(8);
    expect(collapsed.hiddenCount).toBe(32);
    expect(collapsed.compact).toBe(true);
    expect(`+${collapsed.hiddenCount}개 더 보기`).toBe("+32개 더 보기");

    const expanded = compactSymbolPreview(values, true);
    expect(expanded.visible).toEqual(values);
    expect(expanded.hiddenCount).toBe(0);
    expect(expanded.compact).toBe(true);
  });

  it("compacts only allowedSymbols in the Data settings form", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/settings/SettingsTabs.tsx"),
      "utf8",
    );
    expect(src).toContain('compact={fieldKey === "allowedSymbols"}');
    expect(src).toContain("settings-symbols-expand");
    expect(src).toContain("settings-symbols-collapse");
  });

  it("renames the Data technical disclosure and does not render it empty", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/settings/SettingsTabs.tsx"),
      "utf8",
    );
    expect(src).not.toContain("기술 필드 이름");
    expect(src).not.toContain("기술필드 이름");
    expect(src).toContain("원본 설정 키");
    expect(src).toContain("marketSourceKeys.length > 0");
    const keysSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/settings/settingsDataPresentation.ts"),
      "utf8",
    );
    for (const key of SETTINGS_MARKET_FIELD_KEYS) {
      expect(keysSrc).toContain(`"${key}"`);
    }
  });
});
