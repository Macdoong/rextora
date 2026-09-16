import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SETTINGS_EXPERT_LEDE,
  SETTINGS_EXPERT_MOUNTED_FIELDS,
  SETTINGS_EXPERT_STORAGE_KEY,
  SETTINGS_EXPERT_STORAGE_OFF,
  SETTINGS_EXPERT_STORAGE_ON,
  SETTINGS_EXPERT_TECHNICAL_KEYS,
  SETTINGS_EXPERT_UNMOUNTED_FIELDS,
  SETTINGS_EXPERT_WIZARD_HREF,
  settingsExpertBacktestStatus,
  settingsExpertBuilderStatus,
  settingsExpertGateLabel,
  settingsExpertGateTone,
  settingsExpertTechnicalKeyLabel,
  settingsExpertToggleLabel,
} from "../src/lib/rextora/settings/settingsExpertModePresentation";

describe("Settings Expert Mode presentation", () => {
  it("keeps the existing localStorage gate and does not add Live shortcuts", () => {
    expect(SETTINGS_EXPERT_STORAGE_KEY).toBe("rextora.expertMode");
    expect(SETTINGS_EXPERT_STORAGE_ON).toBe("1");
    expect(SETTINGS_EXPERT_STORAGE_OFF).toBe("0");
    expect(SETTINGS_EXPERT_WIZARD_HREF).toBe("/strategies?expert=1");
    expect(settingsExpertGateLabel(false)).toBe("꺼짐");
    expect(settingsExpertGateTone(false)).toBeUndefined();
    expect(settingsExpertGateLabel(true)).toBe("켜짐");
    expect(settingsExpertGateTone(true)).toBe("warn");
    expect(settingsExpertToggleLabel(false)).toBe("전문가 모드 켜기");
    expect(SETTINGS_EXPERT_LEDE).toContain("실주문·Live는 켜지지 않습니다");
    expect(SETTINGS_EXPERT_LEDE).not.toContain("Live 사용");
  });

  it("does not surface internal or unused UI flags as expert controls", () => {
    expect(SETTINGS_EXPERT_MOUNTED_FIELDS).toEqual([
      { field: "rextora.expertMode", class: "USER_EXPERT_SETTING", editable: true },
    ]);
    const unmounted = SETTINGS_EXPERT_UNMOUNTED_FIELDS.map((item) => item.field);
    expect(unmounted).toContain("ui.showAdvancedSettings");
    expect(unmounted).toContain("ui.expertMode");
    expect(unmounted).toContain("stopWhenQualifiedTarget");
    expect([...SETTINGS_EXPERT_TECHNICAL_KEYS]).toContain("stopWhenQualifiedTarget");
    expect(settingsExpertTechnicalKeyLabel("stopWhenQualifiedTarget")).toContain(
      "전략 탐색",
    );
    expect(settingsExpertBuilderStatus(false)).toBe("게이트 필요");
    expect(settingsExpertBacktestStatus()).toBe("같은 브라우저 게이트 적용");
  });

  it("keeps the existing toggle and wizard actions without research/Live controls", () => {
    const card = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/settings/ExpertModeCard.tsx"),
      "utf8",
    );
    const view = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/settings/SettingsExpertModeView.tsx"),
      "utf8",
    );
    const shell = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/settings/LifecycleSettingsShell.tsx",
      ),
      "utf8",
    );
    expect(card).toContain("SETTINGS_EXPERT_STORAGE_KEY");
    expect(card).toContain("localStorage");
    expect(view).toContain("expert-mode-toggle");
    expect(view).toContain("expert-wizard-link");
    expect(view).toContain("원본 설정 키");
    expect(view).not.toContain("liveTradingEnabled");
    expect(view).not.toContain("allowLiveTrading");
    expect(view).not.toContain("재시작");
    expect(shell).toContain("<ExpertModeCard />");
    expect(shell).not.toMatch(/expert:[\s\S]*SettingsTabs/);
  });
});
