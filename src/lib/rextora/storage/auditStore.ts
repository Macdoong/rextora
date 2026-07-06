import { appendJsonStore, readJsonStore } from "./jsonStore";

export type AuditLogType =
  | "settings_change"
  | "settings_reset"
  | "live_execution_attempt"
  | "live_entry"
  | "live_exit"
  | "paper_trade"
  | "tpsl_placement"
  | "tpsl_failure"
  | "emergency_action"
  | "telegram_failure"
  | "binance_error"
  | "candidate_block"
  | "candidate_selected"
  | "preflight";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  type: AuditLogType;
  actor: string;
  message: string;
  mode: "PAPER" | "LIVE" | "BACKTEST" | "SYSTEM";
  correlationId: string;
  symbol?: string;
  side?: string;
  quantity?: number;
  details?: Record<string, unknown>;
}

const AUDIT_FILE = "audit-log.json";
const MAX_ENTRIES = 2000;

export function appendAuditLog(entry: Omit<AuditLogEntry, "id" | "timestamp"> & { id?: string; timestamp?: string }): AuditLogEntry {
  const full: AuditLogEntry = {
    id: entry.id ?? `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: entry.timestamp ?? new Date().toISOString(),
    type: entry.type,
    actor: entry.actor,
    message: entry.message,
    mode: entry.mode,
    correlationId: entry.correlationId,
    symbol: entry.symbol,
    side: entry.side,
    quantity: entry.quantity,
    details: entry.details
  };
  appendJsonStore(AUDIT_FILE, full, MAX_ENTRIES);
  return full;
}

export function getAuditLogs(limit = 100): AuditLogEntry[] {
  return readJsonStore<AuditLogEntry[]>(AUDIT_FILE, [], { ttlMs: 1_000 }).slice(0, limit);
}

export function getAuditSummary() {
  const logs = getAuditLogs(500);
  const byType: Record<string, number> = {};
  for (const log of logs) {
    byType[log.type] = (byType[log.type] ?? 0) + 1;
  }
  return {
    total: logs.length,
    lastEntry: logs[0] ?? null,
    byType,
    recentErrors: logs.filter((l) => l.type === "binance_error" || l.type === "telegram_failure" || l.type === "tpsl_failure").slice(0, 10)
  };
}
