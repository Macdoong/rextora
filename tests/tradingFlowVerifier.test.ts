import { describe, expect, it, beforeEach } from "vitest";
import { verifyTradingFlowIntegrity, buildTradingFlowReport } from "../src/lib/rextora/tradingFlowVerifier";

describe("tradingFlowVerifier", () => {
  it("returns a dry-run trading flow report", () => {
    const report = buildTradingFlowReport();
    expect(report.stages.length).toBeGreaterThan(0);
    expect(report.stages.some((s) => s.id === "market")).toBe(true);
    expect(report.stages.some((s) => s.id === "queue")).toBe(true);
  });

  it("verifyTradingFlowIntegrity does not throw", () => {
    const report = verifyTradingFlowIntegrity();
    expect(typeof report.ok).toBe("boolean");
    expect(Array.isArray(report.fatalIssues)).toBe(true);
  });
});
