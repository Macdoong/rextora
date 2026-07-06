import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data", "rextora");
const DEFAULT_TTL_MS = 5_000;

type CacheEntry<T> = {
  value: T;
  mtimeMs: number;
  expiresAt: number;
};

const storeCache = new Map<string, CacheEntry<unknown>>();

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(filename: string): string {
  return path.join(DATA_DIR, filename);
}

function getFileMtimeMs(filename: string): number {
  const fp = filePath(filename);
  if (!fs.existsSync(fp)) return 0;
  return fs.statSync(fp).mtimeMs;
}

export function invalidateJsonStoreCache(filename?: string): void {
  if (filename) {
    storeCache.delete(filename);
    return;
  }
  storeCache.clear();
}

export function readJsonStore<T>(filename: string, fallback: T, options?: { ttlMs?: number }): T {
  ensureDir();
  const ttlMs = options?.ttlMs ?? DEFAULT_TTL_MS;
  const fp = filePath(filename);
  const mtimeMs = getFileMtimeMs(filename);
  const cached = storeCache.get(filename);

  if (cached && cached.mtimeMs === mtimeMs && Date.now() < cached.expiresAt) {
    return cached.value as T;
  }

  if (!fs.existsSync(fp)) {
    const entry: CacheEntry<T> = { value: fallback, mtimeMs: 0, expiresAt: Date.now() + ttlMs };
    storeCache.set(filename, entry);
    return fallback;
  }

  try {
    const value = JSON.parse(fs.readFileSync(fp, "utf8")) as T;
    storeCache.set(filename, { value, mtimeMs, expiresAt: Date.now() + ttlMs });
    return value;
  } catch {
    const entry: CacheEntry<T> = { value: fallback, mtimeMs, expiresAt: Date.now() + ttlMs };
    storeCache.set(filename, entry);
    return fallback;
  }
}

export function writeJsonStore<T>(filename: string, value: T): T {
  ensureDir();
  const fp = filePath(filename);
  fs.writeFileSync(fp, JSON.stringify(value, null, 2), "utf8");
  const mtimeMs = getFileMtimeMs(filename);
  storeCache.set(filename, { value, mtimeMs, expiresAt: Date.now() + DEFAULT_TTL_MS });
  return value;
}

export function appendJsonStore<T>(filename: string, item: T, maxItems = 500): T[] {
  const current = readJsonStore<T[]>(filename, [], { ttlMs: 0 });
  const next = [item, ...current].slice(0, maxItems);
  return writeJsonStore(filename, next);
}

export function getDataDir(): string {
  ensureDir();
  return DATA_DIR;
}
