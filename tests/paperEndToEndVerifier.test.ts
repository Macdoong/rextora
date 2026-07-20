import { describe, expect, it, beforeEach } from "vitest";
import { verifyPaperEndToEndFlow } from "../src/lib/rextora/paperEndToEndVerifier";
import { resetLearningProfileForTests } from "../src/lib/rextora/learningStore";
import { clearSettingsCache, resetSettings } from "../src/lib/rextora/settings/settingsStore";

describe("paperEndToEndVerifier", () => {
  beforeEach(() => {
    resetLearningProfileForTests();
    clearSettingsCache();
    resetSettings();
  });

  it("returns Korean summary without live order endpoints", () => {
    const report = verifyPaperEndToEndFlow();
    expect(report.usedLiveOrderEndpoints).toBe(false);
    expect(report.summary).toMatch(/[가-힣]/);
    expect(report.summary).toContain("모의 종단 검증");
    expect(report.stages.length).toBeGreaterThan(5);
  });

  it("covers market through dashboard stages", () => {
    const report = verifyPaperEndToEndFlow();
    const ids = report.stages.map((stage) => stage.id);
    expect(ids).toContain("market");
    expect(ids).toContain("signal");
    expect(ids).toContain("ai");
    expect(ids).toContain("learning");
    expect(ids).toContain("queue");
    expect(ids).toContain("dashboard");
  });
});
