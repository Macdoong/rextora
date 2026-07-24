/**
 * Live dry-run adapter — persists local execution records only.
 * Never calls Binance or any real exchange adapter.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Execution state machine (dry-run path). */
export type DryRunExecutionState =
  | "SIGNAL_DETECTED"
  | "SIGNAL_VALIDATED"
  | "MARKET_DATA_VALIDATED"
  | "RISK_VALIDATED"
  | "ACCOUNT_VALIDATED"
  | "POSITION_CONFLICT_CHECKED"
  | "ORDER_SIZED"
  | "ORDER_READY"
  | "DRY_RUN_SUBMITTED"
  | "ACKNOWLEDGED"
  | "FILLED"
  | "POSITION_OPEN"
  | "EXIT_PENDING"
  | "CLOSED"
  | "RECONCILED"
  | "REJECTED"
  | "TIMEOUT"
  | "UNKNOWN"
  | "CANCELLED"
  | "EMERGENCY_STOPPED";

export type DryRunOrderSide = "BUY" | "SELL";

export interface DryRunStateTransition {
  executionKey: string;
  previousState: DryRunExecutionState | null;
  newState: DryRunExecutionState;
  timestamp: string;
  reason: string;
  strategyId: string;
  strategyHash: string;
  values?: Record<string, unknown>;
  failure?: string | null;
}

export interface DryRunOrderRecord {
  id: string;
  executionKey: string;
  strategyId: string;
  strategyHash: string;
  symbol: string;
  side: DryRunOrderSide;
  quantity: number;
  state: DryRunExecutionState;
  createdAt: string;
  updatedAt: string;
  adapter: "dry-run";
  exchangeCalled: false;
  blockedReason: string | null;
  /** Persisted state machine history (never skips stages on happy path). */
  transitions: DryRunStateTransition[];
}

/** Happy-path dry-run stages through submission (persisted one-by-one). */
export const DRY_RUN_SUBMIT_PATH: DryRunExecutionState[] = [
  "SIGNAL_DETECTED",
  "SIGNAL_VALIDATED",
  "MARKET_DATA_VALIDATED",
  "RISK_VALIDATED",
  "ACCOUNT_VALIDATED",
  "POSITION_CONFLICT_CHECKED",
  "ORDER_SIZED",
  "ORDER_READY",
  "DRY_RUN_SUBMITTED",
];

export interface DryRunSessionState {
  version: 1;
  emergencyStopped: boolean;
  emergencyReason: string | null;
  emergencyAt: string | null;
  updatedAt: string;
}

export interface LiveDryRunStoreOptions {
  /** Injectable root for tests. Default: data/rextora/live-dry-run */
  rootDir?: string;
}

export class LiveDryRunError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "LiveDryRunError";
    this.code = code;
  }
}

function defaultRoot(): string {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "rextora",
    "live-dry-run",
  );
}

function resolveRoot(options?: LiveDryRunStoreOptions): string {
  return path.resolve(options?.rootDir ?? defaultRoot());
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso(): string {
  return new Date().toISOString();
}

function sessionPath(root: string): string {
  return path.join(root, "session.json");
}

function ordersDir(root: string): string {
  return path.join(root, "orders");
}

function orderPath(root: string, executionKey: string): string {
  const safe = executionKey.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 180);
  if (!safe) {
    throw new LiveDryRunError("executionKey required", "INVALID_KEY");
  }
  return path.join(ordersDir(root), `${safe}.json`);
}

function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  fs.renameSync(tmp, filePath);
}

function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function defaultSession(): DryRunSessionState {
  return {
    version: 1,
    emergencyStopped: false,
    emergencyReason: null,
    emergencyAt: null,
    updatedAt: nowIso(),
  };
}

export function getDryRunSession(
  options?: LiveDryRunStoreOptions,
): DryRunSessionState {
  const root = resolveRoot(options);
  return readJson(sessionPath(root), defaultSession());
}

function saveSession(
  root: string,
  session: DryRunSessionState,
): DryRunSessionState {
  const next = { ...session, updatedAt: nowIso() };
  writeJson(sessionPath(root), next);
  return next;
}

