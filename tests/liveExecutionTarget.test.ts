import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { productionReadonlyHashes } from "../src/lib/rextora/backtest/backtestCostAssumptionsDiagnosis";
import { preflightLiveExecution } from "../src/lib/rextora/liveExecutionEngine";
import {
  approveLiveApprovalRequest,
  requestLiveApproval,
} from "../src/lib/rextora/live/liveApprovalWorkflow";
import {
  evaluateLiveStartApprovalGate,
  validateLiveApprovalTarget,
} from "../src/lib/rextora/live/liveApprovalTarget";
import {
  LIVE_TARGET_NO_SAFE_FALLBACK,
  LIVE_TARGET_NO_SELECTION,
  LIVE_TARGET_UNKNOWN,
  LIVE_TARGET_UNSUPPORTED,
  dispatchLiveExecution,
  liveExecutionDispatchRoute,
  resolveLiveExecutionTarget,
  resolveLiveExecutionTargetById,
} from "../src/lib/rextora/live/liveExecutionTarget";
import { runEventSequenceLiveEntries } from "../src/lib/rextora/live/liveEventSequenceLiveScan";
import { liveGateThreeWayTargetMatch } from "../src/lib/rextora/live/liveGateOperatorPresentation";
import { getRuntimeState } from "../src/lib/rextora/runtimeState";
import { loadSettings } from "../src/lib/rextora/settings/settingsStore";
import { invalidateJsonStoreCache } from "../src/lib/rextora/storage/jsonStore";
import {
  getStrategyLiveApprovalState,
  revokeStrategyLiveApproval,
} from "../src/lib/rextora/strategyLiveApproval";
import {
  copyStrategy,
  createStrategy,
  ensureStrategyStore,
  setLiveActiveStrategy,
} from "../src/lib/rextora/strategy/strategyStore";

