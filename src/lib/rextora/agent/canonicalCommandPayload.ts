/**
 * Canonical engine payloads for typed-command hashing and idempotency.
 * Hashes validated engine requests — never transient UI/conversation fields.
 */

import crypto from "node:crypto";
import type { TypedCommandType } from "./typedCommand";

const SEARCH_OPERATOR_TRANSIENT = new Set(["searchName"]);

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Recursively sort object keys; preserve array order. */
export function canonicalizeForHash(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeForHash(item));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      const canonical = canonicalizeForHash(obj[key]);
      if (canonical !== undefined) out[key] = canonical;
    }
    return out;
  }
  if (typeof value === "string") return value;
  return value;
}

function normalizeSymbolToken(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.endsWith("USDT")) return s;
  if (["BTC", "ETH", "SOL", "BNB", "XRP"].includes(s)) return `${s}USDT`;
  return s;
}

/** Engine-significant Search create body for hashing (matches API execution payload). */
export function searchCreateBodyForHash(
  createBody: unknown,
): Record<string, unknown> {
  if (!createBody || typeof createBody !== "object") return {};
  const body = JSON.parse(JSON.stringify(createBody)) as Record<string, unknown>;

  if (typeof body.symbols === "string") {
    body.symbols = [normalizeSymbolToken(body.symbols)];
  } else if (Array.isArray(body.symbols)) {
    body.symbols = body.symbols.map((s) => normalizeSymbolToken(String(s)));
  }

  if (typeof body.timeframe === "string") {
    body.timeframe = body.timeframe.trim().toLowerCase();
  }

  const operatorPlan = body.operatorPlan;
  if (operatorPlan && typeof operatorPlan === "object") {
    const op = operatorPlan as Record<string, unknown>;
    for (const key of SEARCH_OPERATOR_TRANSIENT) {
      delete op[key];
    }
    if (Array.isArray(op.selectedSpaceIds)) {
      op.selectedSpaceIds = [...op.selectedSpaceIds].map(String);
    }
    body.operatorPlan = op;
  }

  return stripUndefined(
    canonicalizeForHash(body) as Record<string, unknown>,
  );
}

function backtestParametersForHash(
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...parameters };
  if (Array.isArray(out.symbols)) {
    out.symbols = out.symbols.map((s) => normalizeSymbolToken(String(s)));
  }
  if (typeof out.symbol === "string") {
    out.symbol = normalizeSymbolToken(out.symbol);
  }
  if (typeof out.timeframe === "string") {
    out.timeframe = out.timeframe.trim().toLowerCase();
  }
  delete out.draft;
  delete out.executionStarted;
  return stripUndefined(
    canonicalizeForHash(out) as Record<string, unknown>,
  );
}

/** Hash the canonical engine payload for a typed command. */
export function hashEngineParameters(
  parameters: Record<string, unknown>,
  commandType?: TypedCommandType,
): string {
  let payload: Record<string, unknown> = parameters;

  if (
    commandType === "create_strategy_search_job" &&
    parameters.createBody != null
  ) {
    payload = {
      createBody: searchCreateBodyForHash(parameters.createBody),
    };
  } else if (commandType === "run_backtest") {
    payload = backtestParametersForHash(parameters);
  } else if (commandType === "prepare_paper_session") {
    payload = stripUndefined(
      canonicalizeForHash(parameters) as Record<string, unknown>,
    );
  } else {
    payload = stripUndefined(
      canonicalizeForHash(parameters) as Record<string, unknown>,
    );
  }

  const canonical = JSON.stringify(payload);
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 24);
}
