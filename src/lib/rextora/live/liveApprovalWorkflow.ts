/**
 * Live operator approval workflow — request / review / history.
 *
 * Canonical Live eligibility remains strategy-live-approval.json
 * (`verifiedForLive`). This module is workflow/audit state only.
 * It does not enable Live flags, start Live, or place orders.
 */

import { randomUUID } from "node:crypto";
import {
  approveStrategyForLive,
  getStrategyLiveApprovalState,
  revokeStrategyLiveApproval,
} from "../strategyLiveApproval";
import { readJsonStore, writeJsonStore } from "../storage/jsonStore";
import { getStrategyById } from "../strategy/strategyStore";
import { isRetiredSafeId } from "../strategy/retiredSafeBaseline";
import { loadSettings } from "../settings/settingsStore";
import {
  captureLiveApprovalTargetIdentity,
  evaluateLiveStartApprovalGate,
  resolveLiveStartTarget,
  type LiveApprovalTarget,
} from "./liveApprovalTarget";

export const LIVE_APPROVAL_HISTORY_FILE = "strategy-live-approval-history.json";

export type LiveApprovalRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "revoked";

export type LiveApprovalIdentityAuthority = "unavailable";

export interface LiveApprovalRequestTarget {
  strategyId: string;
  backtestRunId: string | null;
  paperSessionId: string | null;
  symbol: string | null;
}

export interface LiveApprovalRequestRecord extends LiveApprovalRequestTarget {
  requestId: string;
  requestedAt: string;
  requestedBy: string | null;
  requestReason: string | null;
  status: LiveApprovalRequestStatus;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewReason: string | null;
  revokedAt: string | null;
  revokedBy: string | null;
  revokeReason: string | null;
  paramsHash: string;
  strategyHash: string | null;
  backtestResultHash: string | null;
}

export interface LiveApprovalHistoryStore {
  version: 1;
  requests: LiveApprovalRequestRecord[];
}

export interface LiveApprovalWorkflowResult<T = LiveApprovalRequestRecord> {
  ok: boolean;
  code:
    | "ok"
    | "duplicate_pending"
    | "invalid_target"
    | "unknown_target"
    | "invalid_transition"
    | "not_found"
    | "approval_denied"
    | "malformed";
  message: string;
  request: T | null;
  history: LiveApprovalRequestRecord[];
  snapshot: ReturnType<typeof getStrategyLiveApprovalState>;
  conflict: boolean;
  idempotent: boolean;
}

const EMPTY_HISTORY: LiveApprovalHistoryStore = {
  version: 1,
  requests: [],
};

const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const SYMBOL_PATTERN = /^[A-Z0-9]{3,20}$/;

let mutationChain: Promise<void> = Promise.resolve();

function withHistoryLock<T>(fn: () => T): Promise<T> {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = mutationChain;
  mutationChain = previous.then(() => gate);
  return previous.then(() => {
    try {
      return fn();
    } finally {
      release();
    }
  });
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeIdentity(value: unknown): string | null {
  return normalizeOptionalText(value);
}

function readHistory(): LiveApprovalHistoryStore {
  const stored = readJsonStore<LiveApprovalHistoryStore>(
    LIVE_APPROVAL_HISTORY_FILE,
    EMPTY_HISTORY,
    { ttlMs: 0 },
  );
  const requests = Array.isArray(stored.requests) ? stored.requests : [];
  return { version: 1, requests };
}

function writeHistory(store: LiveApprovalHistoryStore): LiveApprovalHistoryStore {
  return writeJsonStore(LIVE_APPROVAL_HISTORY_FILE, {
    version: 1 as const,
    requests: store.requests,
  });
}

function sortHistoryNewestFirst(
  requests: LiveApprovalRequestRecord[],
): LiveApprovalRequestRecord[] {
  return requests
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      if (a.row.requestedAt !== b.row.requestedAt) {
        return a.row.requestedAt < b.row.requestedAt ? 1 : -1;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.row);
}

function targetKey(target: LiveApprovalRequestTarget): string {
  return [
    target.strategyId,
    target.backtestRunId ?? "",
    target.paperSessionId ?? "",
    target.symbol ?? "",
  ].join("\u0001");
}

function validateOptionalId(
  value: unknown,
  field: string,
): { ok: true; value: string | null } | { ok: false; message: string } {
  if (value == null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") {
    return { ok: false, message: `${field}가 올바르지 않습니다.` };
  }
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!ID_PATTERN.test(trimmed)) {
    return { ok: false, message: `${field} 형식이 올바르지 않습니다.` };
  }
  return { ok: true, value: trimmed };
}

