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

const APPROVAL_FILE = "strategy-live-approval.json";

export interface StrategyLiveApprovalState {
  strategyId: string;
  verifiedForLive: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
}

const DEFAULT_APPROVAL: StrategyLiveApprovalState = {
  strategyId: SAFE_STRATEGY_ID,
  verifiedForLive: false,
  approvedAt: null,
  approvedBy: null
};

export function getStrategyLiveApprovalState(): StrategyLiveApprovalState {
  return readJsonStore(APPROVAL_FILE, DEFAULT_APPROVAL);
}

export function getEffectiveSafeStrategy(): Strategy {
  const base = getPreservedSafeStrategy();
  const approval = getStrategyLiveApprovalState();
  if (approval.strategyId !== base.id) return base;
  return {
    ...base,
    verifiedForLive: approval.verifiedForLive,
    liveEligible: approval.verifiedForLive && base.liveEligibleCandidate
  };
}

export function approveStrategyForLive(confirmationText: string, actor = "operator"): {
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

  const hash = validateSafeStrategyHash();
  if (!hash.ok) {
    return {
      ok: false,
      message: "전략 해시 검증에 실패하여 실전 승인할 수 없습니다.",
      state: getStrategyLiveApprovalState()
    };
  }

  const state: StrategyLiveApprovalState = {
    strategyId: SAFE_STRATEGY_ID,
    verifiedForLive: true,
    approvedAt: new Date().toISOString(),
    approvedBy: actor
  };
  writeJsonStore(APPROVAL_FILE, state);

  appendAuditLog({
    type: "settings_change",
    actor,
    message: `전략 ${SAFE_STRATEGY_ID} 실전 사용 승인 완료 (params_hash ${SAFE_PARAMS_HASH})`,
    mode: "SYSTEM",
    correlationId: `strategy-approval-${Date.now()}`,
    details: { strategyId: SAFE_STRATEGY_ID, paramsHash: SAFE_PARAMS_HASH, verifiedForLive: true }
  });

  return {
    ok: true,
    message: "전략 실전 승인이 기록되었습니다. 자동매매는 시작되지 않으며 LIVE 체크리스트 항목 하나만 통과합니다.",
    state
  };
}

export function revokeStrategyLiveApproval(actor = "operator"): StrategyLiveApprovalState {
  const state: StrategyLiveApprovalState = {
    ...DEFAULT_APPROVAL,
    strategyId: SAFE_STRATEGY_ID
  };
  writeJsonStore(APPROVAL_FILE, state);
  appendAuditLog({
    type: "settings_change",
    actor,
    message: `전략 ${SAFE_STRATEGY_ID} 실전 사용 승인 해제`,
    mode: "SYSTEM",
    correlationId: `strategy-revoke-${Date.now()}`,
    details: { strategyId: SAFE_STRATEGY_ID, verifiedForLive: false }
  });
  return state;
}

export function getStrategyApprovalSummary() {
  const strategy = getEffectiveSafeStrategy();
  const approval = getStrategyLiveApprovalState();
  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    paramsHash: strategy.paramsHash,
    verifiedForLive: strategy.verifiedForLive,
    approvedAt: approval.approvedAt,
    approvedBy: approval.approvedBy,
    statusLabel: strategy.verifiedForLive ? "실전 승인 완료" : "실전 승인 전",
    description: "이 전략은 실전 주문에 사용되기 전 대표님이 직접 승인해야 합니다."
  };
}
