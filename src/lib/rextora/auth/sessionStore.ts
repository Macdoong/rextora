import { createHash, randomBytes } from "node:crypto";
import { readJsonStoreAtomic, writeJsonStoreAtomic } from "../storage/jsonStore";
import { sessionStoreWriteGate } from "./authWriteGate";
import {
  AUTH_SESSIONS_FILE,
  AUTH_SESSION_TTL_MS,
  toPublicUser,
  type AuthSessionRecord,
  type AuthenticatedUser,
} from "./authTypes";
import { getUserById } from "./userStore";

type SessionStoreFile = {
  version: 1;
  sessions: AuthSessionRecord[];
};

const EMPTY: SessionStoreFile = { version: 1, sessions: [] };

function readStore(): SessionStoreFile {
  const stored = readJsonStoreAtomic<SessionStoreFile>(AUTH_SESSIONS_FILE, EMPTY, { ttlMs: 0 });
  return { version: 1, sessions: Array.isArray(stored.sessions) ? stored.sessions : [] };
}

function writeStore(store: SessionStoreFile): SessionStoreFile {
  return writeJsonStoreAtomic(AUTH_SESSIONS_FILE, store);
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(userId: string, nowMs = Date.now()): {
  token: string;
  record: AuthSessionRecord;
} {
  const token = randomBytes(32).toString("hex");
  const record: AuthSessionRecord = {
    sessionId: `ses_${randomBytes(12).toString("hex")}`,
    tokenHash: hashSessionToken(token),
    userId,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + AUTH_SESSION_TTL_MS).toISOString(),
    revokedAt: null,
  };
  return sessionStoreWriteGate.run(() => {
    const store = readStore();
    store.sessions = [record, ...store.sessions].slice(0, 500);
    writeStore(store);
    return { token, record };
  });
}

function isUsable(record: AuthSessionRecord, nowMs: number): boolean {
  if (record.revokedAt) return false;
  if (Date.parse(record.expiresAt) <= nowMs) return false;
  return true;
}

export function resolveSessionToken(
  token: string | null | undefined,
  nowMs = Date.now(),
): AuthenticatedUser | null {
  const raw = token?.trim();
  if (!raw) return null;
  const tokenHash = hashSessionToken(raw);
  const record = readStore().sessions.find((row) => row.tokenHash === tokenHash);
  if (!record || !isUsable(record, nowMs)) return null;
  const user = getUserById(record.userId);
  if (!user || user.disabledAt) return null;
  return toPublicUser(user);
}

export function revokeSessionToken(token: string | null | undefined, nowMs = Date.now()): boolean {
  const raw = token?.trim();
  if (!raw) return false;
  const tokenHash = hashSessionToken(raw);
  return sessionStoreWriteGate.run(() => {
    const store = readStore();
    const index = store.sessions.findIndex((row) => row.tokenHash === tokenHash);
    if (index < 0) return false;
    const current = store.sessions[index];
    if (!current || current.revokedAt) return true;
    store.sessions[index] = { ...current, revokedAt: new Date(nowMs).toISOString() };
    writeStore(store);
    return true;
  });
}

/**
 * Mark every stored session for userId as revoked.
 * Does not expose raw tokens. Other users' sessions are unchanged.
 * Missing/empty session files are treated as zero sessions.
 */
export function revokeSessionsForUser(
  userId: string,
  nowMs = Date.now(),
): { userId: string; revokedCount: number } {
  const id = userId?.trim() ?? "";
  if (!id) return { userId: "", revokedCount: 0 };
  return sessionStoreWriteGate.run(() => {
    const store = readStore();
    let revokedCount = 0;
    const revokedAt = new Date(nowMs).toISOString();
    const sessions = store.sessions.map((row) => {
      if (row.userId !== id || row.revokedAt) return row;
      revokedCount += 1;
      return { ...row, revokedAt };
    });
    if (revokedCount > 0) {
      writeStore({ version: 1, sessions });
    }
    return { userId: id, revokedCount };
  });
}

export function expireSessionForTests(token: string, expiresAt: string): void {
  const tokenHash = hashSessionToken(token);
  sessionStoreWriteGate.run(() => {
    const store = readStore();
    const index = store.sessions.findIndex((row) => row.tokenHash === tokenHash);
    if (index < 0) return;
    const current = store.sessions[index];
    if (!current) return;
    store.sessions[index] = { ...current, expiresAt };
    writeStore(store);
  });
}

export function persistentSessionContainsRawToken(token: string): boolean {
  const raw = JSON.stringify(readStore());
  return Boolean(token) && raw.includes(token);
}
