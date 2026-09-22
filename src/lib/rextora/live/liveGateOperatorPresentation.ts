/**
 * Live Gate operator presentation — labels and read-model only.
 * No Live activation, order placement, or gate-authority changes.
 */

export const LIVE_GATE_UNAVAILABLE = "데이터 없음";
export const LIVE_GATE_UNKNOWN_FAILURE_TITLE = "실전 진입 조건 미충족";
export const LIVE_GATE_APPROVAL_REQUEST_UNAVAILABLE = "승인 요청을 만들 수 없습니다.";
export const LIVE_GATE_APPROVAL_REQUEST_ACTION = "실전 승인 요청";
export const LIVE_GATE_APPROVAL_NOT_LIVE_START =
  "승인 완료는 실전 매매 시작을 의미하지 않습니다.";
export const LIVE_GATE_WORKFLOW_NONE = "승인 요청 없음";
export const LIVE_GATE_WORKFLOW_PENDING = "대표 승인 대기";
export const LIVE_GATE_WORKFLOW_APPROVED = "실전 승인 완료";
export const LIVE_GATE_WORKFLOW_REJECTED = "실전 승인 거절";
export const LIVE_GATE_WORKFLOW_REVOKED = "실전 승인 철회";
export const LIVE_GATE_IDENTITY_UNAVAILABLE = "신원 확인 불가";
export const LIVE_GATE_IDENTITY_AUTHORITY_GAP =
  "인증된 운영자 역할이 없습니다. 이 버튼은 대표 전용 권한이 아닙니다.";
export const LIVE_GATE_APPROVAL_MISMATCH =
  "승인된 전략과 현재 실전 대상이 다릅니다.";
export const LIVE_GATE_THREE_WAY_MISMATCH =
  "검토 대상, 실제 실행 대상, 승인된 전략이 일치해야 합니다.";
export const LIVE_GATE_APPROVED_STRATEGY_LABEL = "승인된 전략";
export const LIVE_GATE_CURRENT_STRATEGY_LABEL = "실제 실행 대상 전략";
export const LIVE_GATE_REVIEW_STRATEGY_LABEL = "검토 대상 전략";
export const LIVE_GATE_PARAMS_IDENTITY_LABEL = "파라미터 신원";
export const LIVE_GATE_CURRENT_APPROVAL_TITLE = "현재 실전 승인 상태";
export const LIVE_GATE_HISTORY_TITLE = "승인 요청 이력";
export const LIVE_GATE_PERMISSION_UNAVAILABLE = "권한 확인 불가";
export const LIVE_DISABLED_LABEL = "실전 매매 비활성";
export const LIVE_ORDERS_BLOCKED_LABEL = "실제 주문 차단 중";
export const LIVE_FEATURE_FLAG_NEXT_ACTION =
  "실전 기능이 시스템 설정에서 비활성화되어 있습니다.";
export const LIVE_SETTINGS_BLOCK_COPY =
  "기능 설정에서 실전 매매가 차단되어 있습니다.";

export type LiveGateOperatorPageContext = {
  source: "live_gate";
  strategyId: string | null;
  runId: string | null;
  paperSessionId: string | null;
  symbol: string | null;
  timeframe: string | null;
  readinessLabel: string | null;
};

export type LiveGateReadinessTone = "ready" | "not_ready" | "blocked";

export type LiveGateOperatorChecklistItem = {
  id: string;
  labelKo: string;
  status: "passed" | "needed" | "blocked" | "warning";
  statusLabelKo: string;
  explanationKo: string;
  nextActionKo: string;
  technical?: string | null;
};

export type LiveGateFailurePresentation = {
  titleKo: string;
  reasonKo: string;
  nextActionKo: string;
  code: string;
  known: boolean;
};

export type LiveGatePermissionRow = {
  id: string;
  labelKo: string;
  valueKo: string;
  tone: "success" | "warning" | "danger" | "muted";
};

const KNOWN_BLOCK_REASONS: Record<
  string,
  { titleKo: string; nextActionKo: string }
