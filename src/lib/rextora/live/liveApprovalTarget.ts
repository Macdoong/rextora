/**
 * Canonical Live approval target identity and start-gate validator.
 *
 * Live execution target comes from the liveActive registry.
 * This module does not change SAFE or Event-Sequence arithmetic.
 */

import { getSavedBacktest } from "../backtest/backtestStore";
import { getPaperSession } from "../paper/paperSessionStore";
import { getStrategyById } from "../strategy/strategyStore";
import { loadSafeV44Strategy } from "../strategy/safeV44Strategy";
import {
  SAFE_PARAMS_HASH,
  SAFE_STRATEGY_ID,
} from "../strategyRepository";
import {
  resolveLiveExecutionKind,
  resolveLiveExecutionTarget,
  type LiveExecutionKind,
  type ResolvedLiveExecutionTarget,
} from "./liveExecutionTarget";
import type { StoredStrategyV1 } from "../strategy/definition/bridge";

export type LiveApprovalTarget = {
  strategyId: string;
  strategyHash?: string | null;
  paramsHash: string;
  symbol?: string | null;
  executionKind?: LiveExecutionKind | null;
  backtestRunId?: string | null;
  backtestResultHash?: string | null;
  paperSessionId?: string | null;
};

export type LiveApprovalValidationCode =
  | "ok"
  | "NO_LIVE_APPROVAL"
  | "APPROVAL_STRATEGY_MISMATCH"
  | "APPROVAL_PARAMS_HASH_MISMATCH"
  | "APPROVAL_STRATEGY_HASH_MISMATCH"
  | "APPROVAL_BACKTEST_MISMATCH"
  | "APPROVAL_TARGET_MISSING";

export const LIVE_APPROVAL_REASON_NO_LIVE_APPROVAL =
  "전략 실전 승인이 필요합니다.";
export const LIVE_APPROVAL_REASON_STRATEGY_MISMATCH =
  "승인된 전략과 현재 실전 대상이 다릅니다.";
export const LIVE_APPROVAL_REASON_PARAMS_HASH_MISMATCH =
  "승인된 전략 파라미터와 현재 실전 대상이 다릅니다.";
export const LIVE_APPROVAL_REASON_STRATEGY_HASH_MISMATCH =
  "승인된 전략 해시와 현재 실전 대상이 다릅니다.";
export const LIVE_APPROVAL_REASON_BACKTEST_MISMATCH =
  "승인된 백테스트와 현재 실전 대상이 다릅니다.";
export const LIVE_APPROVAL_REASON_TARGET_MISSING =
  "실전 승인 대상 신원이 없어 시작할 수 없습니다.";

const REASON_BY_CODE: Record<Exclude<LiveApprovalValidationCode, "ok">, string> = {
  NO_LIVE_APPROVAL: LIVE_APPROVAL_REASON_NO_LIVE_APPROVAL,
  APPROVAL_STRATEGY_MISMATCH: LIVE_APPROVAL_REASON_STRATEGY_MISMATCH,
  APPROVAL_PARAMS_HASH_MISMATCH: LIVE_APPROVAL_REASON_PARAMS_HASH_MISMATCH,
  APPROVAL_STRATEGY_HASH_MISMATCH: LIVE_APPROVAL_REASON_STRATEGY_HASH_MISMATCH,
  APPROVAL_BACKTEST_MISMATCH: LIVE_APPROVAL_REASON_BACKTEST_MISMATCH,
  APPROVAL_TARGET_MISSING: LIVE_APPROVAL_REASON_TARGET_MISSING,
};

export type LiveApprovalSnapshotView = {
  strategyId: string;
  verifiedForLive: boolean;
  target?: LiveApprovalTarget | null;
};

export type LiveApprovalValidationResult = {
  ok: boolean;
  code: LiveApprovalValidationCode;
  message: string;
  approvedTarget: LiveApprovalTarget | null;
  currentTarget: LiveApprovalTarget | null;
};

export function normalizeLiveApprovalTarget(
  input: Partial<LiveApprovalTarget> | null | undefined,
): LiveApprovalTarget | null {
  if (!input) return null;
  const strategyId = input.strategyId?.trim();
  const paramsHash = input.paramsHash?.trim();
  if (!strategyId || !paramsHash) return null;
  const executionKind =
    input.executionKind === "safe_params" || input.executionKind === "event_sequence"
      ? input.executionKind
      : null;
  return {
    strategyId,
    paramsHash,
    strategyHash: input.strategyHash?.trim() || null,
    symbol: input.symbol?.trim() ? input.symbol.trim().toUpperCase() : null,
    executionKind,
    backtestRunId: input.backtestRunId?.trim() || null,
    backtestResultHash: input.backtestResultHash?.trim() || null,
    paperSessionId: input.paperSessionId?.trim() || null,
  };
}