import { buildPatternSearchDefinition } from "../src/lib/rextora/strategySearch/patternEventSequence";
import { ORDER_BLOCK_BASE_PARAMS } from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";
import { RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


const ROOT = path.resolve(__dirname, "..");
const SAFE_PATH = path.join(ROOT, "data/strategies/SAFE_v44_i4060.json");
const ORDERS_PATH = path.join(ROOT, "data/rextora/orders.json");
const STRATEGY_INDEX = path.join(ROOT, "data/rextora/strategies/index.json");
const SAFE_SHA =
  "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0";
const CONFIRM = "temp-live-execution-target-confirm";
const PREV_CONFIRM = process.env.REXTORA_LIVE_CONFIRMATION_TEXT;
const hashesBefore = productionReadonlyHashes();
const ordersHashBefore = sha256(ORDERS_PATH);
const strategyIndexHashBefore = sha256(STRATEGY_INDEX);

function sha256(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function source(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function liveFlags() {
  const trading = loadSettings().trading;
  return {
    liveTradingEnabled: trading.liveTradingEnabled === true,
    allowLiveTrading: trading.allowLiveTrading === true,
  };
}

function patternDefinition() {
  return buildPatternSearchDefinition({
    candidateId: "pending",
    strategyName: "live exec target pattern",
    timeframe: "15m",
    params: { ...ORDER_BLOCK_BASE_PARAMS, minImpulseAtrMult: 1.7 },
    family: "order_block",
  })!;
}

function createEventSequenceStrategy() {
  return createStrategy({
    name: "live exec event sequence",
    strategyType: "condition_builder",
    definition: patternDefinition(),
    sourceParamsHash: "live_exec_es",
  });
}

describe("Live execution target dispatch", () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    process.env.REXTORA_LIVE_CONFIRMATION_TEXT = CONFIRM;
    cleanup?.();
    cleanup = installIsolatedStrategyStore().cleanup;
    ensureStrategyStore();
    invalidateJsonStoreCache();
    revokeStrategyLiveApproval();
    invalidateJsonStoreCache("strategy-live-approval.json");
    invalidateJsonStoreCache("strategy-live-approval-history.json");
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    if (PREV_CONFIRM === undefined) delete process.env.REXTORA_LIVE_CONFIRMATION_TEXT;
    else process.env.REXTORA_LIVE_CONFIRMATION_TEXT = PREV_CONFIRM;
  });

  it("1. exact custom Live target resolution", () => {
    const created = createEventSequenceStrategy();
    setLiveActiveStrategy(created.id);
    const resolved = resolveLiveExecutionTarget();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.strategyId).toBe(created.id);
    expect(resolved.paramsHash).toBe(created.paramsHash);
    expect(resolved.strategyHash).toBe(created.strategyHash ?? null);
    expect(resolved.executionKind).toBe("event_sequence");
    expect(resolved.isProtectedSafe).toBe(false);
    expect(resolved.strategyId).not.toBe(RETIRED_SAFE_STRATEGY_ID);
  });

  it("2. retired SAFE target fails closed", () => {
    expect(() => setLiveActiveStrategy(RETIRED_SAFE_STRATEGY_ID)).toThrow();
    const resolved = resolveLiveExecutionTarget();
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.code).toBe(LIVE_TARGET_NO_SELECTION);
  });

  it("3. explicit custom does not fall back to SAFE", () => {
    const created = createEventSequenceStrategy();
    setLiveActiveStrategy(created.id);
    const resolved = resolveLiveExecutionTarget();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.strategyId).toBe(created.id);
    expect(resolved.strategyId).not.toBe(RETIRED_SAFE_STRATEGY_ID);
    expect(liveExecutionDispatchRoute(resolved)).toBe("event_sequence");

    const seed = createStrategy({ name: "live exec custom seed" });
    const copy = copyStrategy(seed.id, "live exec custom copy");
    setLiveActiveStrategy(copy.id);
    const copyResolved = resolveLiveExecutionTarget();
    expect(copyResolved.ok).toBe(false);
    if (copyResolved.ok) return;
    expect(copyResolved.code).toBe(LIVE_TARGET_UNSUPPORTED);
    expect(copyResolved.message).not.toMatch(/SAFE_v44_i4060/);
  });

  it("4. unknown target fails closed", () => {
    const none = resolveLiveExecutionTarget();
    expect(none.ok).toBe(false);
    if (none.ok) return;
    expect(none.code).toBe(LIVE_TARGET_NO_SELECTION);

    const unknown = resolveLiveExecutionTargetById("custom_does_not_exist");
    expect(unknown.ok).toBe(false);
    if (unknown.ok) return;
    expect(unknown.code).toBe(LIVE_TARGET_UNKNOWN);

    const unsupported = createStrategy({
      name: "live exec unsupported",
      timeframe: "15m",
      strategyType: "safe_params",
      params: { ema_fast: 21 },
    });
    setLiveActiveStrategy(unsupported.id);
    const failed = resolveLiveExecutionTarget();
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.code).toBe(LIVE_TARGET_UNSUPPORTED);
    expect(liveExecutionDispatchRoute(failed)).toBe("blocked");
  });

  it("5. custom approval + custom target matches", async () => {
    const created = createEventSequenceStrategy();
    setLiveActiveStrategy(created.id);
    const requested = await requestLiveApproval({ strategyId: created.id });
    expect(requested.ok).toBe(true);
    const approved = await approveLiveApprovalRequest({
      requestId: requested.request?.requestId,
      confirmationText: CONFIRM,
    });
    expect(approved.ok).toBe(true);
    const gate = evaluateLiveStartApprovalGate(getStrategyLiveApprovalState());
    expect(gate.ok).toBe(true);
    expect(gate.approvedTarget?.strategyId).toBe(created.id);
    expect(gate.currentTarget?.strategyId).toBe(created.id);
    expect(gate.currentTarget?.executionKind).toBe("event_sequence");
    expect(
      liveGateThreeWayTargetMatch({
        reviewStrategyId: created.id,
        executionStrategyId: created.id,
        approvedStrategyId: created.id,
        verifiedForLive: true,
      }),
    ).toBe(true);
  });

  it("6. custom approval + missing live target blocks", async () => {
    const created = createEventSequenceStrategy();
    const other = createEventSequenceStrategy();
    const requested = await requestLiveApproval({ strategyId: created.id });
    await approveLiveApprovalRequest({
      requestId: requested.request?.requestId,
      confirmationText: CONFIRM,
    });
    setLiveActiveStrategy(other.id);
    const gate = evaluateLiveStartApprovalGate(getStrategyLiveApprovalState());
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe("APPROVAL_STRATEGY_MISMATCH");
    expect(gate.currentTarget?.strategyId).toBe(other.id);
  });

  it("7. retired SAFE approval is rejected", async () => {
    const created = createEventSequenceStrategy();
    const safeReq = await requestLiveApproval({ strategyId: RETIRED_SAFE_STRATEGY_ID });
    expect(safeReq.ok).toBe(false);
    setLiveActiveStrategy(created.id);
    const gate = evaluateLiveStartApprovalGate(getStrategyLiveApprovalState());
    expect(gate.ok).toBe(false);
    expect(gate.currentTarget?.strategyId).toBe(created.id);
  });

  it("8-10. paramsHash / strategyHash / Backtest identity mismatch blocks", () => {
    const approved = {
      strategyId: "custom_live_exec_a",
      paramsHash: "aaaaaaaaaaaa",
      strategyHash: "hash-a",
      executionKind: "event_sequence" as const,
      backtestRunId: "bt_temp_exec",
      backtestResultHash: "result-a",
      paperSessionId: null,
      symbol: "BTCUSDT",
    };
    const snapshot = {
      strategyId: approved.strategyId,
      verifiedForLive: true,
      target: approved,
    };
    expect(
      validateLiveApprovalTarget({
        currentStrategy: { ...approved, paramsHash: "bbbbbbbbbbbb" },
        approvalSnapshot: snapshot,
      }).code,
    ).toBe("APPROVAL_PARAMS_HASH_MISMATCH");
    expect(
      validateLiveApprovalTarget({
        currentStrategy: { ...approved, strategyHash: "hash-b" },
        approvalSnapshot: snapshot,
      }).code,
    ).toBe("APPROVAL_STRATEGY_HASH_MISMATCH");
    expect(
      validateLiveApprovalTarget({
        currentStrategy: { ...approved, backtestResultHash: "result-b" },
        approvalSnapshot: snapshot,
      }).code,
    ).toBe("APPROVAL_BACKTEST_MISMATCH");
  });

  it("11-12. retired SAFE dispatch vs custom Event-Sequence dispatch never cross", () => {
    const safeTarget = resolveLiveExecutionTargetById(RETIRED_SAFE_STRATEGY_ID);
    expect(liveExecutionDispatchRoute(safeTarget)).toBe("blocked");
    let safeCalls = 0;
    let esCalls = 0;
    const blockedSafe = dispatchLiveExecution(safeTarget, {
      runSafe: () => {
        safeCalls += 1;
        return "safe";
      },
      runEventSequence: () => {
        esCalls += 1;
        return "es";
      },
      failClosed: () => "blocked",
    });
    expect(blockedSafe).toBe("blocked");
    expect(safeCalls).toBe(0);
    expect(esCalls).toBe(0);

    const created = createEventSequenceStrategy();
    setLiveActiveStrategy(created.id);
    const customTarget = resolveLiveExecutionTarget();
    expect(liveExecutionDispatchRoute(customTarget)).toBe("event_sequence");
    safeCalls = 0;
    esCalls = 0;
    const routed = dispatchLiveExecution(customTarget, {
      runSafe: () => {
        safeCalls += 1;
        return "safe";
      },
      runEventSequence: () => {
        esCalls += 1;
        return "es";
      },
      failClosed: () => "blocked",
    });
    expect(routed).toBe("es");
    expect(safeCalls).toBe(0);
    expect(esCalls).toBe(1);

    const blocked = dispatchLiveExecution(
      { ok: false, code: LIVE_TARGET_NO_SAFE_FALLBACK, message: "no fallback" },
      {
        runSafe: () => "safe",
        runEventSequence: () => "es",
        failClosed: () => "blocked",
      },
    );
    expect(blocked).toBe("blocked");
  });

  it("13-14. matching approval still blocked by disabled Live flags", async () => {
    const created = createEventSequenceStrategy();
    setLiveActiveStrategy(created.id);
    const requested = await requestLiveApproval({ strategyId: created.id });
    await approveLiveApprovalRequest({
      requestId: requested.request?.requestId,
      confirmationText: CONFIRM,
    });
    const preflight = preflightLiveExecution();
    expect(preflight.approvalGate.ok).toBe(true);
    expect(preflight.executionTarget.ok).toBe(true);
    expect(preflight.ok).toBe(false);
    expect(liveFlags()).toEqual({
      liveTradingEnabled: false,
      allowLiveTrading: false,
    });
    expect(preflight.blockedReasons.some((reason) => reason.includes("실전 거래 허용"))).toBe(
      true,
    );
  });

  it("15-16. no exchange calls and no real orders from this slice", async () => {
    expect(getRuntimeState().mode === "LIVE" && getRuntimeState().running).toBe(false);
    const targetSrc = source("src/lib/rextora/live/liveExecutionTarget.ts");
    const scanSrc = source("src/lib/rextora/live/liveEventSequenceLiveScan.ts");
    const runtimeSrc = source("src/lib/rextora/botRuntime.ts");
    expect(targetSrc).not.toMatch(/fapi\.binance\.com|\/fapi\/v1\/order|placeMarketOrder/);
    expect(scanSrc).toContain("executeLiveEntry");
    expect(scanSrc).toContain("evaluateEventSequencePaperSignal");
    expect(scanSrc).not.toContain("openEventSequencePaperPosition");
    expect(scanSrc).not.toContain("manageEventSequencePaperPositions");
    expect(scanSrc).not.toContain("loadSafeV44Strategy");
    expect(scanSrc).not.toContain("runSafeLiveEntries");
    expect(runtimeSrc).toContain("async function runSafeLiveEntries");
    expect(runtimeSrc).not.toContain("loadSafeV44Strategy");
    expect(runtimeSrc).not.toContain("evaluateSafeV44Signal");
    const missing = await runEventSequenceLiveEntries({ strategyId: "custom_missing_scan" });
    expect(missing.entered).toBe(0);
    expect(missing.blockedReason).toBeTruthy();
  });

  it("17-18. SAFE file is retired and production stores unchanged", () => {
    expect(fs.existsSync(SAFE_PATH)).toBe(false);
    expect(productionReadonlyHashes().safeSha256).toBe(hashesBefore.safeSha256);
    expect(productionReadonlyHashes().researchIndexSha256).toBe(hashesBefore.researchIndexSha256);
    expect(productionReadonlyHashes().backtestIndexSha256).toBe(hashesBefore.backtestIndexSha256);
    expect(sha256(ORDERS_PATH)).toBe(ordersHashBefore);
    expect(sha256(STRATEGY_INDEX)).toBe(strategyIndexHashBefore);
    expect(process.env.REXTORA_DATA_DIR).toBeTruthy();
    expect(path.resolve(process.env.REXTORA_DATA_DIR!)).not.toContain(
      path.join("data", "rextora"),
    );
    expect(LIVE_TARGET_NO_SAFE_FALLBACK).toBe("CUSTOM_LIVE_TARGET_NO_SAFE_FALLBACK");
  });
});
