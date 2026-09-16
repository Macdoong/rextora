import { describe, expect, it } from "vitest";
import { displaySettingsFieldLabel } from "../src/lib/rextora/displayLabels";
import {
  SETTINGS_TRADING_FIELD_KEYS,
  SETTINGS_TRADING_HIDDEN_KEYS,
  settingsCredentialConnectionLabel,
  settingsCredentialPresenceLabel,
  settingsCredentialPresenceTone,
  settingsExchangeEnvironmentLabel,
  settingsLiveFlagTone,
  settingsPermissionTone,
  settingsRealOrderEngineLabel,
} from "../src/lib/rextora/settings/settingsExchangePresentation";

describe("Settings Exchange presentation", () => {
  it("uses Korean-first labels for trading fields", () => {
    expect(displaySettingsFieldLabel("defaultMode")).toBe("기본 거래 모드");
    expect(displaySettingsFieldLabel("liveTradingEnabled")).toBe("실전 거래 사용");
    expect(displaySettingsFieldLabel("allowLiveTrading")).toBe("실전 거래 허용");
    expect(displaySettingsFieldLabel("testnetMode")).toBe("테스트넷 사용");
    expect(displaySettingsFieldLabel("positionMode")).toBe("포지션 방식");
    expect(displaySettingsFieldLabel("marginType")).toBe("증거금 방식");
    for (const key of SETTINGS_TRADING_FIELD_KEYS) {
      expect(displaySettingsFieldLabel(key)).not.toMatch(/[A-Z][a-z]+ [A-Z]/);
    }
  });

  it("does not treat credential presence as verified connection or live authority", () => {
    expect(settingsCredentialPresenceLabel(true)).toBe("설정됨");
    expect(settingsCredentialPresenceLabel(false)).toBe("미설정");
    expect(settingsCredentialPresenceTone(true)).toBe("warn");
    expect(settingsCredentialPresenceTone(false)).toBeUndefined();
    expect(settingsCredentialConnectionLabel(true)).toBe("자격 증명 구성됨 · 연결 미검증");
    expect(settingsCredentialConnectionLabel(false)).toBe("자격 증명 미설정");
    expect(settingsLiveFlagTone(false)).toBe("ok");
    expect(settingsLiveFlagTone(true)).toBe("bad");
    expect(settingsPermissionTone("차단")).toBe("bad");
    expect(settingsPermissionTone("미확인")).toBeUndefined();
    expect(settingsRealOrderEngineLabel(false)).toBe("연결 안 됨");
    expect(settingsExchangeEnvironmentLabel(true)).toContain("테스트넷");
  });

  it("keeps hidden trading keys listed without exposing secrets", () => {
    expect([...SETTINGS_TRADING_HIDDEN_KEYS]).toEqual([
      "operatorLiveStartRequired",
      "manualLiveConfirmationRequired",
      "liveConfirmationText",
    ]);
    const srcKeys = SETTINGS_TRADING_FIELD_KEYS.join(" ");
    expect(srcKeys).not.toMatch(/BINANCE_API/);
    expect(srcKeys).not.toMatch(/secret/i);
  });
});
