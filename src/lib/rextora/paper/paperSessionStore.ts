/**
 * Paper trading session persistence — AUTHORITATIVE commercial session ledger.
 * Writes only under data/rextora/paper-sessions/ — never touches SAFE strategy files.
 *
 * Schema version 2 expands identity + lifecycle fields. On read, v1 records migrate
 * deterministically via migratePaperSessionRecord (idempotent).
 *
 * @deprecated Direct createPaperSession({…}) that jumps to "active" is replaced by
 * preparePaperSession → approveAndStartPaperSession in paperSessionService.
 * Legacy createPaperSession remains as prepare+approve without executor start for
 * store-level tests; commercial API/UI must use paperSessionService.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  getStrategyById,
  setPaperActiveStrategy,
} from "../strategy/strategyStore";
import { isRetiredSafeFileName, isRetiredSafeId } from "../strategy/retiredSafeBaseline";
import {
  storedToDefinition,
  type StoredStrategyV1,
} from "../strategy/definition/bridge";
import { computeStrategyHash } from "../strategy/strategyHash";
import { paperSessionsRootDefault } from "../storage/runtimePaths";
import { assertTestStoreIsNotProduction } from "../storage/testStoreGuard";
import type { EventSequenceCostModel } from "../strategy/eventSequenceCostModel";
import { snapshotPaperEventSequenceCostIfMissing } from "./paperEventSequenceCostModel";
import type { PaperEventSequenceCostAssumptions } from "./paperEventSequenceCostModel";
import type { PaperEventSequenceCostModelStatus } from "./paperEventSequenceCostLabels";

/** Canonical commercial Paper session status. */
export type PaperSessionStatus =
  | "pending_approval"
  | "ready"
  | "active"
  | "paused"
  | "risk_halted"
  | "stopped"
  | "failed";

export const PAPER_SESSION_SCHEMA_VERSION = 2 as const;

export type PaperExecutionMode = "paper";

export interface PaperSession {
  schemaVersion: typeof PAPER_SESSION_SCHEMA_VERSION;
  /** Alias of id for commercial contract. */
  sessionId: string;
  id: string;
  strategyId: string;
  strategyHash: string;
  /** Strategy params hash captured at session creation (never substitutes strategyHash). */
  paramsHash: string;
  /** Search candidate identity captured at promotion, when applicable. */
  sourceParamsHash: string | null;
  sourceResearchJobId: string | null;
  sourceTrialIteration: number | null;
  backtestRunId: string | null;
  /** @deprecated Prefer backtestRunId — kept for v1 read compatibility. */
  backtestResultId: string | null;
  /** @deprecated Prefer sourceResearchJobId. */
  linkedJobId: string | null;
  strategyName: string;
  displayAliasSnapshot: string | null;
  displayNameSnapshot: string | null;
  status: PaperSessionStatus;
  mode: PaperExecutionMode;
  /** Always false for Paper — no real exchange client calls. */
  exchangeCalled: false;
  symbol: string | null;
  timeframe: string | null;
  createdAt: string;
  startedAt: string | null;
  pausedAt: string | null;
  resumedAt: string | null;
  stoppedAt: string | null;
  updatedAt: string;
  heartbeatAt: string | null;
  stopReason: string | null;
  lastError: string | null;
  version: number;
  virtualBalance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  tradeCount: number;
  signalCount: number;
  drawdown: number;
  /**
   * SAFE close IDs already applied to this session ledger.
   * Prevents double tradeCount / realizedPnl increments.
   */
  accountedCloseIds?: string[];
  /**
   * Persisted Event-Sequence cost model for Pattern Paper.
   * Absent on pre-A8.3 sessions — do not infer today's canonical default.
   */
  eventSequenceCostModel?: EventSequenceCostModel | null;
  eventSequenceCostModelStatus?: PaperEventSequenceCostModelStatus;
  eventSequenceCostAssumptions?: PaperEventSequenceCostAssumptions;
  /** Set when a v1 record was migrated. */
  migrationAudit?: {
    fromSchemaVersion: number;
    migratedAt: string;
    notes: string[];
  };
}

export interface PaperSessionStoreOptions {
  rootDir?: string;
}

export class PaperSessionError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PaperSessionError";
    this.code = code;
  }
}

const DEFAULT_VIRTUAL_BALANCE = 10_000;

const TERMINAL: ReadonlySet<PaperSessionStatus> = new Set(["stopped", "failed"]);

/** Non-terminal sessions that own the commercial "current" slot. */
const CURRENT: ReadonlySet<PaperSessionStatus> = new Set([
  "pending_approval",
  "ready",
  "active",
  "paused",
  "risk_halted",
]);