export function parseLiveApprovalTarget(input: {
  strategyId?: unknown;
  backtestRunId?: unknown;
  paperSessionId?: unknown;
  symbol?: unknown;
}):
  | { ok: true; target: LiveApprovalRequestTarget }
  | { ok: false; code: "malformed" | "invalid_target"; message: string } {
  if (typeof input.strategyId !== "string" || !input.strategyId.trim()) {
    return {
      ok: false,
      code: "invalid_target",
      message: "전략 고유번호가 필요합니다.",
    };
  }
  const strategyId = input.strategyId.trim();
  if (!ID_PATTERN.test(strategyId)) {
    return {
      ok: false,
      code: "malformed",
      message: "전략 고유번호 형식이 올바르지 않습니다.",
    };
  }
  const backtest = validateOptionalId(input.backtestRunId, "Backtest run ID");
  if (!backtest.ok) return { ok: false, code: "malformed", message: backtest.message };
  const paper = validateOptionalId(input.paperSessionId, "Paper session ID");
  if (!paper.ok) return { ok: false, code: "malformed", message: paper.message };
  let symbol: string | null = null;
  if (input.symbol != null && input.symbol !== "") {
    if (typeof input.symbol !== "string") {
      return { ok: false, code: "malformed", message: "심볼 형식이 올바르지 않습니다." };
    }
    const normalized = input.symbol.trim().toUpperCase();
    if (!SYMBOL_PATTERN.test(normalized)) {
      return { ok: false, code: "malformed", message: "심볼 형식이 올바르지 않습니다." };
    }
    symbol = normalized;
  }
  return {
    ok: true,
    target: {
      strategyId,
      backtestRunId: backtest.value,
      paperSessionId: paper.value,
      symbol,
    },
  };
}

export function isKnownLiveApprovalStrategy(strategyId: string): boolean {
  if (!strategyId || isRetiredSafeId(strategyId)) return false;
  try {
    return Boolean(getStrategyById(strategyId));
  } catch {
    return false;
  }
}

function fail<T = LiveApprovalRequestRecord>(
  code: LiveApprovalWorkflowResult<T>["code"],
  message: string,
  extra?: Partial<LiveApprovalWorkflowResult<T>>,
): LiveApprovalWorkflowResult<T> {
  const history = listLiveApprovalHistory();
  return {
    ok: false,
    code,
    message,
    request: extra?.request ?? null,
    history,
    snapshot: getStrategyLiveApprovalState(),
    conflict: extra?.conflict ?? false,
    idempotent: extra?.idempotent ?? false,
  };
}

export function listLiveApprovalHistory(): LiveApprovalRequestRecord[] {
  return sortHistoryNewestFirst(readHistory().requests);
}

export function getLiveApprovalRequest(
  requestId: string,
): LiveApprovalRequestRecord | null {
  const id = requestId.trim();
  if (!id) return null;
  return readHistory().requests.find((row) => row.requestId === id) ?? null;
}

export function findPendingLiveApprovalRequest(
  target: LiveApprovalRequestTarget,
): LiveApprovalRequestRecord | null {
  const key = targetKey(target);
  return (
    readHistory().requests.find(
      (row) => row.status === "pending" && targetKey(row) === key,
    ) ?? null
  );
}

export function getLatestLiveApprovalRequest(): LiveApprovalRequestRecord | null {
  return listLiveApprovalHistory()[0] ?? null;
}

function replaceRequest(
  request: LiveApprovalRequestRecord,
): LiveApprovalRequestRecord {
  const store = readHistory();
  const index = store.requests.findIndex((row) => row.requestId === request.requestId);
  if (index < 0) {
    store.requests = [request, ...store.requests];
  } else {
    store.requests[index] = request;
  }
  writeHistory(store);
  return request;
}

