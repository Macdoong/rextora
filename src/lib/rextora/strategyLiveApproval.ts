import { readJsonStore, writeJsonStore } from "./storage/jsonStore";
import { appendAuditLog } from "./storage/auditStore";
import {
  getPreservedSafeStrategy,
  SAFE_PARAMS_HASH,
  SAFE_STRATEGY_ID,
  validateSafeStrategyHash
} from "./strategyRepository";
import { verifyLiveConfirmationText } from "./security";
import type { Strategy } from "./types";
import {
  evaluateLiveStartApprovalGate,
  normalizeLiveApprovalTarget,
  resolveLiveStartTarget,
  type LiveApprovalTarget,
} from "./live/liveApprovalTarget";
import { resolveLiveExecutionTarget } from "./live/liveExecutionTarget";

const APPROVAL_FILE = "strategy-live-approval.json";

export type { LiveApprovalTarget };

export interface StrategyLiveApprovalState {
  strategyId: string;
  verifiedForLive: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
  /** Exact approved Live target. Absent on legacy SAFE snapshots. */
  target: LiveApprovalTarget | null;
}

const DEFAULT_APPROVAL: StrategyLiveApprovalState = {
  strategyId: SAFE_STRATEGY_ID,
  verifiedForLive: false,
  approvedAt: null,
  approvedBy: null,
  target: null
};

function readApprovalState(): StrategyLiveApprovalState {
  const stored = readJsonStore<StrategyLiveApprovalState>(
    APPROVAL_FILE,
    DEFAULT_APPROVAL,
    { ttlMs: 0 },
  );
  return {
    strategyId: stored.strategyId?.trim() || SAFE_STRATEGY_ID,
    verifiedForLive: stored.verifiedForLive === true,
    approvedAt: stored.approvedAt ?? null,
    approvedBy: stored.approvedBy ?? null,
    target: normalizeLiveApprovalTarget(stored.target),
  };
}

export function getStrategyLiveApprovalState(): StrategyLiveApprovalState {
  return readApprovalState();
}

export function getEffectiveSafeStrategy(): Strategy {
  const base = getPreservedSafeStrategy();
  const approval = getStrategyLiveApprovalState();
  const approvedId = approval.target?.strategyId ?? approval.strategyId;
  if (approvedId !== base.id) return base;
  return {
    ...base,
    verifiedForLive: approval.verifiedForLive,
    liveEligible: approval.verifiedForLive && base.liveEligibleCandidate
  };
}

function normalizeApprovalActor(actor?: string | null): string | null {
  const trimmed = actor?.trim();
  return trimmed ? trimmed : null;
}

function explicitSafeTarget(): LiveApprovalTarget {
  return {
    strategyId: SAFE_STRATEGY_ID,
    paramsHash: SAFE_PARAMS_HASH,
    strategyHash: null,
    symbol: null,
    backtestRunId: null,
    backtestResultHash: null,
    paperSessionId: null,
  };
}