/** Session capital displayed and used for SAFE Paper sizing. */
export function paperSessionCapitalUsdt(
  session: Pick<PaperSession, "virtualBalance" | "realizedPnl">,
): number {
  return Number((session.virtualBalance + session.realizedPnl).toFixed(8));
}

/**
 * Operator-facing runtime truth for Paper UI / read models.
 * active = executor may scan. risk_halted = halted, explicit resume required.
 */
export function paperSessionOperatorView(session: PaperSession): {
  scanning: boolean;
  resumable: boolean;
  haltReason: string | null;
  requiresOperatorAction: boolean;
  resumeRequiresOperator: true;
} {
  const haltReason =
    session.status === "risk_halted"
      ? session.lastError ?? session.stopReason ?? "리스크 한도 위반"
      : null;
  return {
    scanning: session.status === "active",
    resumable: session.status === "paused" || session.status === "risk_halted",
    haltReason,
    requiresOperatorAction:
      session.status === "paused" || session.status === "risk_halted",
    resumeRequiresOperator: true,
  };
}

function defaultRoot(): string {
  if (process.env.REXTORA_PAPER_SESSIONS_DIR) {
    return path.resolve(process.env.REXTORA_PAPER_SESSIONS_DIR);
  }
  return paperSessionsRootDefault();
}

