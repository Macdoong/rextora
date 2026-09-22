import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  LIVE_DISABLED_LABEL,
  LIVE_FEATURE_FLAG_NEXT_ACTION,
  LIVE_GATE_APPROVAL_MISMATCH,
  LIVE_GATE_THREE_WAY_MISMATCH,
  LIVE_GATE_APPROVAL_NOT_LIVE_START,
  LIVE_GATE_APPROVAL_REQUEST_ACTION,
  LIVE_GATE_APPROVAL_REQUEST_UNAVAILABLE,
  LIVE_GATE_IDENTITY_UNAVAILABLE,
  LIVE_GATE_PERMISSION_UNAVAILABLE,
  LIVE_GATE_UNAVAILABLE,
  LIVE_GATE_UNKNOWN_FAILURE_TITLE,
  LIVE_GATE_WORKFLOW_APPROVED,
  LIVE_GATE_WORKFLOW_NONE,
  LIVE_GATE_WORKFLOW_PENDING,
  LIVE_GATE_WORKFLOW_REJECTED,
  LIVE_GATE_WORKFLOW_REVOKED,
  LIVE_ORDERS_BLOCKED_LABEL,
  liveGateApprovalPresentation,
  liveGateExecutionKindLabel,
  liveGateFailurePresentation,
  liveGateHistoryRowPresentation,
  liveGateLiveStatusLabel,
  liveGateMapChecklistItem,
  liveGatePermissionRows,
  liveGatePresentationContainsSecret,
  liveGateReadinessSummary,
  liveGateRealOrderCountLabel,
  liveGateRealOrderLabel,
  liveGateOperatorShellContext,
  liveGateTargetAuthorityPresentation,
  liveGateWorkflowStatusLabel,
} from "../src/lib/rextora/live/liveGateOperatorPresentation";
import { paperOperatorShellContext } from "../src/lib/rextora/paper/paperOperatorPresentation";
import { backtestOperatorShellContext } from "../src/lib/rextora/backtest/backtestOperatorPresentation";
import {
  RISK_OPERATOR_UNAVAILABLE,
  RISK_RECOVERY_UNKNOWN,
  riskOperatorFormatRatio,
  riskOperatorLimitRow,
  riskOperatorRecoveryCopy,
  riskOperatorRowsFromUnified,
  riskOperatorStatePresentation,
  riskOperatorUsageRatio,
  riskOperatorUtilizationFromUnified,
} from "../src/lib/rextora/risk/riskOperatorPresentation";

const ROOT = path.resolve(__dirname, "..");
const SAFE_PATH = path.join(ROOT, "data/strategies/SAFE_v44_i4060.json");
const SAFE_SHA =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";

