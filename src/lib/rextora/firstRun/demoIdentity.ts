/**
 * First-run / demo identity constants.
 * Demo records must never collide with SAFE or be Live-eligible.
 */

export const DEMO_BUNDLE_ID = "rextora_demo_v1" as const;
export const DEMO_OWNERSHIP_MARKER = `demoOwnership=${DEMO_BUNDLE_ID}`;

/** Fixed UUID-shaped job id (valid search_<uuid>). */
export const DEMO_JOB_ID =
  "search_d0000001-0000-4000-8000-000000000001" as const;

/** Reserved strategy id namespace — never SAFE. */
export const DEMO_STRATEGY_ID = "demo_strategy_btc_v1" as const;

export const DEMO_JOB_NAME = "Demo BTC Research";
export const DEMO_STRATEGY_NAME = "Demo Strategy";
export const DEMO_BACKTEST_ALIAS = "Demo Backtest";
export const DEMO_DATA_VERSION = "demo-fixture-v1";

/** Description fragment used for strategy/demo detection. */
export const DEMO_STRATEGY_DESCRIPTION =
  `[DEMO] ${DEMO_OWNERSHIP_MARKER}. Illustrative workspace only — not live market evidence. liveEligible=false.`;

export function isDemoJobId(id: string | null | undefined): boolean {
  return id === DEMO_JOB_ID;
}

export function isDemoStrategyRecord(input: {
  id?: string | null;
  name?: string | null;
  description?: string | null;
  displayAlias?: string | null;
}): boolean {
  if (input.id === DEMO_STRATEGY_ID || input.id?.startsWith("demo_strategy_")) {
    return true;
  }
  if (input.name === DEMO_STRATEGY_NAME) return true;
  if (input.displayAlias === DEMO_STRATEGY_NAME) return true;
  const desc = input.description ?? "";
  return desc.includes(DEMO_OWNERSHIP_MARKER) || desc.includes("[DEMO]");
}

/** Live eligibility hard-block for demo-owned strategies. */
export function isDemoLiveBlocked(input: {
  id?: string | null;
  name?: string | null;
  description?: string | null;
}): boolean {
  return isDemoStrategyRecord(input);
}

export function isDemoBacktestRecord(input: {
  id?: string | null;
  displayAliasSnapshot?: string | null;
  displayNameSnapshot?: string | null;
  dataVersion?: string | null;
  report?: { strategyName?: string | null; dataSource?: string | null } | null;
}): boolean {
  if (input.displayAliasSnapshot === DEMO_BACKTEST_ALIAS) return true;
  if (input.displayNameSnapshot === DEMO_BACKTEST_ALIAS) return true;
  if (input.dataVersion === DEMO_DATA_VERSION) return true;
  if (input.id?.includes("demo")) return true;
  if (input.report?.strategyName === DEMO_STRATEGY_NAME) return true;
  return false;
}

export function isDemoSearchName(name: string | null | undefined): boolean {
  if (!name) return false;
  return name === DEMO_JOB_NAME || /^Demo\b/i.test(name);
}