function resolveRoot(options?: PaperSessionStoreOptions): string {
  return path.resolve(options?.rootDir ?? defaultRoot());
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function nowIso(): string {
  return new Date().toISOString();
}

function indexPath(root: string): string {
  return path.join(root, "index.json");
}

function sessionPath(root: string, id: string): string {
  if (!/^paper_[a-zA-Z0-9_-]+$/.test(id)) {
    throw new PaperSessionError("invalid paper session id", "INVALID_ID");
  }
  return path.join(root, `${id}.json`);
}

function writeJson(filePath: string, value: unknown): void {
  assertTestStoreIsNotProduction(filePath);
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

type SessionIndex = {
  version: 1;
  updatedAt: string;
  sessions: Array<{
    id: string;
    strategyId: string;
    status: PaperSessionStatus;
    updatedAt: string;
  }>;
};

function loadIndex(root: string): SessionIndex {
  return readJson<SessionIndex>(indexPath(root), {
    version: 1,
    updatedAt: nowIso(),
    sessions: [],
  });
}

function saveIndex(root: string, index: SessionIndex): void {
  writeJson(indexPath(root), { ...index, updatedAt: nowIso() });
}

function upsertIndexRow(root: string, session: PaperSession): void {
  const index = loadIndex(root);
  const row = {
    id: session.id,
    strategyId: session.strategyId,
    status: session.status,
    updatedAt: session.updatedAt,
  };
  const idx = index.sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) index.sessions[idx] = row;
  else index.sessions.unshift(row);
  saveIndex(root, index);
}

function assertNotRetiredSafeFileWrite(filePath: string): void {
  const base = path.basename(filePath);
  if (
    isRetiredSafeFileName(base) ||
    isRetiredSafeId(base.replace(/\.json$/i, ""))
  ) {
    throw new PaperSessionError(
      "paper session store must never write retired SAFE strategy file",
      "SAFE_WRITE_BLOCKED",
    );
  }
}

function asStatus(raw: unknown): PaperSessionStatus | null {
  if (
    raw === "pending_approval" ||
    raw === "ready" ||
    raw === "active" ||
    raw === "paused" ||
    raw === "risk_halted" ||
    raw === "stopped" ||
    raw === "failed"
  ) {
    return raw;
  }
  return null;
}

/**
 * Deterministic idempotent migration from legacy v1 (or partial) records to schema v2.
 * Never starts a migrated session. Preserves stopped/paused/active states.
 */
export function migratePaperSessionRecord(
  raw: Record<string, unknown>,
): PaperSession {
  const notes: string[] = [];
  const fromVersion =
    typeof raw.schemaVersion === "number" && Number.isFinite(raw.schemaVersion)
      ? Math.trunc(raw.schemaVersion)
      : 1;

  const id =
    typeof raw.id === "string" && raw.id.startsWith("paper_")
      ? raw.id
      : typeof raw.sessionId === "string" && raw.sessionId.startsWith("paper_")
        ? raw.sessionId
        : null;
  if (!id) {
    throw new PaperSessionError("corrupted session: missing id", "CORRUPT_SESSION");
  }

  const status = asStatus(raw.status);
  if (!status) {
    throw new PaperSessionError(
      `corrupted session: invalid status ${String(raw.status)}`,
      "CORRUPT_SESSION",
    );
  }

  const strategyId =
    typeof raw.strategyId === "string" && raw.strategyId.trim()
      ? raw.strategyId.trim()
      : null;
  if (!strategyId) {
    throw new PaperSessionError(
      "corrupted session: missing strategyId",
      "CORRUPT_SESSION",
    );
  }

  const strategyHash =
    typeof raw.strategyHash === "string" && raw.strategyHash.trim()
      ? raw.strategyHash
      : null;
  if (!strategyHash) {
    throw new PaperSessionError(
      "corrupted session: missing strategyHash",
      "CORRUPT_SESSION",
    );
  }

  const backtestRunId =
    (typeof raw.backtestRunId === "string" ? raw.backtestRunId : null) ??
    (typeof raw.backtestResultId === "string" ? raw.backtestResultId : null);

  const sourceResearchJobId =
    (typeof raw.sourceResearchJobId === "string"
      ? raw.sourceResearchJobId
      : null) ??
    (typeof raw.linkedJobId === "string" ? raw.linkedJobId : null);

  if (raw.backtestResultId && !raw.backtestRunId) {
    notes.push("mapped backtestResultId → backtestRunId");
  }
  if (raw.linkedJobId && !raw.sourceResearchJobId) {
    notes.push("mapped linkedJobId → sourceResearchJobId");
  }
  if (fromVersion < PAPER_SESSION_SCHEMA_VERSION) {
    notes.push(`migrated schema ${fromVersion} → ${PAPER_SESSION_SCHEMA_VERSION}`);
  }

  const createdAt =
    typeof raw.createdAt === "string"
      ? raw.createdAt
      : typeof raw.startedAt === "string"
        ? raw.startedAt
        : typeof raw.updatedAt === "string"
          ? raw.updatedAt
          : nowIso();

  const startedAt =
    typeof raw.startedAt === "string"
      ? raw.startedAt
      : status === "active" ||
          status === "paused" ||
          status === "risk_halted" ||
          status === "stopped"
        ? createdAt
        : null;

  const paramsHash =
    typeof raw.paramsHash === "string" && raw.paramsHash.trim()
      ? raw.paramsHash
      : typeof raw.sourceParamsHash === "string"
        ? raw.sourceParamsHash
        : "";

  if (!raw.paramsHash) notes.push("paramsHash derived from sourceParamsHash or empty");

  const session: PaperSession = {
    schemaVersion: PAPER_SESSION_SCHEMA_VERSION,
    sessionId: id,
    id,
    strategyId,
    strategyHash,
    paramsHash,
    sourceParamsHash:
      typeof raw.sourceParamsHash === "string" || raw.sourceParamsHash === null
        ? (raw.sourceParamsHash as string | null)
        : null,
    sourceResearchJobId,
    sourceTrialIteration:
      typeof raw.sourceTrialIteration === "number" &&
      Number.isFinite(raw.sourceTrialIteration)
        ? Math.trunc(raw.sourceTrialIteration)
        : null,
    backtestRunId,
    backtestResultId: backtestRunId,
    linkedJobId: sourceResearchJobId,
    strategyName:
      typeof raw.strategyName === "string" ? raw.strategyName : strategyId,
    displayAliasSnapshot:
      typeof raw.displayAliasSnapshot === "string" ||
      raw.displayAliasSnapshot === null
        ? (raw.displayAliasSnapshot as string | null)
        : null,
    displayNameSnapshot:
      typeof raw.displayNameSnapshot === "string" ||
      raw.displayNameSnapshot === null
        ? (raw.displayNameSnapshot as string | null)
        : null,
    status,
    mode: "paper",
    exchangeCalled: false,
    symbol:
      typeof raw.symbol === "string"
        ? raw.symbol.toUpperCase()
        : raw.symbol === null
          ? null
          : null,
    timeframe:
      typeof raw.timeframe === "string"
        ? raw.timeframe
        : raw.timeframe === null
          ? null
          : null,
    createdAt,
    startedAt,
    pausedAt: typeof raw.pausedAt === "string" ? raw.pausedAt : null,
    resumedAt: typeof raw.resumedAt === "string" ? raw.resumedAt : null,
    stoppedAt: typeof raw.stoppedAt === "string" ? raw.stoppedAt : null,
    updatedAt:
      typeof raw.updatedAt === "string" ? raw.updatedAt : createdAt,
    heartbeatAt:
      typeof raw.heartbeatAt === "string" ? raw.heartbeatAt : null,
    stopReason:
      typeof raw.stopReason === "string" ? raw.stopReason : null,
    lastError: typeof raw.lastError === "string" ? raw.lastError : null,
    version:
      typeof raw.version === "number" && Number.isFinite(raw.version)
        ? Math.max(1, Math.trunc(raw.version))
        : 1,
    virtualBalance:
      typeof raw.virtualBalance === "number" && Number.isFinite(raw.virtualBalance)
        ? raw.virtualBalance
        : DEFAULT_VIRTUAL_BALANCE,
    realizedPnl:
      typeof raw.realizedPnl === "number" && Number.isFinite(raw.realizedPnl)
        ? raw.realizedPnl
        : 0,
    unrealizedPnl:
      typeof raw.unrealizedPnl === "number" && Number.isFinite(raw.unrealizedPnl)
        ? raw.unrealizedPnl
        : 0,
    tradeCount:
      typeof raw.tradeCount === "number" && Number.isFinite(raw.tradeCount)
        ? Math.trunc(raw.tradeCount)
        : 0,
    signalCount:
      typeof raw.signalCount === "number" && Number.isFinite(raw.signalCount)
        ? Math.trunc(raw.signalCount)
        : 0,
    drawdown:
      typeof raw.drawdown === "number" && Number.isFinite(raw.drawdown)
        ? raw.drawdown
        : 0,
    accountedCloseIds: Array.isArray(raw.accountedCloseIds)
      ? raw.accountedCloseIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : undefined,
  };

  const persistedModel =
    raw.eventSequenceCostModel === "event_sequence_execution_price_v1" ||
    raw.eventSequenceCostModel === "event_sequence_ledger_v0"
      ? raw.eventSequenceCostModel
      : raw.eventSequenceCostModel === null
        ? null
        : undefined;
  if (persistedModel !== undefined) {
    session.eventSequenceCostModel = persistedModel;
  }
  if (
    raw.eventSequenceCostModelStatus === "not_applicable" ||
    raw.eventSequenceCostModelStatus === "canonical" ||
    raw.eventSequenceCostModelStatus === "legacy" ||
    raw.eventSequenceCostModelStatus === "unresolved"
  ) {
    session.eventSequenceCostModelStatus = raw.eventSequenceCostModelStatus;
  }
  if (
    raw.eventSequenceCostAssumptions &&
    typeof raw.eventSequenceCostAssumptions === "object"
  ) {
    const costs = raw.eventSequenceCostAssumptions as Record<string, unknown>;
    session.eventSequenceCostAssumptions = {
      feeRate:
        typeof costs.feeRate === "number" && Number.isFinite(costs.feeRate)
          ? costs.feeRate
          : 0.0004,
      slippageRate:
        typeof costs.slippageRate === "number" &&
        Number.isFinite(costs.slippageRate)
          ? costs.slippageRate
          : 0.0002,
      fundingRate:
        typeof costs.fundingRate === "number" &&
        Number.isFinite(costs.fundingRate)
          ? costs.fundingRate
          : 0.0001,
      applyFunding: costs.applyFunding === true,
      applySpread: costs.applySpread === true,
      spreadRate:
        typeof costs.spreadRate === "number" && Number.isFinite(costs.spreadRate)
          ? costs.spreadRate
          : 0.0001,
    };
  }

  if (notes.length > 0 && fromVersion < PAPER_SESSION_SCHEMA_VERSION) {
    session.migrationAudit = {
      fromSchemaVersion: fromVersion,
      migratedAt: nowIso(),
      notes,
    };
  } else if (
    raw.migrationAudit &&
    typeof raw.migrationAudit === "object" &&
    raw.migrationAudit !== null
  ) {
    session.migrationAudit = raw.migrationAudit as PaperSession["migrationAudit"];
  }

  return session;
}

function persistSession(root: string, session: PaperSession): PaperSession {
  const fp = sessionPath(root, session.id);
  assertNotRetiredSafeFileWrite(fp);
  const normalized: PaperSession = {
    ...session,
    schemaVersion: PAPER_SESSION_SCHEMA_VERSION,
    sessionId: session.id,
    mode: "paper",
    exchangeCalled: false,
    backtestResultId: session.backtestRunId,
    linkedJobId: session.sourceResearchJobId,
  };
  writeJson(fp, normalized);
  upsertIndexRow(root, normalized);
  return normalized;
}

function readSessionRaw(root: string, id: string): PaperSession | null {
  const fp = sessionPath(root, id);
  if (!fs.existsSync(fp)) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(fs.readFileSync(fp, "utf8")) as Record<string, unknown>;
  } catch {
    throw new PaperSessionError(
      `corrupted session JSON: ${id}`,
      "CORRUPT_SESSION",
    );
  }
  const migrated = migratePaperSessionRecord(parsed);
  // Persist migration when schema advanced (idempotent rewrite).
  if (
    parsed.schemaVersion !== PAPER_SESSION_SCHEMA_VERSION ||
    !parsed.sessionId ||
    !parsed.paramsHash
  ) {
    persistSession(root, migrated);
  }
  return migrated;
}