/**
 * Canonical Live start/approval identity = Live execution registry target.
 * No silent SAFE fallback.
 */
export function resolveLiveStartTarget(): LiveApprovalTarget | null {
  const resolved = resolveLiveExecutionTarget();
  if (!resolved.ok) return null;
  return liveApprovalTargetFromExecution(resolved);
}

export function liveApprovalTargetFromExecution(
  resolved: ResolvedLiveExecutionTarget,
): LiveApprovalTarget {
  return {
    strategyId: resolved.strategyId,
    paramsHash: resolved.paramsHash,
    strategyHash: resolved.strategyHash,
    symbol: resolved.symbol,
    executionKind: resolved.executionKind,
    backtestRunId: null,
    backtestResultHash: null,
    paperSessionId: null,
  };
}

export function captureLiveApprovalTargetIdentity(input: {
  strategyId: string;
  backtestRunId?: string | null;
  paperSessionId?: string | null;
  symbol?: string | null;
}):
  | { ok: true; target: LiveApprovalTarget }
  | { ok: false; message: string } {
  const strategyId = input.strategyId.trim();
  const stored = getStrategyById(strategyId) as StoredStrategyV1 | undefined;
  let paramsHash = stored?.paramsHash?.trim() ?? "";
  let strategyHash = stored?.strategyHash?.trim() || null;
  let executionKind: LiveExecutionKind | null = stored
    ? resolveLiveExecutionKind(stored)
    : null;
  if (strategyId === SAFE_STRATEGY_ID) {
    const loaded = loadSafeV44Strategy({ throwOnHashMismatch: false });
    paramsHash = paramsHash || loaded.paramsHash || SAFE_PARAMS_HASH;
    strategyHash = strategyHash || stored?.strategyHash?.trim() || null;
    executionKind = "safe_params";
  }
  if (!paramsHash) {
    return { ok: false, message: "전략 파라미터 신원을 확인할 수 없습니다." };
  }

  let backtestResultHash: string | null = null;
  const backtestRunId = input.backtestRunId?.trim() || null;
  if (backtestRunId) {
    const backtest = getSavedBacktest(backtestRunId);
    if (backtest) {
      const backtestStrategyId = backtest.strategyId?.trim();
      if (backtestStrategyId && backtestStrategyId !== strategyId) {
        return {
          ok: false,
          message: "Backtest 전략과 요청 전략이 다릅니다.",
        };
      }
      backtestResultHash = backtest.resultHash?.trim() || null;
    }
  }

  const paperSessionId = input.paperSessionId?.trim() || null;
  if (paperSessionId) {
    const session = getPaperSession(paperSessionId);
    if (session && session.strategyId && session.strategyId !== strategyId) {
      return {
        ok: false,
        message: "Paper 세션 전략과 요청 전략이 다릅니다.",
      };
    }
  }

  const target = normalizeLiveApprovalTarget({
    strategyId,
    paramsHash,
    strategyHash,
    symbol: input.symbol ?? null,
    executionKind,
    backtestRunId,
    backtestResultHash,
    paperSessionId,
  });
  if (!target) {
    return { ok: false, message: "실전 승인 대상 신원을 만들 수 없습니다." };
  }
  return { ok: true, target };
}

function fail(
  code: Exclude<LiveApprovalValidationCode, "ok">,
  approvedTarget: LiveApprovalTarget | null,
  currentTarget: LiveApprovalTarget | null,
): LiveApprovalValidationResult {
  return {
    ok: false,
    code,
    message: REASON_BY_CODE[code],
    approvedTarget,
    currentTarget,
  };
}

function snapshotApprovedTarget(
  snapshot: LiveApprovalSnapshotView,
): LiveApprovalTarget | null {
  const fromTarget = normalizeLiveApprovalTarget(snapshot.target);
  if (fromTarget) return fromTarget;
  return null;
}

/**
 * Legacy SAFE snapshot (no `target`) may authorize SAFE only.
 * Missing target identity fails closed for any custom Live target.
 */
