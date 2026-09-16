import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { displaySettingsFieldLabel } from "../src/lib/rextora/displayLabels";
import {
  SETTINGS_TELEGRAM_ENV_KEYS,
  SETTINGS_TELEGRAM_FIELD_KEYS,
  SETTINGS_TELEGRAM_FIELD_UNITS,
  SETTINGS_TELEGRAM_GROUPS,
  settingsTelegramChannelLabel,
  settingsTelegramChannelStateLabel,
  settingsTelegramChannelStateTone,
  settingsTelegramConfiguredLabel,
  settingsTelegramConfiguredTone,
  settingsTelegramDisplayUnit,
  settingsTelegramEnabledLabel,
  settingsTelegramEnvKeyLabel,
  settingsTelegramServiceStateLabel,
} from "../src/lib/rextora/settings/settingsNotificationsPresentation";

const KOREAN_TELEGRAM_LABELS: Record<
  (typeof SETTINGS_TELEGRAM_FIELD_KEYS)[number],
  string
> = {
  telegramEnabled: "텔레그램 알림 사용",
  alertOnBotStart: "봇 시작 알림",
  alertOnBotStop: "봇 중지 알림",
  alertOnEmergency: "긴급 상황 알림",
  alertOnDailyReport: "일일 리포트 알림",
  alertOnCandidate: "후보 알림",
  alertOnEntry: "진입 알림",
  alertOnExit: "청산 알림",
  alertOnTpSlPlaced: "손절/익절 등록 알림",
  alertOnRiskBlock: "위험 차단 알림",
  minCandidateScoreForAlert: "알림 최소 점수",
  alertRateLimitMs: "알림 전송 간격",
};

describe("Settings Notification presentation", () => {
  it("uses Korean-first labels for mounted telegram fields only", () => {
    for (const key of SETTINGS_TELEGRAM_FIELD_KEYS) {
      const label = displaySettingsFieldLabel(key);
      expect(label).toBe(KOREAN_TELEGRAM_LABELS[key]);
      expect(label).not.toMatch(/[A-Z][a-z]+ [A-Z]/);
    }
    expect([...SETTINGS_TELEGRAM_FIELD_KEYS]).not.toContain("webhookUrl");
    expect([...SETTINGS_TELEGRAM_FIELD_KEYS]).not.toContain("emailEnabled");
    expect([...SETTINGS_TELEGRAM_FIELD_KEYS]).not.toContain("slackEnabled");
    expect([...SETTINGS_TELEGRAM_FIELD_KEYS]).not.toContain("quietHours");
  });

  it("maps display units without converting stored numbers", () => {
    expect(settingsTelegramDisplayUnit("minCandidateScoreForAlert")).toBe("점");
    expect(settingsTelegramDisplayUnit("alertRateLimitMs")).toBe("ms");
    expect(settingsTelegramDisplayUnit("telegramEnabled")).toBeNull();
    expect(settingsTelegramDisplayUnit("alertOnEntry")).toBeNull();
    expect(Object.keys(SETTINGS_TELEGRAM_FIELD_UNITS)).toHaveLength(
      SETTINGS_TELEGRAM_FIELD_KEYS.length,
    );
    expect(SETTINGS_TELEGRAM_GROUPS.map((group) => group.id)).toEqual([
      "usage",
      "ops",
      "trade",
      "risk",
      "limits",
    ]);
    const grouped = SETTINGS_TELEGRAM_GROUPS.flatMap((group) => [...group.keys]);
    expect(grouped).toEqual([...SETTINGS_TELEGRAM_FIELD_KEYS]);
  });

  it("treats configured credentials as unverified presence only", () => {
    expect(settingsTelegramChannelLabel()).toBe("텔레그램");
    expect(settingsTelegramEnabledLabel(true)).toBe("사용 중");
    expect(settingsTelegramEnabledLabel(false)).toBe("사용 안 함");
    expect(settingsTelegramConfiguredLabel(true)).toBe("설정됨");
    expect(settingsTelegramConfiguredLabel(false)).toBe("미설정");
    expect(settingsTelegramConfiguredTone(true)).toBe("warn");
    expect(settingsTelegramConfiguredTone(false)).toBeUndefined();
    expect(settingsTelegramChannelStateLabel(true, true)).toBe("설정됨 · 전송 미검증");
    expect(settingsTelegramChannelStateLabel(true, false)).toBe(
      "일부 설정됨 · 전송 미검증",
    );
    expect(settingsTelegramChannelStateLabel(false, false)).toBe("미설정");
    expect(settingsTelegramChannelStateTone(true, false)).toBe("warn");
    expect(settingsTelegramChannelStateTone(false, false)).toBeUndefined();
    expect(settingsTelegramServiceStateLabel("read-only")).toBe("읽기 전용");
    expect(settingsTelegramServiceStateLabel("mock")).toBe("모의 데이터");
    expect(settingsTelegramEnvKeyLabel("TG_TOKEN")).toBe("봇 토큰 (환경변수)");
    expect(settingsTelegramEnvKeyLabel("TG_CHAT_ID")).toBe("채팅 ID (환경변수)");
    expect([...SETTINGS_TELEGRAM_ENV_KEYS]).toEqual(["TG_TOKEN", "TG_CHAT_ID"]);
  });

  it("keeps telegram fields, save actions, and does not invent channels or tests", () => {
    const presentation = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/settings/settingsNotificationsPresentation.ts",
      ),
      "utf8",
    );
    const tabs = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/settings/SettingsTabs.tsx"),
      "utf8",
    );
    const shell = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/settings/LifecycleSettingsShell.tsx"),
      "utf8",
    );
    for (const key of SETTINGS_TELEGRAM_FIELD_KEYS) {
      expect(presentation).toContain(`"${key}"`);
      expect(tabs).toContain("SETTINGS_TELEGRAM_FIELD_KEYS");
    }
    expect(tabs).toContain("settings-telegram-source-keys");
    expect(tabs).toContain("settings-telegram-field-");
    expect(tabs).toContain("원본 설정 키");
    expect(tabs).toContain("settingsTelegramDisplayUnit");
    expect(tabs).toContain("onClick={() => void save()}");
    expect(shell).toContain("settings-alerts-summary");
    expect(shell).toContain("settings-alerts-channel");
    expect(shell).not.toContain("연구 완료 알림");
    expect(shell).not.toContain("신규 최고 결과");
    expect(shell).not.toContain("Webhook");
    expect(shell).not.toContain("Slack");
    expect(shell).not.toContain("/api/rextora/telegram/test");
    expect(shell).not.toContain("/api/telegram/test");
    expect(tabs).not.toContain("/api/rextora/telegram/test");
  });
});
