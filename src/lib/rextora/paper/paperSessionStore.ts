/**
 * Paper trading session persistence.
 * Writes only under data/rextora/paper-sessions/ — never touches SAFE strategy files.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getStrategyById } from "../strategy/strategyStore";
import { SAFE_STRATEGY_ID } from "../strategy/strategyTypes";

export type PaperSessionStatus = "active" | "paused" | "stopped";

export interface PaperSession {
  id: string;
  strategyId: string;
  strategyHash: string;
  strategyName: string;
  status: PaperSessionStatus;
  startedAt: string;
  updatedAt: string;
  stoppedAt: string | null;
  virtualBalance: number;
  realizedPnl: number;
  unrealizedPnl: number;
  tradeCount: number;
  signalCount: number;
  drawdown: number;
  backtestResultId: string | null;
  linkedJobId: string | null;
  /** Optional symbol preserved from the Backtest Run handoff. */
  symbol?: string | null;
}

export interface PaperSessionStoreOptions {
  /** Injectable root for tests. Default: data/rextora/paper-sessions */
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

function defaultRoot(): string {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "rextora",
    "paper-sessions",
  );
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
  sessions: Array<{ id: string; strategyId: string; status: PaperSessionStatus; updatedAt: string }>;
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

function assertNotSafeFileWrite(filePath: string): void {
  const base = path.basename(filePath).toLowerCase();
  if (
    base === `${SAFE_STRATEGY_ID.toLowerCase()}.json` ||
    filePath.includes(`${path.sep}strategies${path.sep}${SAFE_STRATEGY_ID}`)
  ) {
    throw new PaperSessionError(
      "paper session store must never write SAFE strategy file",
      "SAFE_WRITE_BLOCKED",
    );
  }
}

function persistSession(root: string, session: PaperSession): PaperSession {
  const fp = sessionPath(root, session.id);
  assertNotSafeFileWrite(fp);
  writeJson(fp, session);
  upsertIndexRow(root, session);
  return session;
}

function readSession(root: string, id: string): PaperSession | null {
  const fp = sessionPath(root, id);
  if (!fs.existsSync(fp)) return null;
  return readJson<PaperSession | null>(fp, null);
}

/**
 * Create a new active paper session for an existing strategy.
 * Never writes strategy files (including SAFE).
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
  const strategyId = input.strategyId?.trim();
  if (!strategyId) {
    throw new PaperSessionError("strategyId required", "STRATEGY_REQUIRED");
  }

  const strategy = getStrategyById(strategyId);
  if (!strategy) {
    throw new PaperSessionError(
      `strategy not found: ${strategyId}`,
      "STRATEGY_NOT_FOUND",
    );
  }

  const root = resolveRoot(options);
  ensureDir(root);

  // Finalize any currently active session so getActivePaperSession stays singular.
  const existingActive = getActivePaperSession(options);
  if (existingActive) {
    stopPaperSession(existingActive.id, options);
  }

  const now = nowIso();
  const session: PaperSession = {
    id: `paper_${crypto.randomUUID()}`,
    strategyId: strategy.id,
    strategyHash: strategy.paramsHash,
    strategyName: strategy.name,
    status: "active",
    startedAt: now,
    updatedAt: now,
    stoppedAt: null,
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
    backtestResultId: input.backtestResultId ?? null,
    linkedJobId: input.linkedJobId ?? null,
    symbol: input.symbol ? String(input.symbol).toUpperCase() : null,
  };

  return persistSession(root, session);
}

export function getActivePaperSession(
  options?: PaperSessionStoreOptions,
): PaperSession | null {
  const root = resolveRoot(options);
  const index = loadIndex(root);
  for (const row of index.sessions) {
    if (row.status !== "active" && row.status !== "paused") continue;
    const session = readSession(root, row.id);
    if (session && (session.status === "active" || session.status === "paused")) {
      return session;
    }
  }
  return null;
}

export function listPaperSessions(
  options?: PaperSessionStoreOptions,
): PaperSession[] {
  const root = resolveRoot(options);
  const index = loadIndex(root);
  const out: PaperSession[] = [];
  for (const row of index.sessions) {
    const session = readSession(root, row.id);
    if (session) out.push(session);
  }
  return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export function getPaperSession(
  id: string,
  options?: PaperSessionStoreOptions,
): PaperSession | null {
  const root = resolveRoot(options);
  return readSession(root, id);
}

export function pausePaperSession(
  id: string,
  options?: PaperSessionStoreOptions,
): PaperSession {
  const root = resolveRoot(options);
  const session = readSession(root, id);
  if (!session) {
    throw new PaperSessionError(`session not found: ${id}`, "NOT_FOUND");
  }
  if (session.status === "stopped") {
    throw new PaperSessionError("stopped session cannot be paused", "INVALID_STATE");
  }
  if (session.status === "paused") return session;
  const next: PaperSession = {
    ...session,
    status: "paused",
    updatedAt: nowIso(),
  };
  return persistSession(root, next);
}

export function resumePaperSession(
  id: string,
  options?: PaperSessionStoreOptions,
): PaperSession {
  const root = resolveRoot(options);
  const session = readSession(root, id);
  if (!session) {
    throw new PaperSessionError(`session not found: ${id}`, "NOT_FOUND");
  }
  if (session.status === "stopped") {
    throw new PaperSessionError("stopped session cannot be resumed", "INVALID_STATE");
  }
  if (session.status === "active") return session;
  const next: PaperSession = {
    ...session,
    status: "active",
    updatedAt: nowIso(),
  };
  return persistSession(root, next);
}

export function stopPaperSession(
  id: string,
  options?: PaperSessionStoreOptions,
): PaperSession {
  const root = resolveRoot(options);
  const session = readSession(root, id);
  if (!session) {
    throw new PaperSessionError(`session not found: ${id}`, "NOT_FOUND");
  }
  if (session.status === "stopped") return session;
  const now = nowIso();
  const next: PaperSession = {
    ...session,
    status: "stopped",
    updatedAt: now,
    stoppedAt: now,
  };
  return persistSession(root, next);
}
