/**
 * Central runtime path resolution for data/rextora stores.
 * Optional REXTORA_DATA_DIR enables isolated empty-runtime tests without
 * touching the operator's real runtime directory.
 *
 * Specific overrides still win:
 * - REXTORA_STRATEGIES_DIR
 * - REXTORA_PAPER_SESSIONS_DIR
 * - REXTORA_BACKTESTS_DIR
 * - REXTORA_STRATEGY_SEARCH_DIR
 *
 * production*Canonical helpers ignore env overrides — used only for
 * fail-closed isolation checks against the real checkout paths.
 */

import runtimePaths from "@rextora/runtime-paths";

export function rextoraDataRoot(): string {
  return runtimePaths.rextoraDataRoot();
}

/** Real checkout runtime root — ignores REXTORA_DATA_DIR. */
export function productionRextoraDataRootCanonical(): string {
  return runtimePaths.productionRextoraDataRootCanonical();
}

export function strategySearchRoot(): string {
  return runtimePaths.strategySearchRoot();
}

export function backtestsRoot(): string {
  return runtimePaths.backtestsRoot();
}

export function strategiesRootDefault(): string {
  return runtimePaths.strategiesRootDefault();
}

/** Real checkout strategies dir — ignores env overrides. */
export function productionStrategiesRootCanonical(): string {
  return runtimePaths.productionStrategiesRootCanonical();
}

export function paperSessionsRootDefault(): string {
  return runtimePaths.paperSessionsRootDefault();
}

export function firstRunStatePath(): string {
  return runtimePaths.firstRunStatePath();
}