export function getDryRunOrderByKey(
  executionKey: string,
  options?: LiveDryRunStoreOptions,
): DryRunOrderRecord | null {
  const root = resolveRoot(options);
  const fp = orderPath(root, executionKey);
  return readJson<DryRunOrderRecord | null>(fp, null);
}

/**
 * Submit a dry-run order. Idempotent on executionKey.
 * Never calls Binance / exchange adapters.
 */
export function submitDryRunOrder(
  input: {
    executionKey: string;
    strategyId: string;
    strategyHash: string;
    symbol: string;
    side: DryRunOrderSide;
    quantity: number;
  },
  options?: LiveDryRunStoreOptions,
): DryRunOrderRecord {
  const executionKey = input.executionKey?.trim();
  if (!executionKey) {
    throw new LiveDryRunError("executionKey required", "INVALID_KEY");
  }
  if (!input.strategyId?.trim()) {
    throw new LiveDryRunError("strategyId required", "INVALID_STRATEGY");
  }
  if (!input.symbol?.trim()) {
    throw new LiveDryRunError("symbol required", "INVALID_SYMBOL");
  }
  if (input.side !== "BUY" && input.side !== "SELL") {
    throw new LiveDryRunError("side must be BUY|SELL", "INVALID_SIDE");
  }
  if (!(typeof input.quantity === "number") || !(input.quantity > 0)) {
    throw new LiveDryRunError("quantity must be > 0", "INVALID_QUANTITY");
  }

  const root = resolveRoot(options);
  ensureDir(root);
  ensureDir(ordersDir(root));

  const existing = getDryRunOrderByKey(executionKey, options);
  if (existing) return existing;

  const session = getDryRunSession(options);
  if (session.emergencyStopped) {
    const now = nowIso();
    const blocked: DryRunOrderRecord = {
      id: `dry_${crypto.randomUUID()}`,
      executionKey,
      strategyId: input.strategyId,
      strategyHash: input.strategyHash,
      symbol: input.symbol.toUpperCase(),
      side: input.side,
      quantity: input.quantity,
      state: "EMERGENCY_STOPPED",
      createdAt: now,
      updatedAt: now,
      adapter: "dry-run",
      exchangeCalled: false,
      blockedReason: session.emergencyReason ?? "emergency stop active",
      transitions: [
        {
          executionKey,
          previousState: null,
          newState: "EMERGENCY_STOPPED",
          timestamp: now,
          reason: session.emergencyReason ?? "emergency stop active",
          strategyId: input.strategyId,
          strategyHash: input.strategyHash,
          failure: "EMERGENCY_STOPPED",
        },
      ],
    };
    writeJson(orderPath(root, executionKey), blocked);
    appendAudit(root, blocked.transitions[0]!);
    return blocked;
  }

  const now = nowIso();
  const transitions: DryRunStateTransition[] = [];
  let previous: DryRunExecutionState | null = null;
  for (const newState of DRY_RUN_SUBMIT_PATH) {
    const ts = nowIso();
    transitions.push({
      executionKey,
      previousState: previous,
      newState,
      timestamp: ts,
      reason: `dry-run advance → ${newState}`,
      strategyId: input.strategyId,
      strategyHash: input.strategyHash,
      values: {
        symbol: input.symbol.toUpperCase(),
        side: input.side,
        quantity: input.quantity,
      },
      failure: null,
    });
    previous = newState;
  }

  const record: DryRunOrderRecord = {
    id: `dry_${crypto.randomUUID()}`,
    executionKey,
    strategyId: input.strategyId,
    strategyHash: input.strategyHash,
    symbol: input.symbol.toUpperCase(),
    side: input.side,
    quantity: input.quantity,
    state: "DRY_RUN_SUBMITTED",
    createdAt: now,
    updatedAt: nowIso(),
    adapter: "dry-run",
    exchangeCalled: false,
    blockedReason: null,
    transitions,
  };
  writeJson(orderPath(root, executionKey), record);
  for (const t of transitions) appendAudit(root, t);
  return record;
}

function auditDir(root: string): string {
  return path.join(root, "audit");
}

