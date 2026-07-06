import { describe, expect, it, vi, beforeEach } from "vitest";
import { evaluateLiveSafetyGate } from "../src/lib/rextora/liveSafetyGate";
import { getRextoraSettings, updateRextoraSettings } from "../src/lib/rextora/settings/settingsService";
import { resetSettings, clearSettingsCache } from "../src/lib/rextora/settings/settingsStore";
import { initializeServerTpSlManagerReadiness, resetServerTpSlManagerReadiness } from "../src/lib/rextora/serverTpSlReadiness";
import type { BinanceDiagnosticsReport } from "../src/lib/rextora/binanceDiagnosticsTypes";

const healthyReport: BinanceDiagnosticsReport = {
  checkedAt: new Date().toISOString(),
  network: "testnet",
  baseUrl: "https://testnet.binancefuture.com",
  items: [
    { id: "connection", label: "Binance 연결", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "account", label: "계정 조회", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "balance", label: "잔고 조회", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "position", label: "포지션 조회", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "futures_permission", label: "Futures 권한", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "order_permission", label: "주문 권한", status: "normal", reason: "ok", nextAction: "ok" }
  ]
};

describe("liveSafetyGate", () => {
  beforeEach(() => {
    clearSettingsCache();
    resetSettings();
    resetServerTpSlManagerReadiness();
  });

  it("blocks LIVE when allowLiveTrading is false", () => {
    const gate = evaluateLiveSafetyGate({ readinessOnly: true, diagnostics: healthyReport });
    expect(gate.passed).toBe(false);
    expect(gate.blockedReasons.some((r) => r.includes("LIVE 실전 거래 설정"))).toBe(true);
  });

  it("does not block on REXTORA_LIVE_APPROVED anymore", () => {
    const gate = evaluateLiveSafetyGate({ readinessOnly: true, diagnostics: healthyReport });
    expect(gate.blockedReasons.some((r) => r.includes("실전 거래 승인 환경변수"))).toBe(false);
  });

  it("does not block on strategy approval or confirmation phrase", () => {
    const gate = evaluateLiveSafetyGate({ readinessOnly: true, diagnostics: healthyReport });
    expect(gate.blockedReasons.some((r) => r.includes("전략 실전 승인"))).toBe(false);
    expect(gate.blockedReasons.some((r) => r.includes("실전 확인 문구"))).toBe(false);
    expect(gate.blockedReasons.some((r) => r.includes("리스크 설정 확인"))).toBe(false);
  });

  it("passes readiness when LIVE allowed and TP/SL manager ready", async () => {
    const settings = getRextoraSettings();
    updateRextoraSettings({
      trading: { ...settings.trading, allowLiveTrading: true, liveTradingEnabled: true }
    });
    await initializeServerTpSlManagerReadiness({ exchangeInfoValidated: true });
    const gate = evaluateLiveSafetyGate({ readinessOnly: true, diagnostics: healthyReport });
    expect(gate.blockedReasons.some((r) => r.includes("서버 TP/SL"))).toBe(false);
    expect(gate.blockedReasons.some((r) => r.includes("실전 거래 승인 환경변수"))).toBe(false);
  });
});