> = {
  "설정에서 실전 거래 허용을 켜야 합니다.": {
    titleKo: "실전 매매가 비활성화되어 있습니다.",
    nextActionKo: LIVE_FEATURE_FLAG_NEXT_ACTION,
  },
  "LIVE 실전 거래 설정이 꺼져 있습니다.": {
    titleKo: "실전 매매가 비활성화되어 있습니다.",
    nextActionKo: LIVE_FEATURE_FLAG_NEXT_ACTION,
  },
  "긴급 중지 상태입니다.": {
    titleKo: "긴급 정지가 활성화되어 있습니다.",
    nextActionKo: "긴급 정지 해제 조건을 확인하세요.",
  },
  "Binance 연결이 정상이 아닙니다.": {
    titleKo: "거래소 연결이 확인되지 않았습니다.",
    nextActionKo: "거래소 API 설정을 확인하세요.",
  },
  "주문 권한이 정상이 아닙니다.": {
    titleKo: "거래 API 권한이 부족합니다.",
    nextActionKo: "거래소 API 설정을 확인하세요.",
  },
  "Futures 권한이 정상이 아닙니다.": {
    titleKo: "선물 거래 권한이 부족합니다.",
    nextActionKo: "거래소 API 설정을 확인하세요.",
  },
  "서버 TP/SL 보호가 아직 준비되지 않았습니다.": {
    titleKo: "서버 손절·익절 보호가 준비되지 않았습니다.",
    nextActionKo: "시스템 상태에서 서버 보호 준비를 확인하세요.",
  },
  "진입 가능한 후보가 선택되지 않았습니다.": {
    titleKo: "실전 검토 대상 전략이 없습니다.",
    nextActionKo: "백테스트 검증을 먼저 통과해야 합니다.",
  },
  "실전 거래 시작 버튼을 눌러야 LIVE가 시작됩니다.": {
    titleKo: "운영자 시작이 필요합니다.",
    nextActionKo: "모든 게이트를 통과한 뒤에만 시작할 수 있습니다.",
  },
};

export function liveGateOperatorShellContext(input: {
  routeIsLiveGate: boolean;
  liveGateContext: LiveGateOperatorPageContext | null;
}): {
  strategy: string | null;
  runId: string | null;
  symbolTimeframe: string | null;
  researchJobId: null;
  paperSessionLabel: string;
  usedLiveGatePageContext: boolean;
} {
  if (!input.routeIsLiveGate) {
    return {
      strategy: null,
      runId: null,
      symbolTimeframe: null,
      researchJobId: null,
      paperSessionLabel: "Not selected",
      usedLiveGatePageContext: false,
    };
  }
  const ctx = input.liveGateContext;
  const strategy = ctx?.strategyId?.trim() || null;
  const runId = ctx?.runId?.trim() || null;
  const symbol = ctx?.symbol?.trim() || null;
  const timeframe = ctx?.timeframe?.trim() || null;
  const paperSession = ctx?.paperSessionId?.trim() || "Not selected";
  return {
    strategy,
    runId,
    symbolTimeframe:
      symbol && timeframe ? `${symbol} · ${timeframe}` : symbol || timeframe || null,
    researchJobId: null,
    paperSessionLabel: paperSession,
    usedLiveGatePageContext: true,
  };
}

export function liveGateLiveStatusLabel(input: {
  liveTradingEnabled: boolean;
  allowLiveTrading: boolean;
}): string {
  if (input.liveTradingEnabled || input.allowLiveTrading) {
    return "실전 매매 설정 허용";
  }
  return LIVE_DISABLED_LABEL;
}

export function liveGateRealOrderLabel(input: {
  liveTradingEnabled: boolean;
  allowLiveTrading: boolean;
}): string {
  if (input.liveTradingEnabled && input.allowLiveTrading) {
    return "실제 주문 허용 설정";
  }
  return LIVE_ORDERS_BLOCKED_LABEL;
}

export function liveGateReadinessSummary(input: {
  liveReady?: boolean | null;
  liveAllowed?: boolean | null;
  emergencyStopActive?: boolean | null;
  failedGateCount?: number;
}): {
  tone: LiveGateReadinessTone;
  labelKo: string;
} {
  if (input.emergencyStopActive) {
    return { tone: "blocked", labelKo: "BLOCKED" };
  }
  if (input.liveAllowed === false) {
    return { tone: "blocked", labelKo: "BLOCKED" };
  }
  if (input.liveReady === true && (input.failedGateCount ?? 0) === 0) {
    return { tone: "ready", labelKo: "READY" };
  }
  if ((input.failedGateCount ?? 0) > 0 || input.liveReady === false) {
    return { tone: "not_ready", labelKo: "NOT READY" };
  }
  return { tone: "not_ready", labelKo: "NOT READY" };
}

