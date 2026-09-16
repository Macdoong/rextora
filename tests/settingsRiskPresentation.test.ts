import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SETTINGS_RISK_FIELD_KEYS,
  SETTINGS_RISK_FIELD_UNITS,
  SETTINGS_RISK_GROUPS,
  settingsRiskConfiguredFacts,
  settingsRiskDisplayUnit,
  settingsRiskDisplayValue,
  settingsRiskFieldLabel,
} from "../src/lib/rextora/settings/settingsRiskPresentation";

describe("Settings Risk presentation", () => {
  it("uses Korean-first labels for mounted risk fields only", () => {
    expect(settingsRiskFieldLabel("dailyLossLimitPct")).toBe("일일 손실 한도");
    expect(settingsRiskFieldLabel("totalLossLimitPct")).toBe("전체 손실 한도");
    expect(settingsRiskFieldLabel("consecutiveLossLimit")).toBe("연속 손실 한도");
    expect(settingsRiskFieldLabel("maxSimultaneousPositions")).toBe("최대 동시 포지션");
    expect(settingsRiskFieldLabel("maxPositionSizePerCoinPct")).toBe("코인별 진입 한도");
    expect(settingsRiskFieldLabel("maxLeverage")).toBe("최대 레버리지");
    expect(settingsRiskFieldLabel("maxDailyTrades")).toBe("일일 거래 한도");
    expect(settingsRiskFieldLabel("overtradingCooldownMinutes")).toBe("과매매 방지 대기");
    for (const key of SETTINGS_RISK_FIELD_KEYS) {
      expect(settingsRiskFieldLabel(key)).not.toMatch(/[A-Z][a-z]+ [A-Z]/);
    }
    expect([...SETTINGS_RISK_FIELD_KEYS]).not.toContain("maxDailyLossPct");
    expect([...SETTINGS_RISK_FIELD_KEYS]).not.toContain("maxPositionNotionalUsdt");
  });

  it("maps display units without converting stored numbers", () => {
    expect(settingsRiskDisplayUnit("dailyLossLimitPct")).toBe("%");
    expect(settingsRiskDisplayUnit("totalLossLimitPct")).toBe("%");
    expect(settingsRiskDisplayUnit("maxPositionSizePerCoinPct")).toBe("%");
    expect(settingsRiskDisplayUnit("maxLeverage")).toBe("배");
    expect(settingsRiskDisplayUnit("consecutiveLossLimit")).toBe("회");
    expect(settingsRiskDisplayUnit("maxDailyTrades")).toBe("회");
    expect(settingsRiskDisplayUnit("maxSimultaneousPositions")).toBe("개");
    expect(settingsRiskDisplayUnit("overtradingCooldownMinutes")).toBe("분");
    expect(settingsRiskDisplayValue(-5)).toBe("-5");
    expect(settingsRiskDisplayValue(2.5)).toBe("2.5");
    expect(settingsRiskDisplayValue(15)).toBe("15");
    expect(Object.keys(SETTINGS_RISK_FIELD_UNITS)).toHaveLength(
      SETTINGS_RISK_FIELD_KEYS.length,
    );
    expect(SETTINGS_RISK_GROUPS.map((group) => group.id)).toEqual([
      "loss",
      "position",
      "operation",
    ]);
  });

  it("summarizes configured limits from stored settings only", () => {
    const facts = settingsRiskConfiguredFacts({
      dailyLossLimitPct: -5,
      totalLossLimitPct: -10,
      consecutiveLossLimit: 3,
      maxSimultaneousPositions: 3,
      maxPositionSizePerCoinPct: 3,
      maxLeverage: 2.5,
      maxDailyTrades: 20,
      overtradingCooldownMinutes: 15,
    });
    expect(facts).toHaveLength(8);
    expect(facts[0]).toEqual({
      key: "dailyLossLimitPct",
      label: "일일 손실 한도",
      value: "-5",
      unit: "%",
    });
    expect(facts.find((fact) => fact.key === "maxLeverage")).toEqual({
      key: "maxLeverage",
      label: "최대 레버리지",
      value: "2.5",
      unit: "배",
    });
    const src = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/RiskPanelEditable.tsx"),
      "utf8",
    );
    expect(src).toContain("settings-risk-source-keys");
    expect(src).toContain("원본 설정 키");
    expect(src).toContain("risk-settings-save");
    expect(src).toContain("risk-settings-reset");
    const helperSrc = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/settings/settingsRiskPresentation.ts"),
      "utf8",
    );
    expect(helperSrc).not.toContain("/ 100");
    expect(helperSrc).not.toContain("* 100");
  });
});