function sha256(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("Live Gate operator presentation", () => {
  it("1-4. disabled Live and blocked real orders stay truthful", () => {
    expect(
      liveGateLiveStatusLabel({
        liveTradingEnabled: false,
        allowLiveTrading: false,
      }),
    ).toBe(LIVE_DISABLED_LABEL);
    expect(
      liveGateRealOrderLabel({
        liveTradingEnabled: false,
        allowLiveTrading: false,
      }),
    ).toBe(LIVE_ORDERS_BLOCKED_LABEL);
    const helperSrc = fs.readFileSync(
      path.join(ROOT, "src/lib/rextora/live/liveGateOperatorPresentation.ts"),
      "utf8",
    );
    expect(helperSrc).not.toMatch(/liveTradingEnabled\s*=\s*true/);
    expect(helperSrc).not.toMatch(/allowLiveTrading\s*=\s*true/);
    expect(liveGateRealOrderCountLabel(0)).toBe("0건");
  });

  it("5-9. gate presentation keeps unknown codes truthful", () => {
    const passed = liveGateMapChecklistItem({
      id: "live_setting",
      label: "LIVE 설정",
      status: "passed",
      description: "설정에서 LIVE 실전 거래가 허용되어 있습니다.",
      nextAction: "상태를 유지하세요.",
    });
    expect(passed.statusLabelKo).toBe("통과");
    const failed = liveGateFailurePresentation(
      "설정에서 실전 거래 허용을 켜야 합니다.",
    );
    expect(failed.titleKo).toBe("실전 매매가 비활성화되어 있습니다.");
    expect(failed.nextActionKo).toBe(LIVE_FEATURE_FLAG_NEXT_ACTION);
    const unknown = liveGateFailurePresentation("NOT_A_REAL_GATE");
    expect(unknown.known).toBe(false);
    expect(unknown.titleKo).toBe(LIVE_GATE_UNKNOWN_FAILURE_TITLE);
    expect(unknown.code).toBe("NOT_A_REAL_GATE");
    expect(unknown.reasonKo).toBe("NOT_A_REAL_GATE");
    expect(
      liveGateReadinessSummary({
        liveAllowed: false,
        emergencyStopActive: false,
        liveReady: false,
        failedGateCount: 2,
      }).labelKo,
    ).toBe("BLOCKED");
  });

  it("10-15. risk current/limit and halt states", () => {
    expect(
      riskOperatorFormatRatio(0, -5, "%").combinedLabel,
    ).toBe("0% / -5%");
    const reached = riskOperatorLimitRow({
      id: "daily_loss",
      labelKo: "일일 손실",
      current: -5,
      limit: -5,
      unit: "%",
      breachedWhen: (current, limit) => current <= limit,
    });
    expect(reached.breached).toBe(true);
    expect(
      riskOperatorStatePresentation({ riskState: "자동 중단" }).labelKo,
    ).toBe("위험 제한으로 자동 중단");
    expect(
      riskOperatorStatePresentation({ emergencyStopActive: true }).labelKo,
    ).toBe("긴급 정지");
    expect(
      riskOperatorFormatRatio(null, 3, "%").currentLabel,
    ).toBe(RISK_OPERATOR_UNAVAILABLE);
    expect(riskOperatorRecoveryCopy(null)).toBe(RISK_RECOVERY_UNKNOWN);
    const rows = riskOperatorRowsFromUnified({
      currentDailyLossPct: 0,
      dailyLossLimitPct: -5,
      openPositions: 0,
      maxPositions: 3,
    });
    expect(rows[0]?.combinedLabel).toContain("0% / -5%");
    const riskPage = fs.readFileSync(
      path.join(ROOT, "app/risk/page.tsx"),
      "utf8",
    );
    expect(riskPage).toContain("RiskOperatorWorkbench");
    expect(riskPage).toContain("riskOperatorStatePresentation");
    expect(riskPage).not.toContain("method: \"POST\"");
    expect(riskPage).not.toContain("emergency-stop");
    const workbench = fs.readFileSync(
      path.join(ROOT, "components/rextora/risk/RiskOperatorWorkbench.tsx"),
      "utf8",
    );
    expect(workbench).toContain("riskOperatorRowsFromUnified");
    expect(workbench).toContain('href="/live-trading"');
    expect(workbench).toContain('href="/settings#risk"');
    expect(workbench).toContain("riskOperatorUtilizationFromUnified");
    expect(workbench).toContain("일일 손실 사용량");
    expect(workbench).not.toContain("사용량 기준");
    expect(workbench).not.toContain("fetch(");
  });

  it("risk utilization presentation uses current/limit capacity", () => {
    expect(riskOperatorUsageRatio(1, 2.5)).toBe(0.4);
    expect(riskOperatorUsageRatio(0, -5)).toBe(0);
    expect(riskOperatorUsageRatio(0, -10)).toBe(0);
    expect(riskOperatorUsageRatio(0, 3)).toBe(0);
    expect(riskOperatorUsageRatio(0, 6)).toBe(0);
    expect(riskOperatorUsageRatio(0, 20)).toBe(0);
    const { metrics, closest } = riskOperatorUtilizationFromUnified({
      currentDailyLossPct: 0,
      dailyLossLimitPct: -5,
      remainingDailyLossPct: 5,
      usagePct: 0,
      accountDrawdownPct: 0,
      accountLossLimitPct: -10,
      openPositions: 0,
      maxPositions: 3,
      remainingPositionSlots: 3,
      currentLeverage: 1,
      maxLeverage: 2.5,
      consecutiveLosses: 0,
      consecutiveLossLimit: 6,
      dailyTrades: 0,
      maxDailyTrades: 20,
      remainingTrades: 20,
    });
    const byId = Object.fromEntries(metrics.map((metric) => [metric.id, metric]));
    expect(byId.daily_loss?.usageRatio).toBe(0);
    expect(byId.drawdown?.usageRatio).toBe(0);
    expect(byId.positions?.usageRatio).toBe(0);
    expect(byId.leverage?.usageRatio).toBe(0.4);
    expect(byId.consecutive_losses?.usageRatio).toBe(0);
    expect(byId.daily_trades?.usageRatio).toBe(0);
    expect(closest?.id).toBe("leverage");
    expect(closest?.combinedLabel).toBe("1배 / 2.5배");
  });

  it("16-21. API metadata never exposes secrets or infers from public data", () => {
    const missing = liveGatePermissionRows({ apiConfigured: false });
    expect(missing[0]?.valueKo).toBe("미구성");
    const configured = liveGatePermissionRows({
      apiConfigured: true,
      readPermission: "정상",
      futuresPermission: "정상",
      orderPermission: "차단",
    });
    expect(configured.find((row) => row.id === "futures")?.valueKo).toBe("정상");
    expect(configured.find((row) => row.id === "order")?.valueKo).toBe("차단");
    const publicOnly = liveGatePermissionRows({
      apiConfigured: true,
      usedPublicMarketDataOnly: true,
      readPermission: "정상",
      futuresPermission: "정상",
      orderPermission: "정상",
    });
    expect(publicOnly.find((row) => row.id === "read")?.valueKo).toBe(
      LIVE_GATE_PERMISSION_UNAVAILABLE,
    );
    const rendered = JSON.stringify(configured);
    expect(
      liveGatePresentationContainsSecret(rendered, [
        "super-secret-binance-key-value",
      ]),
    ).toBe(false);
  });

  it("22-27. approval presentation never auto-approves", () => {
    const pending = liveGateApprovalPresentation({ verifiedForLive: false });
    expect(pending.statusKo).toBe("실전 승인 전");
    expect(pending.autoApproved).toBe(false);
    const approved = liveGateApprovalPresentation({
      verifiedForLive: true,
      approvedAt: "2026-09-09T00:00:00.000Z",
      approvedBy: "operator",
    });
    expect(approved.approvedAt).toBe("2026-09-09T00:00:00.000Z");
    expect(approved.approvedBy).toBe("operator");
    const missing = liveGateApprovalPresentation({});
    expect(missing.statusKo).toBe("승인 데이터 없음");
    expect(missing.requestActionKo).toBe(LIVE_GATE_APPROVAL_REQUEST_UNAVAILABLE);
    expect(missing.workflowStatusKo).toBe(LIVE_GATE_WORKFLOW_NONE);
    expect(missing.impliesLiveActive).toBe(false);
    expect(missing.approvalDoesNotStartLiveKo).toBe(LIVE_GATE_APPROVAL_NOT_LIVE_START);
    expect(missing.approvedBy).toBe(LIVE_GATE_IDENTITY_UNAVAILABLE);
  });

  it("34-42. workflow labels stay distinct from Live active", () => {
    expect(liveGateWorkflowStatusLabel("none")).toBe(LIVE_GATE_WORKFLOW_NONE);
    expect(liveGateWorkflowStatusLabel("pending")).toBe(LIVE_GATE_WORKFLOW_PENDING);
    expect(liveGateWorkflowStatusLabel("approved")).toBe(LIVE_GATE_WORKFLOW_APPROVED);
    expect(liveGateWorkflowStatusLabel("rejected")).toBe(LIVE_GATE_WORKFLOW_REJECTED);
    expect(liveGateWorkflowStatusLabel("revoked")).toBe(LIVE_GATE_WORKFLOW_REVOKED);
    const approved = liveGateApprovalPresentation({
      verifiedForLive: true,
      workflowStatus: "approved",
      canRequest: false,
    });
    expect(approved.statusKo).toBe("실전 승인 완료");
    expect(approved.workflowStatusKo).toBe(LIVE_GATE_WORKFLOW_APPROVED);
    expect(approved.impliesLiveActive).toBe(false);
    expect(approved.approvalDoesNotStartLiveKo).not.toMatch(/Live active/i);
    const requestable = liveGateApprovalPresentation({
      verifiedForLive: false,
      workflowStatus: "none",
      canRequest: true,
    });
    expect(requestable.requestActionKo).toBe(LIVE_GATE_APPROVAL_REQUEST_ACTION);
    const history = liveGateHistoryRowPresentation({
      status: "approved",
      strategyId: "SAFE_v44_i4060",
      requestId: "lar_secondary_only",
      reviewedBy: null,
    });
    expect(history.reviewedBy).toBe(LIVE_GATE_IDENTITY_UNAVAILABLE);
    expect(history.requestIdSecondary).toBe("lar_secondary_only");
    expect(history.requestIdSecondary).not.toContain("secret");
  });

  it("target mismatch copy stays truthful and hashes stay secondary", () => {
    const mismatch = liveGateTargetAuthorityPresentation({
      verifiedForLive: true,
      approvedStrategyId: "custom_mt03i30x",
      currentStrategyId: "custom_other",
      validForCurrentLiveTarget: false,
    });
    expect(mismatch.showMismatch).toBe(true);
    expect(mismatch.mismatchKo).toBe(LIVE_GATE_APPROVAL_MISMATCH);
    const pending = liveGateTargetAuthorityPresentation({
      verifiedForLive: false,
      approvedStrategyId: "SAFE_v44_i4060",
      currentStrategyId: "SAFE_v44_i4060",
    });
    expect(pending.showMismatch).toBe(false);
    expect(pending.approvedStrategyKo).toBe(LIVE_GATE_UNAVAILABLE);
    const threeWay = liveGateTargetAuthorityPresentation({
      verifiedForLive: true,
      reviewStrategyId: "custom_mt03i30x",
      approvedStrategyId: "custom_mt03i30x",
      currentStrategyId: "custom_mt03i30x",
      validForCurrentLiveTarget: true,
    });
    expect(threeWay.threeWayOk).toBe(true);
    expect(threeWay.reviewStrategyKo).toBe("custom_mt03i30x");
    expect(threeWay.showMismatch).toBe(false);
    const blocked = liveGateTargetAuthorityPresentation({
      verifiedForLive: true,
      reviewStrategyId: "custom_mt03i30x",
      approvedStrategyId: "custom_mt03i30x",
      currentStrategyId: "SAFE_v44_i4060",
      validForCurrentLiveTarget: false,
    });
    expect(blocked.threeWayOk).toBe(false);
    expect(blocked.showMismatch).toBe(true);
    expect(blocked.mismatchKo).toBe(LIVE_GATE_THREE_WAY_MISMATCH);
    const unresolved = liveGateTargetAuthorityPresentation({
      verifiedForLive: false,
      reviewStrategyId: "custom_mt03i30x",
      currentStrategyId: null,
    });
    expect(unresolved.threeWayOk).toBe(false);
    expect(unresolved.showMismatch).toBe(true);
    expect(unresolved.mismatchKo).toBe(LIVE_GATE_THREE_WAY_MISMATCH);
  });

  it("28-30. Live Gate context overrides stale memory; other pages unchanged", () => {
    const live = liveGateOperatorShellContext({
      routeIsLiveGate: true,
      liveGateContext: {
        source: "live_gate",
        strategyId: "custom_mt03i30x",
        runId: "bt_mt1kh58k_762ad9",
        paperSessionId: null,
        symbol: "BTCUSDT",
        timeframe: "15m",
        readinessLabel: LIVE_DISABLED_LABEL,
      },
    });
    expect(live.usedLiveGatePageContext).toBe(true);
    expect(live.strategy).toBe("custom_mt03i30x");
    expect(live.researchJobId).toBeNull();
    const idle = liveGateOperatorShellContext({
      routeIsLiveGate: true,
      liveGateContext: null,
    });
    expect(idle.strategy).toBeNull();
    const research = paperOperatorShellContext({
      routeIsPaper: false,
      paperContext: null,
      agentStrategyId: "custom_ms1y81v1",
      agentJobId: "search_f199146b-7fec-48ab-8063-747e0c484b07",
    });
    expect(research.strategy).toBe("custom_ms1y81v1");
    expect(
      backtestOperatorShellContext({
        routeIsBacktest: false,
        backtestContext: null,
      }).usedBacktestPageContext,
    ).toBe(false);
  });

  it("31-36. presentation helpers stay read-only and do not mutate production", () => {
    const beforeSafe = fs.existsSync(SAFE_PATH) ? sha256(SAFE_PATH) : null;
    const orders = path.join(ROOT, "data/rextora/orders.json");
    const beforeOrders = sha256(orders);
    const livePage = fs.readFileSync(
      path.join(ROOT, "app/live-trading/page.tsx"),
      "utf8",
    );
    expect(fs.existsSync(SAFE_PATH)).toBe(false);
    expect(livePage).not.toContain("runSearchJob(");
    expect(livePage).not.toContain("createPaperSession");
    expect(livePage).not.toContain("resumePaper");
    expect(livePage).toContain("disabled={!liveEnabled}");
    expect(livePage).toContain("v3-live");
    expect(livePage).toContain("live-emergency-controls");
    expect(livePage).toContain('data-testid="live-start"');
    expect(livePage).toContain("/api/emergency/stop-all");
    const gates = fs.readFileSync(
      path.join(ROOT, "components/rextora/live/LiveActivationGates.tsx"),
      "utf8",
    );
    const checklist = fs.readFileSync(
      path.join(ROOT, "components/rextora/live/operator/LiveGateChecklist.tsx"),
      "utf8",
    );
    expect(gates).toContain("/api/rextora/strategy/approve");
    expect(gates).toContain('postApprovalAction("request")');
    expect(gates).toContain('postApprovalAction("approve")');
    expect(gates).toContain('postApprovalAction("reject")');
    expect(gates).toContain('postApprovalAction("revoke")');
    expect(gates).toContain("/api/rextora/live/dry-run");
    expect(gates).toContain("LIVE_GATE_REVIEW_STRATEGY_LABEL");
    expect(gates).toContain("LIVE_GATE_APPROVED_STRATEGY_LABEL");
    expect(gates).toContain("LIVE_GATE_CURRENT_STRATEGY_LABEL");
    expect(gates).toContain("liveGateExecutionKindLabel");
    expect(gates).toContain("SAFE로 대체하지 않음");
    expect(checklist).toContain("live-gate-segments");
    expect(gates).toContain("live-target-flow");
    expect(gates).toContain("승인 상세");
    expect(gates).toContain("live-gate-diagnostics");
    expect(gates).toContain("live-gate-refresh");
    expect(gates).toContain("live-gate-dry-run");
    expect(gates).toContain("v3-lv-diagnostics");
    expect(livePage).toContain("v3-lv-chart-empty");
    expect(livePage).toContain("live-charts-idle");
    expect(livePage).toContain("riskOperatorUtilizationFromUnified");
    expect(livePage).toContain("TradingChartsPanel");
    expect(livePage).toContain("v3-lv-split");
    expect(livePage).toContain("v3-lv-control-grid");
    expect(livePage).toContain("/api/bot/start");
    expect(livePage).toContain("/api/bot/stop");
    expect(liveGateExecutionKindLabel("event_sequence")).toBe("이벤트 시퀀스");
    expect(liveGateExecutionKindLabel("safe_params")).toBe("SAFE 파라미터");
    expect(liveGateExecutionKindLabel(null)).toBe(LIVE_GATE_UNAVAILABLE);
    liveGateLiveStatusLabel({
      liveTradingEnabled: false,
      allowLiveTrading: false,
    });
    expect(fs.existsSync(SAFE_PATH)).toBe(false);
    expect(beforeSafe).toBeNull();
    expect(sha256(orders)).toBe(beforeOrders);
  });
});