export function approveStrategyForLive(
  confirmationText: string,
  actor?: string | null,
  target?: LiveApprovalTarget | null,
): {
  ok: boolean;
  message: string;
  state: StrategyLiveApprovalState;
} {
  if (!verifyLiveConfirmationText(confirmationText)) {
    return {
      ok: false,
      message: "실전 확인 문구가 일치하지 않습니다. 환경변수에 설정된 확인 문구를 정확히 입력하세요.",
      state: getStrategyLiveApprovalState()
    };
  }

  const requested = normalizeLiveApprovalTarget(target) ?? (target == null ? explicitSafeTarget() : null);
  if (!requested) {
    return {
      ok: false,
      message: "실전 승인 대상 신원이 없어 승인할 수 없습니다.",
      state: getStrategyLiveApprovalState()
    };
  }

  if (requested.strategyId === SAFE_STRATEGY_ID) {
    const hash = validateSafeStrategyHash();
    if (!hash.ok) {
      return {
        ok: false,
        message: "전략 해시 검증에 실패하여 실전 승인할 수 없습니다.",
        state: getStrategyLiveApprovalState()
      };
    }
    requested.paramsHash = SAFE_PARAMS_HASH;
  }

  const approvedBy = normalizeApprovalActor(actor);
  const state: StrategyLiveApprovalState = {
    strategyId: requested.strategyId,
    verifiedForLive: true,
    approvedAt: new Date().toISOString(),
    approvedBy,
    target: requested
  };
  writeJsonStore(APPROVAL_FILE, state);

  appendAuditLog({
    type: "settings_change",
    actor: approvedBy ?? "unavailable",
    message: `전략 ${requested.strategyId} 실전 사용 승인 완료 (params_hash ${requested.paramsHash})`,
    mode: "SYSTEM",
    correlationId: `strategy-approval-${Date.now()}`,
    details: {
      strategyId: requested.strategyId,
      paramsHash: requested.paramsHash,
      strategyHash: requested.strategyHash ?? null,
      verifiedForLive: true,
      approvedBy
    }
  });

  return {
    ok: true,
    message: "전략 실전 승인이 기록되었습니다. 자동매매는 시작되지 않으며 LIVE 체크리스트 항목 하나만 통과합니다.",
    state
  };
}

export function revokeStrategyLiveApproval(actor?: string | null): StrategyLiveApprovalState {
  const revokedBy = normalizeApprovalActor(actor);
  const previous = getStrategyLiveApprovalState();
  const state: StrategyLiveApprovalState = {
    ...DEFAULT_APPROVAL,
    strategyId: SAFE_STRATEGY_ID,
    target: null
  };
  writeJsonStore(APPROVAL_FILE, state);
  appendAuditLog({
    type: "settings_change",
    actor: revokedBy ?? "unavailable",
    message: `전략 ${previous.target?.strategyId ?? previous.strategyId} 실전 사용 승인 해제`,
    mode: "SYSTEM",
    correlationId: `strategy-revoke-${Date.now()}`,
    details: {
      strategyId: previous.target?.strategyId ?? previous.strategyId,
      verifiedForLive: false,
      revokedBy
    }
  });
  return state;
}

export function getStrategyApprovalSummary() {
  const strategy = getEffectiveSafeStrategy();
  const approval = getStrategyLiveApprovalState();
  const execution = resolveLiveExecutionTarget();
  const currentTarget = resolveLiveStartTarget();
  const validation = evaluateLiveStartApprovalGate(approval);
  const approvedId = approval.target?.strategyId ?? approval.strategyId;
  const statusLabel = !approval.verifiedForLive
    ? "실전 승인 전"
    : validation.ok
      ? "실전 승인 완료"
      : validation.message;
  return {
    strategyId: approvedId,
    strategyName: approvedId === strategy.id ? strategy.name : approvedId,
    paramsHash: approval.target?.paramsHash ?? currentTarget?.paramsHash ?? null,
    verifiedForLive: approval.verifiedForLive,
    validForCurrentLiveTarget: validation.ok,
    mismatchCode: validation.ok ? null : validation.code,
    mismatchReason: validation.ok || validation.code === "NO_LIVE_APPROVAL" ? null : validation.message,
    approvedAt: approval.approvedAt,
    approvedBy: approval.approvedBy,
    statusLabel,
    description: "이 전략은 실전 주문에 사용되기 전 대표님이 직접 승인해야 합니다.",
    target: approval.target,
    currentTarget,
    executionTarget: execution.ok
      ? {
          strategyId: execution.strategyId,
          paramsHash: execution.paramsHash,
          strategyHash: execution.strategyHash,
          symbol: execution.symbol,
          executionKind: execution.executionKind,
        }
      : null,
    executionTargetError: execution.ok ? null : execution.message,
    identityAuthority: "unavailable" as const,
  };
}
