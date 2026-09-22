import { GENERIC_SEARCH_BASELINE_PARAMS } from "./safeV44Params";
import { RETIRED_SAFE_STRATEGY_ID } from "./retiredSafeBaseline";
import { type SafeV44StrategyMetadata } from "./strategyTypes";

export class SafeStrategyHashMismatchError extends Error {
  readonly expected: string;
  readonly actual: string;

  constructor(expected: string, actual: string) {
    super(`SAFE strategy is retired: expected ${expected}, actual ${actual}`);
    this.name = "SafeStrategyHashMismatchError";
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Retired loader. SAFE is no longer a product strategy.
 * Remaining callers receive an explicit retired/unavailable payload.
 */
export function loadSafeV44Strategy(_options?: {
  throwOnHashMismatch?: boolean;
}): SafeV44StrategyMetadata {
  return {
    name: RETIRED_SAFE_STRATEGY_ID,
    paramsHash: "",
    params: { ...GENERIC_SEARCH_BASELINE_PARAMS },
    sourceFile: null,
    sourceStatus: "context_fallback",
    lockedResearchFilesFound: false,
    dataStrategyFileFound: false,
    hashVerified: false,
    notes: ["SAFE_v44_i4060 is retired and is not a selected strategy."],
  };
}

export function getSafeV44Params() {
  return { ...GENERIC_SEARCH_BASELINE_PARAMS };
}

export function validateSafeV44ParamsHash(): {
  ok: boolean;
  expected: string;
  actual: string;
  notes: string[];
} {
  const metadata = loadSafeV44Strategy({ throwOnHashMismatch: false });
  return {
    ok: false,
    expected: "",
    actual: metadata.paramsHash,
    notes: metadata.notes,
  };
}
