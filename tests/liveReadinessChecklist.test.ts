import { describe, expect, it } from "vitest";
import {
  buildFinalLiveReadinessChecklist,
  getExpectedRemainingLiveBlocks
} from "../src/lib/rextora/liveReadinessChecklist";
import { evaluateLiveSafetyGate } from "../src/lib/rextora/liveSafetyGate";
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

describe("liveReadinessChecklist", () => {
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

  it("includes expected LIVE block reasons when setting is off", () => {
    const gate = evaluateLiveSafetyGate({ readinessOnly: true, diagnostics: healthyReport });
    const remaining = getExpectedRemainingLiveBlocks(gate);
    expect(remaining.some((r) => r.includes("LIVE 실전 거래 설정"))).toBe(true);
    expect(remaining.some((r) => r.includes("실전 거래 승인 환경변수"))).toBe(false);
  });
});