function bump(session: PaperSession, patch: Partial<PaperSession>): PaperSession {
  return {
    ...session,
    ...patch,
    version: session.version + 1,
    updatedAt: nowIso(),
    sessionId: session.id,
    mode: "paper",
    exchangeCalled: false,
  };
}

function resolveIdentityFromStrategy(strategyId: string): {
  strategy: StoredStrategyV1;
  strategyHash: string;
  paramsHash: string;
  sourceParamsHash: string | null;
  sourceResearchJobId: string | null;
  sourceTrialIteration: number | null;
  strategyName: string;
  displayAliasSnapshot: string | null;
  displayNameSnapshot: string | null;
  timeframe: string | null;
} {
  const strategy = getStrategyById(strategyId);
  if (!strategy) {
    throw new PaperSessionError(
      `strategy not found: ${strategyId}`,
      "STRATEGY_NOT_FOUND",
    );
  }
  const hydrated = getStrategyById(strategy.id) ?? strategy;
  const strategyHash =
    hydrated.strategyHash ??
    computeStrategyHash(storedToDefinition(hydrated as StoredStrategyV1));
  const meta = (hydrated.definition?.metadata ?? {}) as Record<string, unknown>;
  const trial =
    typeof meta.sourceTrialIteration === "number"
      ? Math.trunc(meta.sourceTrialIteration)
      : typeof meta.trialIteration === "number"
        ? Math.trunc(meta.trialIteration)
        : null;
  const jobId =
    typeof meta.sourceResearchJobId === "string"
      ? meta.sourceResearchJobId
      : typeof meta.linkedJobId === "string"
        ? meta.linkedJobId
        : null;

  return {
    strategy: hydrated as StoredStrategyV1,
    strategyHash,
    paramsHash: hydrated.paramsHash ?? "",
    sourceParamsHash: hydrated.sourceParamsHash ?? hydrated.paramsHash ?? null,
    sourceResearchJobId: jobId,
    sourceTrialIteration: trial,
    strategyName:
      hydrated.displayAlias ?? hydrated.displayName ?? hydrated.name,
    displayAliasSnapshot: hydrated.displayAlias ?? null,
    displayNameSnapshot: hydrated.displayName ?? null,
    timeframe:
      typeof hydrated.definition?.timeframe === "string"
        ? hydrated.definition.timeframe
        : null,
  };
}