export function liveGateFailurePresentation(
  reason: string | null | undefined,
): LiveGateFailurePresentation {
  const raw = reason?.trim() || "";
  if (!raw) {
    return {
      titleKo: LIVE_GATE_UNKNOWN_FAILURE_TITLE,
      reasonKo: LIVE_GATE_UNAVAILABLE,
      nextActionKo: "게이트 상태를 다시 확인하세요.",
      code: "UNAVAILABLE",
      known: false,
    };
  }
  const mapped = KNOWN_BLOCK_REASONS[raw];
  if (mapped) {
    return {
      titleKo: mapped.titleKo,
      reasonKo: raw,
      nextActionKo: mapped.nextActionKo,
      code: raw,
      known: true,
    };
  }
  return {
    titleKo: LIVE_GATE_UNKNOWN_FAILURE_TITLE,
    reasonKo: raw,
    nextActionKo: "원본 차단 사유를 확인하고 다음 조치를 결정하세요.",
    code: raw,
    known: false,
  };
}

export function liveGateChecklistStatusLabel(
  status: LiveGateOperatorChecklistItem["status"],
): string {
  if (status === "passed") return "통과";
  if (status === "needed") return "필요";
  if (status === "warning") return "주의";
  return "차단";
}

export function liveGateMapChecklistItem(input: {
  id: string;
  label: string;
  status: LiveGateOperatorChecklistItem["status"];
  description?: string;
  nextAction?: string;
}): LiveGateOperatorChecklistItem {
  return {
    id: input.id,
    labelKo: input.label,
    status: input.status,
    statusLabelKo: liveGateChecklistStatusLabel(input.status),
    explanationKo: input.description?.trim() || LIVE_GATE_UNAVAILABLE,
    nextActionKo: input.nextAction?.trim() || "상태를 다시 확인하세요.",
    technical: input.id,
  };
}

export function liveGatePermissionLabel(
  status: string | null | undefined,
  configured?: boolean | null,
): { valueKo: string; tone: LiveGatePermissionRow["tone"] } {
  if (configured === false) {
    return { valueKo: "미구성", tone: "danger" };
  }
  const normalized = status?.trim();
  if (!normalized || normalized === "미확인") {
    return { valueKo: LIVE_GATE_PERMISSION_UNAVAILABLE, tone: "muted" };
  }
  if (normalized === "정상") return { valueKo: "정상", tone: "success" };
  if (normalized === "차단") return { valueKo: "차단", tone: "danger" };
  if (normalized === "오류") return { valueKo: "오류", tone: "danger" };
  return { valueKo: LIVE_GATE_PERMISSION_UNAVAILABLE, tone: "muted" };
}

export function liveGatePermissionRows(input: {
  apiConfigured?: boolean | null;
  readPermission?: string | null;
  futuresPermission?: string | null;
  orderPermission?: string | null;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
  usedPublicMarketDataOnly?: boolean;
}): LiveGatePermissionRow[] {
  const configured = input.apiConfigured === true;
  const read = liveGatePermissionLabel(
    input.usedPublicMarketDataOnly ? null : input.readPermission,
    input.apiConfigured,
  );
  const futures = liveGatePermissionLabel(
    input.usedPublicMarketDataOnly ? null : input.futuresPermission,
    input.apiConfigured,
  );
  const order = liveGatePermissionLabel(
    input.usedPublicMarketDataOnly ? null : input.orderPermission,
    input.apiConfigured,
  );
  return [
    {
      id: "configured",
      labelKo: "API 연결",
      valueKo: configured ? "구성됨" : "미구성",
      tone: configured ? "success" : "danger",
    },
    {
      id: "read",
      labelKo: "조회 권한",
      valueKo: read.valueKo,
      tone: read.tone,
    },
    {
      id: "futures",
      labelKo: "선물 거래 권한",
      valueKo: futures.valueKo,
      tone: futures.tone,
    },
    {
      id: "order",
      labelKo: "주문 권한",
      valueKo: order.valueKo,
      tone: order.tone,
    },
    {
      id: "verifiedAt",
      labelKo: "마지막 확인",
      valueKo: input.lastVerifiedAt?.trim() || LIVE_GATE_UNAVAILABLE,
      tone: "muted",
    },
    {
      id: "lastError",
      labelKo: "마지막 오류",
      valueKo: input.lastError?.trim() || "없음",
      tone: input.lastError?.trim() ? "danger" : "muted",
    },
  ];
}

export type LiveGateWorkflowStatus =
  | "none"
  | "pending"
  | "approved"
  | "rejected"
  | "revoked";

