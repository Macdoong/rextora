import { readJsonStore, writeJsonStore } from "../storage/jsonStore";
import { AUTH_LOGIN_ATTEMPTS_FILE } from "./authTypes";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

type AttemptRow = {
  key: string;
  failures: number;
  windowStartedAt: string;
  lockedUntil: string | null;
};

type AttemptStore = {
  version: 1;
  attempts: AttemptRow[];
};

const EMPTY: AttemptStore = { version: 1, attempts: [] };

export const IP_AUTHORITY_UNAVAILABLE =
  "Request IP is not an authoritative client identity; login rate limiting is username-based.";

function readStore(): AttemptStore {
  const stored = readJsonStore<AttemptStore>(AUTH_LOGIN_ATTEMPTS_FILE, EMPTY, { ttlMs: 0 });
  return { version: 1, attempts: Array.isArray(stored.attempts) ? stored.attempts : [] };
}

function writeStore(store: AttemptStore): void {
  writeJsonStore(AUTH_LOGIN_ATTEMPTS_FILE, store);
}

export function loginRateLimitKey(username: string): string {
  return username.trim().toLowerCase();
}

export function getLoginLock(username: string, nowMs = Date.now()): {
  locked: boolean;
  retryAt: string | null;
} {
  const key = loginRateLimitKey(username);
  if (!key) return { locked: false, retryAt: null };
  const row = readStore().attempts.find((item) => item.key === key);
  if (!row?.lockedUntil) return { locked: false, retryAt: null };
  if (Date.parse(row.lockedUntil) > nowMs) {
    return { locked: true, retryAt: row.lockedUntil };
  }
  return { locked: false, retryAt: null };
}

export function recordLoginFailure(username: string, nowMs = Date.now()): {
  locked: boolean;
  retryAt: string | null;
} {
  const key = loginRateLimitKey(username);
  if (!key) return { locked: false, retryAt: null };
  const store = readStore();
  let row = store.attempts.find((item) => item.key === key);
  if (!row) {
    row = {
      key,
      failures: 0,
      windowStartedAt: new Date(nowMs).toISOString(),
      lockedUntil: null,
    };
    store.attempts = [row, ...store.attempts].slice(0, 200);
  }
  const windowStart = Date.parse(row.windowStartedAt);
  if (!Number.isFinite(windowStart) || nowMs - windowStart > WINDOW_MS) {
    row.failures = 0;
    row.windowStartedAt = new Date(nowMs).toISOString();
    row.lockedUntil = null;
  }
  row.failures += 1;
  if (row.failures >= MAX_FAILURES) {
    row.lockedUntil = new Date(nowMs + LOCKOUT_MS).toISOString();
  }
  writeStore(store);
  return getLoginLock(username, nowMs);
}

export function clearLoginFailures(username: string): void {
  const key = loginRateLimitKey(username);
  const store = readStore();
  store.attempts = store.attempts.filter((item) => item.key !== key);
  writeStore(store);
}

export function expireLoginLockForTests(username: string, lockedUntil: string): void {
  const key = loginRateLimitKey(username);
  const store = readStore();
  const row = store.attempts.find((item) => item.key === key);
  if (!row) return;
  row.lockedUntil = lockedUntil;
  writeStore(store);
}