function stopCurrentNonTerminal(
  options?: PaperSessionStoreOptions,
  exceptId?: string,
): void {
  const current = getCurrentPaperSession(options);
  if (current && current.id !== exceptId && CURRENT.has(current.status)) {
    stopPaperSession(current.id, options, "replaced_by_new_session");
  }
}

export type PreparePaperSessionInput = {
  strategyId: string;
  virtualBalance?: number;
  backtestRunId?: string | null;
  /** @deprecated use backtestRunId */
  backtestResultId?: string | null;
  sourceResearchJobId?: string | null;
  linkedJobId?: string | null;
  sourceTrialIteration?: number | null;
  symbol?: string | null;
  timeframe?: string | null;
  /** When true, status is pending_approval; otherwise ready. */
  requireApproval?: boolean;
};

/**
 * Prepare a Paper session without starting execution.
 * Status: pending_approval | ready.
 */
export function preparePaperSession(
  input: PreparePaperSessionInput,
  options?: PaperSessionStoreOptions,
): PaperSession {
  const strategyId = input.strategyId?.trim();
  if (!strategyId) {
    throw new PaperSessionError("strategyId required", "STRATEGY_REQUIRED");
  }

  const identity = resolveIdentityFromStrategy(strategyId);
  const root = resolveRoot(options);
  ensureDir(root);
  stopCurrentNonTerminal(options);

  // Registry flag is policy/eligibility only — sync to this strategy for UX.
  setPaperActiveStrategy(identity.strategy.id);

  const now = nowIso();
  const backtestRunId =
    input.backtestRunId ?? input.backtestResultId ?? null;
  const sourceResearchJobId =
    input.sourceResearchJobId ??
    input.linkedJobId ??
    identity.sourceResearchJobId;
  const status: PaperSessionStatus = input.requireApproval
    ? "pending_approval"
    : "ready";

  const session: PaperSession = {
    schemaVersion: PAPER_SESSION_SCHEMA_VERSION,
    sessionId: "",
    id: `paper_${crypto.randomUUID()}`,
    strategyId: identity.strategy.id,
    strategyHash: identity.strategyHash,
    paramsHash: identity.paramsHash,
    sourceParamsHash: identity.sourceParamsHash,
    sourceResearchJobId,
    sourceTrialIteration:
      input.sourceTrialIteration ?? identity.sourceTrialIteration,
    backtestRunId,
    backtestResultId: backtestRunId,
    linkedJobId: sourceResearchJobId,
    strategyName: identity.strategyName,
    displayAliasSnapshot: identity.displayAliasSnapshot,
    displayNameSnapshot: identity.displayNameSnapshot,
    status,
    mode: "paper",
    exchangeCalled: false,
    symbol: input.symbol ? String(input.symbol).toUpperCase() : null,
    timeframe: input.timeframe ?? identity.timeframe,
    createdAt: now,
    startedAt: null,
    pausedAt: null,
    resumedAt: null,
    stoppedAt: null,
    updatedAt: now,
    heartbeatAt: null,
    stopReason: null,
    lastError: null,
    version: 1,
    virtualBalance:
      typeof input.virtualBalance === "number" &&
      Number.isFinite(input.virtualBalance)
        ? input.virtualBalance
        : DEFAULT_VIRTUAL_BALANCE,
    realizedPnl: 0,
    unrealizedPnl: 0,
    tradeCount: 0,
    signalCount: 0,
    drawdown: 0,
  };
  const costSnapshot = snapshotPaperEventSequenceCostIfMissing({
    session,
    strategy: identity.strategy as StoredStrategyV1,
  });
  session.eventSequenceCostModel = costSnapshot.eventSequenceCostModel;
  session.eventSequenceCostModelStatus =
    costSnapshot.eventSequenceCostModelStatus;
  session.eventSequenceCostAssumptions =
    costSnapshot.eventSequenceCostAssumptions;
  session.sessionId = session.id;
  return persistSession(root, session);
}

