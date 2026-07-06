import { describe, expect, it } from "vitest";
import { applyDiagnosticsToApiStatus, buildSyncedBinanceStatus } from "../src/lib/rextora/systemStatusSyncService";
import type { BinanceDiagnosticsReport } from "../src/lib/rextora/binanceDiagnosticsTypes";
import { evaluateLiveSafetyGate } from "../src/lib/rextora/liveSafetyGate";
import { getMarketStaleBlockReason } from "../src/lib/rextora/marketDataStore";

const healthyReport: BinanceDiagnosticsReport = {
  checkedAt: new Date().toISOString(),
  network: "testnet",
  baseUrl: "https://testnet.binancefuture.com",
  items: [
    { id: "connection", label: "Binance 연결", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "account", label: "계정 조회", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "balance", label: "잔고 조회", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "position", label: "포지션 조회", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "open_orders", label: "열린 주문 조회", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "user_stream", label: "User Data Stream", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "order_permission", label: "주문 권한", status: "warning", reason: "canTrade", nextAction: "LIVE gate" },
    { id: "futures_permission", label: "Futures 권한", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "server_tpsl", label: "서버 TP/SL", status: "blocked", reason: "off", nextAction: "enable" }
  ]
};

describe("systemStatusSyncService", () => {
  it("maps healthy diagnostics to synced Binance status", () => {
    const binance = buildSyncedBinanceStatus(healthyReport, "정상");
    expect(binance.apiConnected).toBe(true);
    expect(binance.balanceFetch).toBe("정상");
    expect(binance.readPermission).toBe("정상");
  });

  it("does not keep API permission blocks when diagnostics are healthy", () => {
    const api = applyDiagnosticsToApiStatus(healthyReport);
    const gate = evaluateLiveSafetyGate({ readinessOnly: true, diagnostics: healthyReport, api });
    expect(gate.blockedReasons.some((reason) => reason.includes("API 주문 권한"))).toBe(false);
    expect(gate.blockedReasons.some((reason) => reason.includes("Futures 거래 권한"))).toBe(false);
    expect(gate.blockedReasons.some((reason) => reason.includes("잔고 조회"))).toBe(false);
  });

  it("returns stale reason with age label when market snapshot is stale", () => {
    const reason = getMarketStaleBlockReason();
    if (reason) {
      expect(reason).toContain("시장 데이터가");
      expect(reason).toContain("지연 상태입니다");
    } else {
      expect(reason).toBeNull();
    }
  });
});