export function liveGateWorkflowStatusLabel(
  status?: LiveGateWorkflowStatus | null,
): string {
  if (status === "pending") return LIVE_GATE_WORKFLOW_PENDING;
  if (status === "approved") return LIVE_GATE_WORKFLOW_APPROVED;
  if (status === "rejected") return LIVE_GATE_WORKFLOW_REJECTED;
  if (status === "revoked") return LIVE_GATE_WORKFLOW_REVOKED;
  return LIVE_GATE_WORKFLOW_NONE;
}

export function liveGateFormatTimestamp(value?: string | null): string {
  const raw = value?.trim();
  if (!raw) return LIVE_GATE_UNAVAILABLE;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return LIVE_GATE_UNAVAILABLE;
  return new Date(parsed).toISOString();
}

export function liveGateIdentityLabel(value?: string | null): string {
  return value?.trim() || LIVE_GATE_IDENTITY_UNAVAILABLE;
}

export function liveGateApprovalPresentation(input: {
  verifiedForLive?: boolean | null;
  approvedAt?: string | null;
  approvedBy?: string | null;
  statusLabel?: string | null;
  workflowStatus?: LiveGateWorkflowStatus | null;
  canRequest?: boolean;
  validForCurrentLiveTarget?: boolean | null;
  mismatchReason?: string | null;
}): {
  statusKo: string;
  approvedAt: string;
  approvedBy: string;
  requestActionKo: string;
  workflowStatusKo: string;
  nextActionKo: string;
  approvalDoesNotStartLiveKo: string;
  autoApproved: false;
  impliesLiveActive: false;
} {
  const workflowStatusKo = liveGateWorkflowStatusLabel(input.workflowStatus);
  const canRequest = input.canRequest === true;
  const mismatch =
    input.verifiedForLive === true && input.validForCurrentLiveTarget === false;
  return {
    statusKo:
      input.statusLabel?.trim() ||
      (mismatch
        ? input.mismatchReason?.trim() || LIVE_GATE_APPROVAL_MISMATCH
        : input.verifiedForLive === true
          ? "실전 승인 완료"
          : input.verifiedForLive === false
            ? "실전 승인 전"
            : "승인 데이터 없음"),
    approvedAt: liveGateFormatTimestamp(input.approvedAt),
    approvedBy: liveGateIdentityLabel(input.approvedBy),
    requestActionKo: canRequest
      ? LIVE_GATE_APPROVAL_REQUEST_ACTION
      : LIVE_GATE_APPROVAL_REQUEST_UNAVAILABLE,
    workflowStatusKo,
    nextActionKo:
      input.workflowStatus === "pending"
        ? "요청을 승인하거나 거절하세요."
        : canRequest
          ? "대상이 확인되면 실전 승인을 요청할 수 있습니다."
          : "승인 요청 대상이 부족합니다.",
    approvalDoesNotStartLiveKo: LIVE_GATE_APPROVAL_NOT_LIVE_START,
    autoApproved: false,
    impliesLiveActive: false,
  };
}

export function liveGateHistoryRowPresentation(input: {
  status?: LiveGateWorkflowStatus | null;
  strategyId?: string | null;
  requestedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  requestReason?: string | null;
  reviewReason?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
  revokeReason?: string | null;
  requestId?: string | null;
}): {
  statusKo: string;
  strategyId: string;
  requestedAt: string;
  reviewedAt: string;
  reviewedBy: string;
  requestReason: string;
  reviewReason: string;
  revokedAt: string;
  revokedBy: string;
  revokeReason: string;
  requestIdSecondary: string | null;
} {
  return {
    statusKo: liveGateWorkflowStatusLabel(input.status),
    strategyId: input.strategyId?.trim() || LIVE_GATE_UNAVAILABLE,
    requestedAt: liveGateFormatTimestamp(input.requestedAt),
    reviewedAt: liveGateFormatTimestamp(input.reviewedAt),
    reviewedBy: liveGateIdentityLabel(input.reviewedBy),
    requestReason: input.requestReason?.trim() || LIVE_GATE_UNAVAILABLE,
    reviewReason: input.reviewReason?.trim() || LIVE_GATE_UNAVAILABLE,
    revokedAt: liveGateFormatTimestamp(input.revokedAt),
    revokedBy: liveGateIdentityLabel(input.revokedBy),
    revokeReason: input.revokeReason?.trim() || LIVE_GATE_UNAVAILABLE,
    requestIdSecondary: input.requestId?.trim() || null,
  };
}