/**
 * Move pending_approval → ready (human reviewed, still not executing).
 */
export function markPaperSessionReady(
  id: string,
  options?: PaperSessionStoreOptions,
): PaperSession {
  const root = resolveRoot(options);
  const session = readSessionRaw(root, id);
  if (!session) {
    throw new PaperSessionError(`session not found: ${id}`, "NOT_FOUND");
  }
  if (session.status === "ready") return session;
  if (session.status !== "pending_approval") {
    throw new PaperSessionError(
      `cannot mark ready from status ${session.status}`,
      "INVALID_STATE",
    );
  }
  return persistSession(
    root,
    bump(session, { status: "ready", lastError: null }),
  );
}

/**
 * Approve and activate a prepared session (ready|pending_approval → active).
 * Does not start the bot executor — paperSessionService owns that boundary.
 */
export function activatePaperSession(
  id: string,
  options?: PaperSessionStoreOptions,
): PaperSession {
  const root = resolveRoot(options);
  const session = readSessionRaw(root, id);
  if (!session) {
    throw new PaperSessionError(`session not found: ${id}`, "NOT_FOUND");
  }
  if (session.status === "active") {
    throw new PaperSessionError(
      "session already active",
      "DUPLICATE_START",
    );
  }
  if (session.status !== "ready" && session.status !== "pending_approval") {
    throw new PaperSessionError(
      `cannot activate from status ${session.status}`,
      "INVALID_STATE",
    );
  }
  // Ensure no other current session remains.
  stopCurrentNonTerminal(options, session.id);
  setPaperActiveStrategy(session.strategyId);
  const now = nowIso();
  const strategy = getStrategyById(session.strategyId) as StoredStrategyV1 | null;
  const snapshotted = snapshotPaperEventSequenceCostIfMissing({
    session,
    strategy,
  });
  return persistSession(
    root,
    bump(snapshotted, {
      status: "active",
      startedAt: session.startedAt ?? now,
      heartbeatAt: now,
      lastError: null,
      stopReason: null,
    }),
  );
}

/**
 * @deprecated Prefer preparePaperSession + activatePaperSession via paperSessionService.
 * Legacy atomic create → active (no executor). Kept for store tests and migration.
 */
export function createPaperSession(
  input: {
    strategyId: string;
    virtualBalance?: number;
    backtestResultId?: string | null;
    linkedJobId?: string | null;
    symbol?: string | null;
  },
  options?: PaperSessionStoreOptions,
): PaperSession {
  const prepared = preparePaperSession(
    {
      strategyId: input.strategyId,
      virtualBalance: input.virtualBalance,
      backtestResultId: input.backtestResultId,
      linkedJobId: input.linkedJobId,
      symbol: input.symbol,
      requireApproval: false,
    },
    options,
  );
  return activatePaperSession(prepared.id, options);
}

/** Current commercial session: pending_approval|ready|active|paused. */
export function getCurrentPaperSession(
  options?: PaperSessionStoreOptions,
): PaperSession | null {
  const root = resolveRoot(options);
  const index = loadIndex(root);
  for (const row of index.sessions) {
    if (!CURRENT.has(row.status as PaperSessionStatus)) continue;
    try {
      const session = readSessionRaw(root, row.id);
      if (session && CURRENT.has(session.status)) return session;
    } catch (err) {
      if (err instanceof PaperSessionError && err.code === "CORRUPT_SESSION") {
        continue;
      }
      throw err;
    }
  }
  return null;
}