export async function requestLiveApproval(input: {
  strategyId?: unknown;
  backtestRunId?: unknown;
  paperSessionId?: unknown;
  symbol?: unknown;
  requestReason?: unknown;
  requestedBy?: unknown;
}): Promise<LiveApprovalWorkflowResult> {
  return withHistoryLock(() => {
    const parsed = parseLiveApprovalTarget(input);
    if (!parsed.ok) {
      return fail(parsed.code, parsed.message);
    }
    if (!isKnownLiveApprovalStrategy(parsed.target.strategyId)) {
      return fail("unknown_target", "알 수 없는 전략입니다. 요청을 만들지 않았습니다.");
    }
    const captured = captureLiveApprovalTargetIdentity(parsed.target);
    if (!captured.ok) {
      return fail("invalid_target", captured.message);
    }
    const existing = findPendingLiveApprovalRequest(parsed.target);
    if (existing) {
      return {
        ok: true,
        code: "duplicate_pending",
        message: "동일한 대상의 대기 중인 승인 요청이 이미 있습니다.",
        request: existing,
        history: listLiveApprovalHistory(),
        snapshot: getStrategyLiveApprovalState(),
        conflict: true,
        idempotent: true,
      };
    }
    const now = new Date().toISOString();
    const request: LiveApprovalRequestRecord = {
      ...parsed.target,
      paramsHash: captured.target.paramsHash,
      strategyHash: captured.target.strategyHash ?? null,
      backtestResultHash: captured.target.backtestResultHash ?? null,
      requestId: `lar_${randomUUID()}`,
      requestedAt: now,
      requestedBy: normalizeIdentity(input.requestedBy),
      requestReason: normalizeOptionalText(input.requestReason),
      status: "pending",
      reviewedAt: null,
      reviewedBy: null,
      reviewReason: null,
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
    };
    const store = readHistory();
    writeHistory({ version: 1, requests: [request, ...store.requests] });
    return {
      ok: true,
      code: "ok",
      message: "실전 승인 요청이 접수되었습니다. 실전 매매는 시작되지 않았습니다.",
      request,
      history: listLiveApprovalHistory(),
      snapshot: getStrategyLiveApprovalState(),
      conflict: false,
      idempotent: false,
    };
  });
}

export async function approveLiveApprovalRequest(input: {
  requestId?: unknown;
  confirmationText?: unknown;
  reviewedBy?: unknown;
  reviewReason?: unknown;
}): Promise<LiveApprovalWorkflowResult> {
  return withHistoryLock(() => {
    const requestId = normalizeOptionalText(input.requestId);
    if (!requestId) {
      return fail("malformed", "승인할 요청 고유번호가 필요합니다.");
    }
    const current = getLiveApprovalRequest(requestId);
    if (!current) {
      return fail("not_found", "승인 요청을 찾을 수 없습니다.");
    }
    if (current.status === "approved") {
      return {
        ok: true,
        code: "ok",
        message: "이미 승인된 요청입니다.",
        request: current,
        history: listLiveApprovalHistory(),
        snapshot: getStrategyLiveApprovalState(),
        conflict: false,
        idempotent: true,
      };
    }
    if (current.status !== "pending") {
      return fail("invalid_transition", "대기 중인 요청만 승인할 수 있습니다.", {
        request: current,
      });
    }
    if (!current.paramsHash?.trim()) {
      return fail("invalid_target", "요청에 전략 파라미터 신원이 없습니다.", {
        request: current,
      });
    }
    const confirmationText =
      typeof input.confirmationText === "string" ? input.confirmationText : "";
    const reviewedBy = normalizeIdentity(input.reviewedBy);
    const immutableTarget: LiveApprovalTarget = {
      strategyId: current.strategyId,
      paramsHash: current.paramsHash,
      strategyHash: current.strategyHash,
      symbol: current.symbol,
      backtestRunId: current.backtestRunId,
      backtestResultHash: current.backtestResultHash,
      paperSessionId: current.paperSessionId,
    };
    const canonical = approveStrategyForLive(
      confirmationText,
      reviewedBy ?? undefined,
      immutableTarget,
    );
    if (!canonical.ok) {
      return fail("approval_denied", canonical.message, { request: current });
    }
    const reviewedAt = canonical.state.approvedAt ?? new Date().toISOString();
    const next: LiveApprovalRequestRecord = {
      ...current,
      status: "approved",
      reviewedAt,
      reviewedBy,
      reviewReason: normalizeOptionalText(input.reviewReason),
    };
    replaceRequest(next);
    return {
      ok: true,
      code: "ok",
      message: canonical.message,
      request: next,
      history: listLiveApprovalHistory(),
      snapshot: getStrategyLiveApprovalState(),
      conflict: false,
      idempotent: false,
    };
  });
}

export async function rejectLiveApprovalRequest(input: {
  requestId?: unknown;
  reviewedBy?: unknown;
  reviewReason?: unknown;
}): Promise<LiveApprovalWorkflowResult> {
  return withHistoryLock(() => {
    const requestId = normalizeOptionalText(input.requestId);
    if (!requestId) {
      return fail("malformed", "거절할 요청 고유번호가 필요합니다.");
    }
    const current = getLiveApprovalRequest(requestId);
    if (!current) {
      return fail("not_found", "승인 요청을 찾을 수 없습니다.");
    }
    if (current.status === "rejected") {
      return {
        ok: true,
        code: "ok",
        message: "이미 거절된 요청입니다.",
        request: current,
        history: listLiveApprovalHistory(),
        snapshot: getStrategyLiveApprovalState(),
        conflict: false,
        idempotent: true,
      };
    }
    if (current.status !== "pending") {
      return fail("invalid_transition", "대기 중인 요청만 거절할 수 있습니다.", {
        request: current,
      });
    }
    const next: LiveApprovalRequestRecord = {
      ...current,
      status: "rejected",
      reviewedAt: new Date().toISOString(),
      reviewedBy: normalizeIdentity(input.reviewedBy),
      reviewReason: normalizeOptionalText(input.reviewReason),
    };
    replaceRequest(next);
    return {
      ok: true,
      code: "ok",
      message: "실전 승인 요청이 거절되었습니다. 실전 권한은 부여되지 않았습니다.",
      request: next,
      history: listLiveApprovalHistory(),
      snapshot: getStrategyLiveApprovalState(),
      conflict: false,
      idempotent: false,
    };
  });
}

