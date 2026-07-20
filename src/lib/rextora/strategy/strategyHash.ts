import { createHash } from "node:crypto";
import type { SafeV44Params } from "./strategyTypes";

/** Stable params_hash for strategy snapshots (12 hex chars). */
export function computeParamsHash(params: SafeV44Params | Record<string, unknown>): string {
  const keys = Object.keys(params).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of keys) {
    normalized[key] = (params as Record<string, unknown>)[key];
  }
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 12);
}

export function isLockedSafeHash(hash: string): boolean {
  return hash === "7893ca3f0e30";
}
