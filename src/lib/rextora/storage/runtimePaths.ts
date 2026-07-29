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

import path from "node:path";

export function rextoraDataRoot(): string {
  const override = process.env.REXTORA_DATA_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "rextora",
  );
}

/** Real checkout runtime root — ignores REXTORA_DATA_DIR. */
export function productionRextoraDataRootCanonical(): string {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "rextora",
  );
}

export function strategySearchRoot(): string {
  const override = process.env.REXTORA_STRATEGY_SEARCH_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(rextoraDataRoot(), "strategy-search");
}

export function backtestsRoot(): string {
  const override = process.env.REXTORA_BACKTESTS_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(rextoraDataRoot(), "backtests");
}

export function strategiesRootDefault(): string {
  return path.join(rextoraDataRoot(), "strategies");
}

/** Real checkout strategies dir — ignores env overrides. */
export function productionStrategiesRootCanonical(): string {
  return path.join(productionRextoraDataRootCanonical(), "strategies");
}

export function paperSessionsRootDefault(): string {
  return path.join(rextoraDataRoot(), "paper-sessions");
}

export function firstRunStatePath(): string {
  return path.join(rextoraDataRoot(), "first-run.json");
}