export async function revokeLiveApprovalRequest(input: {
  requestId?: unknown;
  revokedBy?: unknown;
  revokeReason?: unknown;
}): Promise<LiveApprovalWorkflowResult> {
  return withHistoryLock(() => {
    const requestId = normalizeOptionalText(input.requestId);
    const revokedBy = normalizeIdentity(input.revokedBy);
    const revokeReason = normalizeOptionalText(input.revokeReason);
    if (requestId) {
      const current = getLiveApprovalRequest(requestId);
      if (!current) {
        return fail("not_found", "승인 요청을 찾을 수 없습니다.");
      }
      if (current.status === "revoked") {
        return {
          ok: true,
          code: "ok",
          message: "이미 철회된 요청입니다.",
          request: current,
          history: listLiveApprovalHistory(),
          snapshot: getStrategyLiveApprovalState(),
          conflict: false,
          idempotent: true,
        };
      }
      if (current.status !== "approved") {
        return fail("invalid_transition", "승인된 요청만 철회할 수 있습니다.", {
          request: current,
        });
      }
      const snapshotNow = getStrategyLiveApprovalState();
      const approvedId = snapshotNow.target?.strategyId ?? snapshotNow.strategyId;
      const matchesCurrent =
        snapshotNow.verifiedForLive === true && approvedId === current.strategyId;
      const snapshot = matchesCurrent
        ? revokeStrategyLiveApproval(revokedBy ?? undefined)
        : snapshotNow;
      const next: LiveApprovalRequestRecord = {
        ...current,
        status: "revoked",
        revokedAt: new Date().toISOString(),
        revokedBy,
        revokeReason,
      };
      replaceRequest(next);
      return {
        ok: true,
        code: "ok",
        message: "실전 승인이 철회되었습니다. 실전 매매는 시작되지 않았습니다.",
        request: next,
        history: listLiveApprovalHistory(),
        snapshot,
        conflict: false,
        idempotent: false,
      };
    }
    const latestApproved = listLiveApprovalHistory().find(
      (row) => row.status === "approved",
    );
    const snapshot = revokeStrategyLiveApproval(revokedBy ?? undefined);
    if (latestApproved) {
      const next: LiveApprovalRequestRecord = {
        ...latestApproved,
        status: "revoked",
        revokedAt: new Date().toISOString(),
        revokedBy,
        revokeReason,
      };
      replaceRequest(next);
      return {
        ok: true,
        code: "ok",
        message: "실전 승인이 철회되었습니다. 실전 매매는 시작되지 않았습니다.",
        request: next,
        history: listLiveApprovalHistory(),
        snapshot,
        conflict: false,
        idempotent: false,
      };
    }
    return {
      ok: true,
      code: "ok",
      message: "전략 실전 승인이 해제되었습니다.",
      request: null,
      history: listLiveApprovalHistory(),
      snapshot,
      conflict: false,
      idempotent: false,
    };
  });
}

export function getLiveApprovalWorkflowView(): {
  snapshot: ReturnType<typeof getStrategyLiveApprovalState>;
  pending: LiveApprovalRequestRecord | null;
  latest: LiveApprovalRequestRecord | null;
  history: LiveApprovalRequestRecord[];
  identityAuthority: LiveApprovalIdentityAuthority;
  liveFlags: {
    liveTradingEnabled: boolean;
    allowLiveTrading: boolean;
  };
  liveStartTarget: ReturnType<typeof resolveLiveStartTarget>;
  approvalValidation: ReturnType<typeof evaluateLiveStartApprovalGate>;
} {
  const history = listLiveApprovalHistory();
  const snapshot = getStrategyLiveApprovalState();
  return {
    snapshot,
    pending: history.find((row) => row.status === "pending") ?? null,
    latest: history[0] ?? null,
    history,
    identityAuthority: "unavailable",
    liveFlags: {
      liveTradingEnabled: loadSettings().trading.liveTradingEnabled === true,
      allowLiveTrading: loadSettings().trading.allowLiveTrading === true,
    },
    liveStartTarget: resolveLiveStartTarget(),
    approvalValidation: evaluateLiveStartApprovalGate(snapshot),
  };
}
