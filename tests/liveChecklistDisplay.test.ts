import { describe, expect, it } from "vitest";
import { buildTradingChecklistRows } from "../src/lib/rextora/liveChecklistDisplay";
import type { BinanceDiagnosticsReport } from "../src/lib/rextora/binanceDiagnosticsTypes";
import type { LiveSafetyChecklist } from "../src/lib/rextora/types";

const baseChecklist: LiveSafetyChecklist = {
  exchangeConnectionNormal: true,
  balanceFetchNormal: true,
  accountReadNormal: true,
  orderPermissionNormal: false,
  futuresPermissionNormal: true,
  serverTpSlEnabled: false,
  liveSettingEnabled: false,
  emergencyStopActive: false,
  candidateReady: false
};

const healthyReport: BinanceDiagnosticsReport = {
  checkedAt: new Date().toISOString(),
  network: "testnet",
  baseUrl: "https://testnet.binancefuture.com",
  items: [
    { id: "connection", label: "Binance 연결", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "balance", label: "잔고 조회", status: "normal", reason: "ok", nextAction: "ok" },
    { id: "order_permission", label: "주문 권한", status: "warning", reason: "canTrade", nextAction: "ok" },
    { id: "futures_permission", label: "Futures 권한", status: "normal", reason: "ok", nextAction: "ok" }
  ]
};

describe("liveChecklistDisplay", () => {
  it("shows 주의 for order permission when canTrade warning and not 차단", () => {
    const rows = buildTradingChecklistRows(baseChecklist, healthyReport);
    const order = rows.find((row) => row.id === "order_permission");
    expect(order?.statusLabel).toBe("주의");
    expect(order?.status).not.toBe("blocked");
  });

  it("shows 통과 for futures when diagnostic is normal", () => {
    const rows = buildTradingChecklistRows(baseChecklist, healthyReport);
    const futures = rows.find((row) => row.id === "futures_permission");
    expect(futures?.statusLabel).toBe("통과");
  });
});