/**
 * Execution-eligible session only (status === active).
 * Paused/ready/pending never execute.
 */
export function getExecutablePaperSession(
  options?: PaperSessionStoreOptions,
): PaperSession | null {
  const current = getCurrentPaperSession(options);
  return current?.status === "active" ? current : null;
}

/**
 * Commercial "active slot": active or paused (authoritative after restart).
 * @deprecated Name kept for callers; prefer getCurrentPaperSession / getExecutablePaperSession.
 */
export function getActivePaperSession(
  options?: PaperSessionStoreOptions,
): PaperSession | null {
  const current = getCurrentPaperSession(options);
  if (!current) return null;
  if (current.status === "active" || current.status === "paused") return current;
  // Include ready/pending for UI consumers that previously used "active=1"
  // to mean "current session" — they should migrate to getCurrentPaperSession.
  return current;
}

export function listPaperSessions(
  options?: PaperSessionStoreOptions,
): PaperSession[] {
  const root = resolveRoot(options);
  const index = loadIndex(root);
  const out: PaperSession[] = [];
  for (const row of index.sessions) {
    try {
      const session = readSessionRaw(root, row.id);
      if (session) out.push(session);
    } catch (err) {
      if (err instanceof PaperSessionError && err.code === "CORRUPT_SESSION") {
        continue;
      }
      throw err;
    }
  }
  return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getPaperSession(
  id: string,
  options?: PaperSessionStoreOptions,
): PaperSession | null {
  const root = resolveRoot(options);
  try {
    return readSessionRaw(root, id);
  } catch (err) {
    if (err instanceof PaperSessionError && err.code === "CORRUPT_SESSION") {
      throw err;
    }
    return null;
  }
}

export function pausePaperSession(
  id: string,
  options?: PaperSessionStoreOptions,
): PaperSession {
  const root = resolveRoot(options);
  const session = readSessionRaw(root, id);
  if (!session) {
    throw new PaperSessionError(`session not found: ${id}`, "NOT_FOUND");
  }
  if (TERMINAL.has(session.status)) {
    throw new PaperSessionError(
      "terminal session cannot be paused",
      "INVALID_STATE",
    );
  }
  if (session.status === "paused") {
    throw new PaperSessionError("session already paused", "DUPLICATE_PAUSE");
  }
  if (session.status !== "active") {
    throw new PaperSessionError(
      `cannot pause from status ${session.status}`,
      "INVALID_STATE",
    );
  }
  const now = nowIso();
  return persistSession(
    root,
    bump(session, { status: "paused", pausedAt: now }),
  );
}

/**
 * Risk / emergency halt: session is no longer executable.
 * Explicit operator resume is required. Does not start or resume the executor.
 */
export function haltPaperSessionForRisk(
  id: string,
  lastError: string,
  options?: PaperSessionStoreOptions,
): PaperSession {
  const root = resolveRoot(options);
  const session = readSessionRaw(root, id);
  if (!session) {
    throw new PaperSessionError(`session not found: ${id}`, "NOT_FOUND");
  }
  if (session.status === "risk_halted") {
    return persistSession(
      root,
      bump(session, {
        lastError: lastError || session.lastError,
        stopReason: session.stopReason ?? "risk_halt",
      }),
    );
  }
  if (TERMINAL.has(session.status)) {
    throw new PaperSessionError(
      "terminal session cannot be risk-halted",
      "INVALID_STATE",
    );
  }
  if (session.status !== "active") {
    throw new PaperSessionError(
      `cannot risk-halt from status ${session.status}`,
      "INVALID_STATE",
    );
  }
  return persistSession(
    root,
    bump(session, {
      status: "risk_halted",
      lastError,
      stopReason: "risk_halt",
    }),
  );
}

export function resumePaperSession(
  id: string,
  options?: PaperSessionStoreOptions,
): PaperSession {
  const root = resolveRoot(options);
  const session = readSessionRaw(root, id);
  if (!session) {
    throw new PaperSessionError(`session not found: ${id}`, "NOT_FOUND");
  }
  if (TERMINAL.has(session.status)) {
    throw new PaperSessionError(
      "terminal session cannot be resumed",
      "INVALID_STATE",
    );
  }
  if (session.status === "active") {
    throw new PaperSessionError("session already active", "DUPLICATE_START");
  }
  if (session.status !== "paused" && session.status !== "risk_halted") {
    throw new PaperSessionError(
      `cannot resume from status ${session.status}`,
      "INVALID_STATE",
    );
  }
  setPaperActiveStrategy(session.strategyId);
  const now = nowIso();
  const strategy = getStrategyById(session.strategyId) as StoredStrategyV1 | null;
  const snapshotted = snapshotPaperEventSequenceCostIfMissing({
    session,
    strategy,
  });
  return persistSession(
    root,
    bump(snapshotted, {
      status: "active",
      resumedAt: now,
      heartbeatAt: now,
      lastError: null,
      stopReason: null,
    }),
  );
}

export function stopPaperSession(
  id: string,
  options?: PaperSessionStoreOptions,
  stopReason?: string | null,
): PaperSession {
  const root = resolveRoot(options);
  const session = readSessionRaw(root, id);
  if (!session) {
    throw new PaperSessionError(`session not found: ${id}`, "NOT_FOUND");
  }
  if (session.status === "stopped") return session;
  if (session.status === "failed") {
    throw new PaperSessionError(
      "failed session cannot transition to stopped",
      "INVALID_STATE",
    );
  }
  const now = nowIso();
  return persistSession(
    root,
    bump(session, {
      status: "stopped",
      stoppedAt: now,
      stopReason: stopReason ?? session.stopReason ?? "user_stop",
    }),
  );
}

export function failPaperSession(
  id: string,
  lastError: string,
  options?: PaperSessionStoreOptions,
): PaperSession {
  const root = resolveRoot(options);
  const session = readSessionRaw(root, id);
  if (!session) {
    throw new PaperSessionError(`session not found: ${id}`, "NOT_FOUND");
  }
  if (TERMINAL.has(session.status)) {
    throw new PaperSessionError(
      "terminal session cannot fail again",
      "INVALID_STATE",
    );
  }
  const now = nowIso();
  return persistSession(
    root,
    bump(session, {
      status: "failed",
      stoppedAt: now,
      lastError,
      stopReason: "failed",
    }),
  );
}

export function applyActivePaperSessionRealizedPnl(
  deltaUsdt: number,
  options?: PaperSessionStoreOptions,
): PaperSession | null {
  if (!Number.isFinite(deltaUsdt)) return null;
  const session = getExecutablePaperSession(options) ?? getActivePaperSession(options);
  if (!session || session.status !== "active") return null;
  const root = resolveRoot(options);
  return persistSession(
    root,
    bump(session, {
      realizedPnl: Number((session.realizedPnl + deltaUsdt).toFixed(8)),
      tradeCount: (session.tradeCount ?? 0) + 1,
    }),
  );
}

const MAX_ACCOUNTED_CLOSE_IDS = 500;

/**
 * Apply one SAFE Paper close to the owning session.
 * Fail closed when ownership cannot be proven or the session is not active.
 * Dedupes by closeId so the same unified result cannot increment twice.
 */
export function applySafePaperSessionCloseAccounting(input: {
  paperSessionId: string | null | undefined;
  paperStrategyId?: string | null;
  closeId: string;
  realizedNetUsdt: number;
  options?: PaperSessionStoreOptions;
}): PaperSession | null {
  const sessionId = input.paperSessionId?.trim();
  const closeId = input.closeId?.trim();
  if (!sessionId || !closeId || !Number.isFinite(input.realizedNetUsdt)) {
    return null;
  }
  const root = resolveRoot(input.options);
  const session = readSessionRaw(root, sessionId);
  if (!session) return null;
  if (session.status !== "active") return null;
  if (session.mode !== "paper") return null;
  if (
    input.paperStrategyId &&
    input.paperStrategyId.trim() &&
    session.strategyId !== input.paperStrategyId.trim()
  ) {
    return null;
  }
  const seen = session.accountedCloseIds ?? [];
  if (seen.includes(closeId)) return session;
  const accountedCloseIds = [...seen, closeId].slice(-MAX_ACCOUNTED_CLOSE_IDS);
  return persistSession(
    root,
    bump(session, {
      realizedPnl: Number(
        (session.realizedPnl + input.realizedNetUsdt).toFixed(8),
      ),
      tradeCount: (session.tradeCount ?? 0) + 1,
      accountedCloseIds,
    }),
  );
}

export function touchPaperSessionHeartbeat(
  id: string,
  options?: PaperSessionStoreOptions,
): PaperSession | null {
  const root = resolveRoot(options);
  const session = readSessionRaw(root, id);
  if (!session || session.status !== "active") return session;
  return persistSession(
    root,
    bump(session, { heartbeatAt: nowIso() }),
  );
}

export function assertSessionStrategyMatch(
  session: PaperSession,
  strategyId: string,
): void {
  if (session.strategyId !== strategyId.trim()) {
    throw new PaperSessionError(
      "strategyId does not match session identity",
      "WRONG_STRATEGY",
    );
  }
}

export function assertSessionIdMatch(
  session: PaperSession,
  sessionId: string,
): void {
  if (session.id !== sessionId && session.sessionId !== sessionId) {
    throw new PaperSessionError(
      "sessionId does not match",
      "WRONG_SESSION",
    );
  }
}
