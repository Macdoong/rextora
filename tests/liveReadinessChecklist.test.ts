import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  buildFinalLiveReadinessChecklist,
  getExpectedRemainingLiveBlocks,
} from "../src/lib/rextora/liveReadinessChecklist";
import {
  evaluateLiveSafetyGate,
  LIVE_BLOCK_REASON_ALLOW_LIVE_OFF,
} from "../src/lib/rextora/liveSafetyGate";
import { clearSettingsCache, resetSettings } from "../src/lib/rextora/settings/settingsStore";
import { getRextoraSettings, updateRextoraSettings } from "../src/lib/rextora/settings/settingsService";
import { resetServerTpSlManagerReadiness, initializeServerTpSlManagerReadiness } from "../src/lib/rextora/serverTpSlReadiness";
import { clearEmergencyStop, markEmergencyStop, setRuntimeState } from "../src/lib/rextora/runtimeState";
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
    { id: "order_permission", label: "주문 권한", status: "normal", reason: "ok", nextAction: "ok" },
  ],
};

describe("liveReadinessChecklist", () => {
  beforeEach(() => {
    clearSettingsCache();
    resetSettings();
    resetServerTpSlManagerReadiness();
    clearEmergencyStop();
    setRuntimeState({ emergencyStopped: false, running: false });
    vi.unstubAllEnvs();
  });

  it("builds simplified operational readiness checklist", () => {
    const checklist = buildFinalLiveReadinessChecklist({ diagnostics: healthyReport });
    expect(checklist).toHaveLength(8);
    expect(checklist.some((item) => item.label === "Binance 연결")).toBe(true);
    expect(checklist.some((item) => item.label === "서버 TP/SL")).toBe(true);
    expect(checklist.some((item) => item.label === "LIVE 설정")).toBe(true);
    expect(checklist.some((item) => item.label.includes("전략"))).toBe(false);
  });

  it("does not include approval phrase or env approval items", () => {
    const checklist = buildFinalLiveReadinessChecklist({ diagnostics: healthyReport });
    expect(checklist.some((item) => item.id === "confirmation_text")).toBe(false);
    expect(checklist.some((item) => item.id === "live_env")).toBe(false);
    expect(checklist.some((item) => item.id === "strategy_approval")).toBe(false);
    expect(checklist.some((item) => item.id === "risk_confirmed")).toBe(false);
  });

  it("includes the allow-live block when LIVE permission is off", () => {
    const gate = evaluateLiveSafetyGate({ readinessOnly: true, diagnostics: healthyReport });
    expect(gate.blockedReasons).toContain(LIVE_BLOCK_REASON_ALLOW_LIVE_OFF);
    const remaining = getExpectedRemainingLiveBlocks(gate);
    expect(remaining).toContain(LIVE_BLOCK_REASON_ALLOW_LIVE_OFF);
    expect(remaining.some((r) => r.includes("실전 거래 승인 환경변수"))).toBe(false);
  });

  it("blocks LIVE when allowLiveTrading is false even with healthy diagnostics", () => {
    const gate = evaluateLiveSafetyGate({
      fatalOnly: true,
      mode: "LIVE",
      operatorLiveStartRequested: true,
      diagnostics: healthyReport,
    });
    expect(gate.passed).toBe(false);
    expect(gate.blockedReasons).toContain(LIVE_BLOCK_REASON_ALLOW_LIVE_OFF);
  });

  it("blocks LIVE when operator approval is absent", () => {
    const settings = getRextoraSettings();
    updateRextoraSettings({
      trading: { ...settings.trading, allowLiveTrading: true, liveTradingEnabled: true },
    });
    const gate = evaluateLiveSafetyGate({
      readinessOnly: false,
      mode: "LIVE",
      operatorLiveStartRequested: false,
      diagnostics: healthyReport,
    });
    expect(gate.blockedReasons.some((r) => r.includes("시작 버튼"))).toBe(true);
  });

  it("blocks LIVE when credentials are absent", () => {
    vi.stubEnv("BINANCE_API_KEY", "");
    vi.stubEnv("BINANCE_API_SECRET", "");
    const gate = evaluateLiveSafetyGate({ readinessOnly: true, diagnostics: healthyReport });
    expect(gate.blockedReasons.some((r) => r.includes("API 키"))).toBe(true);
  });

  it("blocks LIVE when emergency stop is active", () => {
    markEmergencyStop("test emergency");
    const gate = evaluateLiveSafetyGate({ readinessOnly: true, diagnostics: healthyReport });
    expect(gate.blockedReasons.some((r) => r.includes("긴급"))).toBe(true);
  });

  it("still requires explicit LIVE approval when every other requirement is satisfied", async () => {
    const settings = getRextoraSettings();
    updateRextoraSettings({
      trading: { ...settings.trading, allowLiveTrading: true, liveTradingEnabled: true },
    });
    await initializeServerTpSlManagerReadiness({ exchangeInfoValidated: true });
    const gate = evaluateLiveSafetyGate({
      readinessOnly: false,
      mode: "LIVE",
      operatorLiveStartRequested: false,
      diagnostics: healthyReport,
    });
    expect(gate.passed).toBe(false);
    expect(gate.blockedReasons.some((r) => r.includes("시작 버튼"))).toBe(true);
  });
});