function legacySafeTarget(
  snapshot: LiveApprovalSnapshotView,
): LiveApprovalTarget | null {
  if (snapshot.target) return null;
  if (snapshot.strategyId !== SAFE_STRATEGY_ID) return null;
  if (snapshot.verifiedForLive !== true) return null;
  return {
    strategyId: SAFE_STRATEGY_ID,
    paramsHash: SAFE_PARAMS_HASH,
    strategyHash: null,
    symbol: null,
    executionKind: "safe_params",
    backtestRunId: null,
    backtestResultHash: null,
    paperSessionId: null,
  };
}

export function validateLiveApprovalTarget(input: {
  currentStrategy: LiveApprovalTarget | null;
  currentBacktest?: {
    runId?: string | null;
    resultHash?: string | null;
    strategyId?: string | null;
  } | null;
  currentPaperSession?: { sessionId?: string | null } | null;
  approvalSnapshot: LiveApprovalSnapshotView;
}): LiveApprovalValidationResult {
  const current = normalizeLiveApprovalTarget({
    ...(input.currentStrategy ?? {}),
    backtestRunId:
      input.currentBacktest?.runId ?? input.currentStrategy?.backtestRunId ?? null,
    backtestResultHash:
      input.currentBacktest?.resultHash ??
      input.currentStrategy?.backtestResultHash ??
      null,
    paperSessionId:
      input.currentPaperSession?.sessionId ??
      input.currentStrategy?.paperSessionId ??
      null,
  });

  if (input.approvalSnapshot.verifiedForLive !== true) {
    return fail("NO_LIVE_APPROVAL", snapshotApprovedTarget(input.approvalSnapshot), current);
  }

  const explicit = snapshotApprovedTarget(input.approvalSnapshot);
  const approved =
    explicit ??
    (current?.strategyId === SAFE_STRATEGY_ID
      ? legacySafeTarget(input.approvalSnapshot)
      : null);

  if (!approved) {
    return fail("APPROVAL_TARGET_MISSING", null, current);
  }
  if (!current) {
    return fail("APPROVAL_TARGET_MISSING", approved, null);
  }
  if (approved.strategyId !== current.strategyId) {
    return fail("APPROVAL_STRATEGY_MISMATCH", approved, current);
  }
  if (
    approved.executionKind &&
    current.executionKind &&
    approved.executionKind !== current.executionKind
  ) {
    return fail("APPROVAL_STRATEGY_MISMATCH", approved, current);
  }
  if (!approved.paramsHash || !current.paramsHash || approved.paramsHash !== current.paramsHash) {
    return fail("APPROVAL_PARAMS_HASH_MISMATCH", approved, current);
  }
  if (approved.strategyHash && current.strategyHash && approved.strategyHash !== current.strategyHash) {
    return fail("APPROVAL_STRATEGY_HASH_MISMATCH", approved, current);
  }
  if (approved.backtestRunId || approved.backtestResultHash) {
    const currentRunId = current.backtestRunId ?? null;
    const currentResultHash = current.backtestResultHash ?? null;
    if (approved.backtestRunId && approved.backtestRunId !== currentRunId) {
      return fail("APPROVAL_BACKTEST_MISMATCH", approved, current);
    }
    if (
      approved.backtestResultHash &&
      approved.backtestResultHash !== currentResultHash
    ) {
      return fail("APPROVAL_BACKTEST_MISMATCH", approved, current);
    }
  }
  return {
    ok: true,
    code: "ok",
    message: "실전 승인 대상이 현재 실전 대상과 일치합니다.",
    approvedTarget: approved,
    currentTarget: current,
  };
}

export function evaluateLiveStartApprovalGate(
  snapshot: LiveApprovalSnapshotView,
): LiveApprovalValidationResult {
  const resolved = resolveLiveExecutionTarget();
  if (!resolved.ok) {
    return fail(
      snapshot.verifiedForLive === true ? "APPROVAL_TARGET_MISSING" : "NO_LIVE_APPROVAL",
      snapshotApprovedTarget(snapshot),
      null,
    );
  }
  let current = liveApprovalTargetFromExecution(resolved);
  const boundRunId = snapshot.target?.backtestRunId?.trim();
  if (boundRunId) {
    const backtest = getSavedBacktest(boundRunId);
    if (backtest && (!backtest.strategyId || backtest.strategyId === current.strategyId)) {
      current = {
        ...current,
        backtestRunId: backtest.id,
        backtestResultHash: backtest.resultHash?.trim() || null,
      };
    }
  }
  return validateLiveApprovalTarget({
    currentStrategy: current,
    approvalSnapshot: snapshot,
  });
}