function appendAudit(root: string, transition: DryRunStateTransition): void {
  ensureDir(auditDir(root));
  const file = path.join(
    auditDir(root),
    `${transition.executionKey}_${transition.newState}_${Date.now()}.json`,
  );
  writeJson(file, transition);
}

/**
 * Advance a dry-run order through post-submit lifecycle (fill → close → reconcile).
 * Never calls exchange adapters.
 */
export function advanceDryRunOrder(
  executionKey: string,
  nextState: DryRunExecutionState,
  reason: string,
  options?: LiveDryRunStoreOptions,
): DryRunOrderRecord {
  const root = resolveRoot(options);
  const existing = getDryRunOrderByKey(executionKey, options);
  if (!existing) {
    throw new LiveDryRunError("order not found", "NOT_FOUND");
  }
  if (existing.state === nextState) return existing;
  const now = nowIso();
  const transition: DryRunStateTransition = {
    executionKey,
    previousState: existing.state,
    newState: nextState,
    timestamp: now,
    reason,
    strategyId: existing.strategyId,
    strategyHash: existing.strategyHash,
    failure:
      nextState === "REJECTED" ||
      nextState === "TIMEOUT" ||
      nextState === "CANCELLED" ||
      nextState === "EMERGENCY_STOPPED"
        ? reason
        : null,
  };
  const next: DryRunOrderRecord = {
    ...existing,
    state: nextState,
    updatedAt: now,
    transitions: [...(existing.transitions ?? []), transition],
    blockedReason:
      nextState === "EMERGENCY_STOPPED" || nextState === "REJECTED"
        ? reason
        : existing.blockedReason,
  };
  writeJson(orderPath(root, executionKey), next);
  appendAudit(root, transition);
  return next;
}

/**
 * Mark dry-run session as emergency-stopped and block new entries.
 */
export function emergencyStopDryRun(
  input: { reason?: string },
  options?: LiveDryRunStoreOptions,
): DryRunSessionState {
  const root = resolveRoot(options);
  ensureDir(root);
  const now = nowIso();
  return saveSession(root, {
    version: 1,
    emergencyStopped: true,
    emergencyReason: input.reason?.trim() || "operator emergency stop",
    emergencyAt: now,
    updatedAt: now,
  });
}

/**
 * Explicit reactivation after emergency stop — required before new dry-run entries.
 */
export function clearDryRunEmergencyStop(
  options?: LiveDryRunStoreOptions,
): DryRunSessionState {
  const root = resolveRoot(options);
  ensureDir(root);
  return saveSession(root, defaultSession());
}

export interface DryRunReconcileResult {
  ok: true;
  local: {
    emergencyStopped: boolean;
    orderCount: number;
    openCount: number;
  };
  adapter: {
    kind: "dry-run";
    emergencyStopped: boolean;
    orderCount: number;
    openCount: number;
  };
  matched: boolean;
  messageKo: string;
}

/**
 * Reconcile local dry-run state vs adapter (identical for dry-run).
 */
export function reconcileDryRun(
  options?: LiveDryRunStoreOptions,
): DryRunReconcileResult {
  const root = resolveRoot(options);
  const session = getDryRunSession(options);
  const dir = ordersDir(root);
  let orderCount = 0;
  let openCount = 0;
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      orderCount += 1;
      const rec = readJson<DryRunOrderRecord | null>(
        path.join(dir, name),
        null,
      );
      if (
        rec &&
        (rec.state === "DRY_RUN_SUBMITTED" ||
          rec.state === "ACKNOWLEDGED" ||
          rec.state === "FILLED" ||
          rec.state === "POSITION_OPEN" ||
          rec.state === "EXIT_PENDING")
      ) {
        openCount += 1;
      }
    }
  }

  const snapshot = {
    emergencyStopped: session.emergencyStopped,
    orderCount,
    openCount,
  };

  return {
    ok: true,
    local: snapshot,
    adapter: { kind: "dry-run", ...snapshot },
    matched: true,
    messageKo: "드라이런 로컬·어댑터 상태가 일치합니다. 거래소 호출은 없습니다.",
  };
}
