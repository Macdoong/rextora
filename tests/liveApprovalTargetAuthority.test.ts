import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { preflightLiveExecution } from "../src/lib/rextora/liveExecutionEngine";
import {
  approveLiveApprovalRequest,
  rejectLiveApprovalRequest,
  requestLiveApproval,
  revokeLiveApprovalRequest,
} from "../src/lib/rextora/live/liveApprovalWorkflow";
import {
  evaluateLiveStartApprovalGate,
  validateLiveApprovalTarget,
  type LiveApprovalTarget,
} from "../src/lib/rextora/live/liveApprovalTarget";
import {
  LIVE_GATE_APPROVAL_MISMATCH,
  liveGateApprovalPresentation,
  liveGateTargetAuthorityPresentation as presentationFromUi,
} from "../src/lib/rextora/live/liveGateOperatorPresentation";
import {
  getStrategyLiveApprovalState,
  revokeStrategyLiveApproval,
} from "../src/lib/rextora/strategyLiveApproval";
import { createStrategy, ensureStrategyStore, setLiveActiveStrategy } from "../src/lib/rextora/strategy/strategyStore";
import { invalidateJsonStoreCache, writeJsonStore } from "../src/lib/rextora/storage/jsonStore";
import { loadSettings } from "../src/lib/rextora/settings/settingsStore";
import { getRuntimeState } from "../src/lib/rextora/runtimeState";
import { RETIRED_SAFE_PARAMS_HASH, RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


const ROOT = path.resolve(__dirname, "..");
const SAFE_PATH = path.join(ROOT, "data/strategies/SAFE_v44_i4060.json");
const SAFE_SHA =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";
const CONFIRM = "temp-live-approval-target-confirm";
const PREV_CONFIRM = process.env.REXTORA_LIVE_CONFIRMATION_TEXT;

function sha256(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function liveFlags() {
  const trading = loadSettings().trading;
  return {
    liveTradingEnabled: trading.liveTradingEnabled === true,
    allowLiveTrading: trading.allowLiveTrading === true,
  };
}

function engineSource(): string {
  return [
    fs.readFileSync(path.join(ROOT, "src/lib/rextora/liveExecutionEngine.ts"), "utf8"),
    fs.readFileSync(path.join(ROOT, "src/lib/rextora/live/liveApprovalTarget.ts"), "utf8"),
    fs.readFileSync(path.join(ROOT, "src/lib/rextora/strategyLiveApproval.ts"), "utf8"),
  ].join("\n");
}

function customTarget(overrides?: Partial<LiveApprovalTarget>): LiveApprovalTarget {
  return {
    strategyId: "custom_temp_live_a",
    paramsHash: "aaaaaaaaaaaa",
    strategyHash: "hash-a",
    symbol: "BTCUSDT",
    backtestRunId: "bt_temp_1",
    backtestResultHash: "result-a",
    paperSessionId: null,
    ...overrides,
  };
}

describe("Live approval target authority", () => {
  beforeEach(() => {
    process.env.REXTORA_LIVE_CONFIRMATION_TEXT = CONFIRM;
    invalidateJsonStoreCache();
    revokeStrategyLiveApproval();
    invalidateJsonStoreCache("strategy-live-approval.json");
    invalidateJsonStoreCache("strategy-live-approval-history.json");
  });

  afterEach(() => {
    if (PREV_CONFIRM === undefined) delete process.env.REXTORA_LIVE_CONFIRMATION_TEXT;
    else process.env.REXTORA_LIVE_CONFIRMATION_TEXT = PREV_CONFIRM;
  });

  it("1-5. custom request approves the same custom target, not SAFE", async () => {
    const created = createStrategy({
      name: "temp custom live target",
      timeframe: "15m",
      strategyType: "safe_params",
      params: { ema_fast: 21 },
    });
    const requested = await requestLiveApproval({
      strategyId: created.id,
      symbol: "BTCUSDT",
    });
    expect(requested.ok).toBe(true);
    expect(requested.request?.strategyId).toBe(created.id);
    expect(requested.request?.paramsHash).toBe(created.paramsHash);
    const approved = await approveLiveApprovalRequest({
      requestId: requested.request?.requestId,
      confirmationText: CONFIRM,
    });
    expect(approved.ok).toBe(true);
    const snapshot = getStrategyLiveApprovalState();
    expect(snapshot.verifiedForLive).toBe(true);
    expect(snapshot.strategyId).toBe(created.id);
    expect(snapshot.target?.strategyId).toBe(created.id);
    expect(snapshot.target?.paramsHash).toBe(created.paramsHash);
    expect(snapshot.target?.strategyId).not.toBe(RETIRED_SAFE_STRATEGY_ID);
    expect(Object.keys(snapshot).filter((key) => key.toLowerCase().includes("verified"))).toEqual([
      "verifiedForLive",
    ]);
  });

  it("2-3. SAFE request approves SAFE only and custom cannot authorize SAFE", async () => {
    const custom = createStrategy({
      name: "temp custom other",
      timeframe: "15m",
      strategyType: "safe_params",
      params: { ema_fast: 34 },
    });
    const customReq = await requestLiveApproval({ strategyId: custom.id });
    await approveLiveApprovalRequest({
      requestId: customReq.request?.requestId,
      confirmationText: CONFIRM,
    });
    const customSnap = getStrategyLiveApprovalState();
    const againstSafe = validateLiveApprovalTarget({
      currentStrategy: {
        strategyId: RETIRED_SAFE_STRATEGY_ID,
        paramsHash: RETIRED_SAFE_PARAMS_HASH,
      },
      approvalSnapshot: customSnap,
    });
    expect(againstSafe.ok).toBe(false);
    expect(againstSafe.code).toBe("APPROVAL_STRATEGY_MISMATCH");

    revokeStrategyLiveApproval();
    const safeReq = await requestLiveApproval({ strategyId: RETIRED_SAFE_STRATEGY_ID });
    expect(safeReq.ok).toBe(false);
    expect(getStrategyLiveApprovalState().verifiedForLive).toBe(false);
    expect(getStrategyLiveApprovalState().strategyId).toBeNull();
  });

  it("6-10. identity mismatch fails closed without rewriting history", async () => {
    const approved = customTarget();
    const snapshot = {
      strategyId: approved.strategyId,
      verifiedForLive: true,
      target: approved,
    };
    expect(
      validateLiveApprovalTarget({
        currentStrategy: customTarget({ strategyId: "custom_other" }),
        approvalSnapshot: snapshot,
      }).code,
    ).toBe("APPROVAL_STRATEGY_MISMATCH");
    expect(
      validateLiveApprovalTarget({
        currentStrategy: customTarget({ paramsHash: "bbbbbbbbbbbb" }),
        approvalSnapshot: snapshot,
      }).code,
    ).toBe("APPROVAL_PARAMS_HASH_MISMATCH");
    expect(
      validateLiveApprovalTarget({
        currentStrategy: customTarget({ strategyHash: "hash-b" }),
        approvalSnapshot: snapshot,
      }).code,
    ).toBe("APPROVAL_STRATEGY_HASH_MISMATCH");
    expect(
      validateLiveApprovalTarget({
        currentStrategy: customTarget({ backtestResultHash: "result-b" }),
        approvalSnapshot: snapshot,
      }).code,
    ).toBe("APPROVAL_BACKTEST_MISMATCH");
    expect(
      validateLiveApprovalTarget({
        currentStrategy: customTarget(),
        approvalSnapshot: {
          strategyId: RETIRED_SAFE_STRATEGY_ID,
          verifiedForLive: true,
          target: null,
        },
      }).code,
    ).toBe("APPROVAL_TARGET_MISSING");
  });

  it("11-16. Live start approval gate is separate from feature flags", async () => {
    const none = preflightLiveExecution();
    expect(none.ok).toBe(false);
    expect(none.approvalGate.ok).toBe(false);
    expect(none.approvalGate.code).toBe("NO_LIVE_APPROVAL");
    expect(none.blockedReasons).toContain("전략 실전 승인이 필요합니다.");
    expect(none.blockedReasons.some((reason) => reason.includes("실전 거래 허용"))).toBe(true);

    ensureStrategyStore();
    const mismatchLive = createStrategy({
      name: "temp live mismatch",
      timeframe: "15m",
      strategyType: "safe_params",
      params: { ema_fast: 13 },
    });
    setLiveActiveStrategy(mismatchLive.id);

    const custom = createStrategy({
      name: "temp custom start",
      timeframe: "15m",
      strategyType: "safe_params",
      params: { ema_fast: 18 },
    });
    const customReq = await requestLiveApproval({ strategyId: custom.id });
    await approveLiveApprovalRequest({
      requestId: customReq.request?.requestId,
      confirmationText: CONFIRM,
    });
    const wrong = preflightLiveExecution();
    expect(wrong.ok).toBe(false);
    expect(wrong.approvalGate.ok).toBe(false);
    expect(["APPROVAL_STRATEGY_MISMATCH", "APPROVAL_TARGET_MISSING"]).toContain(
      wrong.approvalGate.code,
    );
    expect(wrong.blockedReasons.some((reason) => reason.includes("실전 거래 허용"))).toBe(true);

    revokeStrategyLiveApproval();
    writeJsonStore("strategy-live-approval.json", {
      strategyId: RETIRED_SAFE_STRATEGY_ID,
      verifiedForLive: true,
      approvedAt: new Date().toISOString(),
      approvedBy: null,
      target: {
        strategyId: RETIRED_SAFE_STRATEGY_ID,
        paramsHash: "deadbeefdead",
      },
    });
    invalidateJsonStoreCache("strategy-live-approval.json");
    const paramsMismatch = preflightLiveExecution();
    expect(paramsMismatch.approvalGate.ok).toBe(false);
    expect(paramsMismatch.approvalGate.code).toBe("NO_LIVE_APPROVAL");

    revokeStrategyLiveApproval();
    const safeReq = await requestLiveApproval({ strategyId: RETIRED_SAFE_STRATEGY_ID });
    expect(safeReq.ok).toBe(false);
    const matching = preflightLiveExecution();
    expect(matching.approvalGate.ok).toBe(false);
    expect(matching.ok).toBe(false);
    expect(liveFlags()).toEqual({
      liveTradingEnabled: false,
      allowLiveTrading: false,
    });
    expect(matching.blockedReasons.some((reason) => reason.includes("실전 거래 허용"))).toBe(true);
  });

  it("17-19. tests do not activate Live or call exchange orders", () => {
    expect(getRuntimeState().mode === "LIVE" && getRuntimeState().running).toBe(false);
    expect(engineSource()).not.toMatch(/fapi\.binance\.com|\/fapi\/v1\/order/);
    expect(liveFlags().liveTradingEnabled).toBe(false);
  });

  it("20-24. pending custom request writes that target; reject/revoke/history hold", async () => {
    const created = createStrategy({
      name: "temp workflow custom",
      timeframe: "15m",
      strategyType: "safe_params",
      params: { ema_fast: 25 },
    });
    const pending = await requestLiveApproval({ strategyId: created.id });
    const swapped = await approveLiveApprovalRequest({
      requestId: pending.request?.requestId,
      confirmationText: CONFIRM,
      reviewReason: JSON.stringify({ strategyId: RETIRED_SAFE_STRATEGY_ID }),
    });
    expect(swapped.snapshot.strategyId).toBe(created.id);
    expect(swapped.snapshot.target?.strategyId).toBe(created.id);

    revokeStrategyLiveApproval();
    const rejectable = await requestLiveApproval({ strategyId: created.id });
    const before = getStrategyLiveApprovalState();
    const rejected = await rejectLiveApprovalRequest({
      requestId: rejectable.request?.requestId,
    });
    expect(rejected.snapshot.verifiedForLive).toBe(false);
    expect(rejected.snapshot.strategyId).toBe(before.strategyId);
    expect(rejected.request?.status).toBe("rejected");

    const approvables = await requestLiveApproval({ strategyId: created.id });
    await approveLiveApprovalRequest({
      requestId: approvables.request?.requestId,
      confirmationText: CONFIRM,
    });
    const revoked = await revokeLiveApprovalRequest({
      requestId: approvables.request?.requestId,
    });
    expect(revoked.snapshot.verifiedForLive).toBe(false);
    expect(revoked.snapshot.target).toBeNull();
    expect(revoked.request?.status).toBe("revoked");
    expect(revoked.history.some((row) => row.requestId === approvables.request?.requestId)).toBe(
      true,
    );
  });

  it("25-29. Live Gate read model uses the same validator and does not imply Live active", () => {
    const mismatch = presentationFromUi({
      verifiedForLive: true,
      approvedStrategyId: "custom_mt03i30x",
      currentStrategyId: "custom_other",
      validForCurrentLiveTarget: false,
    });
    expect(mismatch.showMismatch).toBe(true);
    expect(mismatch.mismatchKo).toBe(LIVE_GATE_APPROVAL_MISMATCH);
    expect(mismatch.technical).toBe("");
    const technical = presentationFromUi({
      verifiedForLive: true,
      approvedStrategyId: "custom_mt03i30x",
      currentStrategyId: "custom_mt03i30x",
      paramsHash: "53578a34fb23",
      strategyHash: "41025d366997b72199d315ebae86ea615c6d466e4daa3f68a8eff1f1cfd51062",
      validForCurrentLiveTarget: true,
    });
    expect(technical.technical).toContain("paramsHash 53578a34fb23");
    expect(technical.showMismatch).toBe(false);
    const approvedUi = liveGateApprovalPresentation({
      verifiedForLive: true,
      validForCurrentLiveTarget: false,
    });
    expect(approvedUi.statusKo).toBe(LIVE_GATE_APPROVAL_MISMATCH);
    expect(approvedUi.impliesLiveActive).toBe(false);
  });

  it("30-32. SAFE hashes stay protected and custom approval cannot authorize SAFE start", async () => {
    expect(fs.existsSync(SAFE_PATH)).toBe(false);
    const custom = createStrategy({
      name: "temp cannot authorize safe",
      timeframe: "15m",
      strategyType: "safe_params",
      params: { ema_fast: 9 },
    });
    const req = await requestLiveApproval({ strategyId: custom.id });
    await approveLiveApprovalRequest({
      requestId: req.request?.requestId,
      confirmationText: CONFIRM,
    });
    ensureStrategyStore();
    expect(() => setLiveActiveStrategy(RETIRED_SAFE_STRATEGY_ID)).toThrow();
    const start = evaluateLiveStartApprovalGate(getStrategyLiveApprovalState());
    expect(start.ok).toBe(false);
    expect(fs.existsSync(SAFE_PATH)).toBe(false);
  });

  it("33-38. temp stores only; no production approval mutation path in this suite", () => {
    expect(process.env.REXTORA_DATA_DIR).toBeTruthy();
    expect(path.resolve(process.env.REXTORA_DATA_DIR!)).not.toContain(path.join("data", "rextora"));
    expect(engineSource()).not.toMatch(/runSearchJob|createPaperSession|resumePaperSession/);
    writeJsonStore("strategy-live-approval.json", {
      strategyId: RETIRED_SAFE_STRATEGY_ID,
      verifiedForLive: false,
      approvedAt: null,
      approvedBy: null,
      target: null,
    });
    expect(getStrategyLiveApprovalState().verifiedForLive).toBe(false);
  });
});
