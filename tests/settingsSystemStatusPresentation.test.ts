import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SETTINGS_SYSTEM_POLL_MS,
  SETTINGS_SYSTEM_TECHNICAL_KEYS,
  settingsSystemConnectionLabel,
  settingsSystemConnectionTone,
  settingsSystemEmergencyLabel,
  settingsSystemEmergencyTone,
  settingsSystemEngineTone,
  settingsSystemLiveFlagLabel,
  settingsSystemLiveFlagTone,
  settingsSystemLiveOrderLabel,
  settingsSystemLiveOrderTone,
  settingsSystemPermissionTone,
  settingsSystemTelegramLabel,
  settingsSystemTelegramTone,
} from "../src/lib/rextora/settings/settingsSystemStatusPresentation";

describe("Settings System Status presentation", () => {
  it("treats live-disabled and order-blocked as safe, not failure", () => {
    expect(settingsSystemLiveFlagLabel(false)).toBe("꺼짐");
    expect(settingsSystemLiveFlagTone(false)).toBe("ok");
    expect(settingsSystemLiveFlagTone(true)).toBe("bad");
    expect(settingsSystemLiveOrderLabel(false)).toBe("실주문 차단");
    expect(settingsSystemLiveOrderTone(false)).toBe("ok");
    expect(settingsSystemLiveOrderTone(true)).toBe("warn");
    expect(settingsSystemPermissionTone("차단")).toBe("ok");
    expect(settingsSystemPermissionTone("정상")).toBe("ok");
    expect(settingsSystemEmergencyLabel(false)).toBe("정상");
    expect(settingsSystemEmergencyTone(true)).toBe("bad");
  });

  it("does not treat configured-only telegram or mock engines as verified health", () => {
    expect(settingsSystemTelegramLabel(true)).toBe("설정됨 · 전송 미검증");
    expect(settingsSystemTelegramTone(true)).toBe("warn");
    expect(settingsSystemTelegramTone(false)).toBeUndefined();
    expect(
      settingsSystemEngineTone({ status: "정상", serviceState: "mock" }),
    ).toBe("warn");
    expect(
      settingsSystemEngineTone({ status: "차단", serviceState: "live-blocked" }),
    ).toBe("ok");
    expect(settingsSystemConnectionLabel("normal", true)).toBe("점검 정상");
    expect(settingsSystemConnectionTone("normal", true)).toBe("ok");
    expect(settingsSystemConnectionLabel(undefined, true)).toBe("연결됨 · 미검증");
    expect(settingsSystemConnectionTone(undefined, true)).toBe("warn");
    expect(SETTINGS_SYSTEM_POLL_MS).toBe(12_000);
    expect(SETTINGS_SYSTEM_TECHNICAL_KEYS).toContain("runtime.mode");
  });

  it("keeps the diagnostic refresh action and does not add restart controls", () => {
    const section = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/settings/SystemStatusSection.tsx"),
      "utf8",
    );
    const view = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/settings/SettingsSystemStatusView.tsx"),
      "utf8",
    );
    expect(section).toContain("refreshDiagnostics");
    expect(view).toContain("binance-diagnostics-refresh");
    expect(view).toContain("실주문");
    expect(view).toContain("모듈 상태 (시드)");
    expect(view).not.toContain("재시작");
    expect(view).not.toContain("emergency-stop");
    expect(section).toContain('void load(false)');
    expect(section).toContain("fresh=1&market=1");
  });
});
