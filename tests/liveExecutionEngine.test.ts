import { describe, expect, it, beforeEach } from "vitest";
import { preflightLiveExecution } from "../src/lib/rextora/liveExecutionEngine";
import { clearSettingsCache, resetSettings } from "../src/lib/rextora/settings/settingsStore";

describe("liveExecutionEngine", () => {
  beforeEach(() => {
    clearSettingsCache();
    resetSettings();
  });

  it("preflight blocks when LIVE setting is off", () => {
    const result = preflightLiveExecution();
    expect(result.ok).toBe(false);
    expect(result.blockedReasons.some((r) => r.includes("실전 거래 허용"))).toBe(true);
  });

  it("preflight does not mention env approval blockers", () => {
    const result = preflightLiveExecution();
    expect(result.blockedReasons.some((r) => r.includes("실전 거래 승인 환경변수"))).toBe(false);
  });
});
