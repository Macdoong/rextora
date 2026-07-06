import { describe, expect, it, beforeEach } from "vitest";
import {
  getServerTpSlReadiness,
  initializeServerTpSlManagerReadiness,
  resetServerTpSlManagerReadiness
} from "../src/lib/rextora/serverTpSlReadiness";
import { evaluateLiveSafetyGate } from "../src/lib/rextora/liveSafetyGate";
import type { BinanceDiagnosticsReport } from "../src/lib/rextora/binanceDiagnosticsTypes";

const healthyReport: BinanceDiagnosticsReport = {
  checkedAt: new Date().toISOString(),
  network: "testnet",
  baseUrl: "https://testnet.binancefuture.com",
  items: [
    { id: "connection", label: "Binance 연결", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "balance", label: "잔고 조회", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "futures_permission", label: "Futures 권한", status: "normal", reason: "ok", nextAction: "ok" }
  ]
};

describe("serverTpSlReadiness", () => {
  beforeEach(() => {
    resetServerTpSlManagerReadiness();
  });

  it("separates implementation, setting, and manager readiness", () => {
    const readiness = getServerTpSlReadiness();
    expect(readiness.implementationReady).toBe(true);
    expect(readiness.settingEnabled).toBe(true);
    expect(readiness.managerReady).toBe(false);
  });

  it("marks managerReady after safe initialization without placing orders", async () => {
    const result = await initializeServerTpSlManagerReadiness({ exchangeInfoValidated: true });
    expect(result.managerReady).toBe(true);
    expect(result.reason).toContain("준비되었습니다");
  });

  it("removes TP/SL LIVE block when manager is ready", async () => {
    await initializeServerTpSlManagerReadiness({ exchangeInfoValidated: true });
    const gate = evaluateLiveSafetyGate({ readinessOnly: true, diagnostics: healthyReport });
    expect(gate.blockedReasons.some((reason) => reason.includes("서버 TP/SL"))).toBe(false);
  });
});