export function liveGateShortIdentity(value?: string | null): string {
  const raw = value?.trim();
  if (!raw) return LIVE_GATE_UNAVAILABLE;
  if (raw.length <= 16) return raw;
  return `${raw.slice(0, 8)}…${raw.slice(-6)}`;
}

export function liveGateThreeWayTargetMatch(input: {
  reviewStrategyId?: string | null;
  executionStrategyId?: string | null;
  approvedStrategyId?: string | null;
  verifiedForLive?: boolean | null;
}): boolean {
  const review = input.reviewStrategyId?.trim() || "";
  const execution = input.executionStrategyId?.trim() || "";
  const approved =
    input.verifiedForLive === true ? input.approvedStrategyId?.trim() || "" : "";
  if (!review || !execution || !approved) return false;
  return review === execution && execution === approved;
}

export function liveGateTargetAuthorityPresentation(input: {
  verifiedForLive?: boolean | null;
  reviewStrategyId?: string | null;
  approvedStrategyId?: string | null;
  currentStrategyId?: string | null;
  paramsHash?: string | null;
  strategyHash?: string | null;
  backtestRunId?: string | null;
  backtestResultHash?: string | null;
  validForCurrentLiveTarget?: boolean | null;
  mismatchReason?: string | null;
}): {
  reviewStrategyKo: string;
  approvedStrategyKo: string;
  currentStrategyKo: string;
  paramsIdentityKo: string;
  backtestKo: string;
  mismatchKo: string | null;
  showMismatch: boolean;
  threeWayOk: boolean;
  technical: string;
} {
  const review = input.reviewStrategyId?.trim() || "";
  const approvedId = input.approvedStrategyId?.trim() || "";
  const current = input.currentStrategyId?.trim() || "";
  const approved =
    input.verifiedForLive === true
      ? approvedId || LIVE_GATE_UNAVAILABLE
      : LIVE_GATE_UNAVAILABLE;
  const threeWayOk = liveGateThreeWayTargetMatch({
    reviewStrategyId: review,
    executionStrategyId: current,
    approvedStrategyId: approvedId,
    verifiedForLive: input.verifiedForLive,
  });
  const reviewConflict = Boolean(
    (review && !current) ||
      (review && current && review !== current) ||
      (input.verifiedForLive === true &&
        approvedId &&
        review &&
        approvedId !== review),
  );
  const approvalConflict = Boolean(
    input.verifiedForLive === true &&
      approvedId &&
      current &&
      approvedId !== current,
  );
  const showMismatch =
    reviewConflict ||
    approvalConflict ||
    (input.verifiedForLive === true &&
      input.validForCurrentLiveTarget === false &&
      Boolean(approvedId && current));
  return {
    reviewStrategyKo: review || LIVE_GATE_UNAVAILABLE,
    approvedStrategyKo: approved,
    currentStrategyKo: current || LIVE_GATE_UNAVAILABLE,
    paramsIdentityKo: liveGateShortIdentity(input.paramsHash),
    backtestKo: input.backtestRunId?.trim() || LIVE_GATE_UNAVAILABLE,
    mismatchKo: showMismatch
      ? reviewConflict
        ? LIVE_GATE_THREE_WAY_MISMATCH
        : input.mismatchReason?.trim() || LIVE_GATE_APPROVAL_MISMATCH
      : null,
    showMismatch,
    threeWayOk,
    technical: [
      input.paramsHash ? `paramsHash ${input.paramsHash}` : null,
      input.strategyHash ? `strategyHash ${input.strategyHash}` : null,
      input.backtestResultHash ? `resultHash ${input.backtestResultHash}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export function liveGateExecutionKindLabel(kind?: string | null): string {
  if (kind === "event_sequence") return "이벤트 시퀀스";
  if (kind === "safe_params") return "SAFE 파라미터";
  return LIVE_GATE_UNAVAILABLE;
}

export function liveGateRealOrderCountLabel(count: number | null | undefined): string {
  if (count == null || !Number.isFinite(count)) return LIVE_GATE_UNAVAILABLE;
  return `${Math.max(0, Math.trunc(count))}건`;
}

export function liveGatePresentationContainsSecret(
  output: string,
  secrets: Array<string | null | undefined>,
): boolean {
  return secrets.some((secret) => {
    const value = secret?.trim();
    return Boolean(value && value.length >= 8 && output.includes(value));
  });
}
