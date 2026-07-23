/**
 * Promote a Final PASS Strategy Search trial into Strategy Management.
 * Always creates a new strategy — never overwrites SAFE or existing ids.
 */

import { mergeSafeParams } from "../strategy/safeV44Params";
import { computeParamsHash } from "../strategy/strategyHash";
import {
  createStrategy,
  listStrategies,
  updateStrategyLastBacktest,
} from "../strategy/strategyStore";
import {
  EXPECTED_SAFE_PARAMS_HASH,
  type SafeV44Params,
} from "../strategy/strategyTypes";
import { StrategySearchApiError } from "./jobApiService";
import {
  getSearchJob,
  getSearchTrial,
  listSearchTrials,
  type StrategySearchStoreOptions,
} from "./jobStore";
import {
  getSearchPlan,
  saveSearchPlan,
} from "./searchPlan";
import {
  buildReadableStrategyIdentity,
  type StrategyFamilyId,
} from "./readableStrategyName";

export interface PromoteSearchCandidateInput {
  jobId: string;
  iteration: number;
  name?: string;
  storeOptions?: StrategySearchStoreOptions;
}

export type RegistrationState =
  | "not_registered"
  | "registered"
  | "duplicate"
  | "registration_failed";

export interface PromoteSearchCandidateResult {
  strategyId: string;
  strategyName: string;
  paramsHash: string;
  alreadyExists: boolean;
  existingStrategyId: string | null;
  registrationState: RegistrationState;
  strategyFamily: StrategyFamilyId;
  strategyTypeLabelKo: string;
  market: string | null;
  timeframe: string | null;
  params: Record<string, unknown>;
  lastBacktest: {
    totalReturn: number;
    mdd: number;
    trades: number;
    winRate: number;
    sharpe?: number | null;
    profitFactor?: number | null;
  } | null;
}

function recordPlanPromotion(
  jobId: string,
  result: PromoteSearchCandidateResult,
  iteration: number,
  store?: StrategySearchStoreOptions,
): void {
  const plan = getSearchPlan(jobId, store);
  if (!plan) return;
  const status =
    result.registrationState === "duplicate"
      ? "duplicate"
      : result.registrationState === "registered"
        ? "promoted"
        : "failed";
  const record = {
    paramsHash: result.paramsHash,
    iteration,
    status: status as "promoted" | "duplicate" | "failed",
    strategyId: result.strategyId,
    strategyName: result.strategyName,
    error: null,
    updatedAt: new Date().toISOString(),
  };
  saveSearchPlan(
    jobId,
    {
      ...plan,
      promotions: [
        ...plan.promotions.filter((p) => p.paramsHash !== result.paramsHash),
        record,
      ],
    },
    store,
  );
}

export function promoteSearchCandidateToStrategy(
  input: PromoteSearchCandidateInput,
): PromoteSearchCandidateResult {
  const store = input.storeOptions;
  const job = getSearchJob(input.jobId, store);
  if (!job) {
    throw new StrategySearchApiError(
      "JOB_NOT_FOUND",
      `strategy-search job not found: ${input.jobId}`,
      404,
    );
  }
  const trial = getSearchTrial(input.jobId, input.iteration, store);
  if (!trial) {
    throw new StrategySearchApiError(
      "INVALID_REQUEST",
      `trial not found: iteration ${input.iteration}`,
      400,
    );
  }
  if (!trial.passed) {
    throw new StrategySearchApiError(
      "INVALID_REQUEST",
      "only Final PASS candidates can be promoted",
      400,
    );
  }
  if (
    !trial.paramsHash ||
    trial.paramsHash.startsWith("duplicate_exhausted_")
  ) {
    throw new StrategySearchApiError(
      "PROTECTED_STRATEGY_VIOLATION",
      "protected or invalid candidate cannot be promoted",
      403,
    );
  }

  const params = mergeSafeParams(trial.params as Partial<SafeV44Params>);
  const paramsHash = computeParamsHash(params);
  if (
    paramsHash === EXPECTED_SAFE_PARAMS_HASH ||
    paramsHash === "7893ca3f0e30" ||
    trial.paramsHash === EXPECTED_SAFE_PARAMS_HASH ||
    trial.paramsHash === "7893ca3f0e30"
  ) {
    throw new StrategySearchApiError(
      "PROTECTED_STRATEGY_VIOLATION",
      "protected SAFE strategy cannot be promoted or overwritten",
      403,
    );
  }

  const identity = buildReadableStrategyIdentity(
    params as unknown as Record<string, unknown>,
    paramsHash,
  );
  const market = job.config.symbols[0] ?? null;
  const primary = trial.windowResults[0] ?? null;
  const lastBacktest =
    primary &&
    typeof primary.totalReturn === "number" &&
    typeof primary.mdd === "number" &&
    typeof primary.trades === "number"
      ? {
          totalReturn: primary.totalReturn as number,
          mdd: primary.mdd as number,
          trades: primary.trades as number,
          winRate:
            typeof primary.winRate === "number" ? (primary.winRate as number) : 0,
          sharpe:
            typeof primary.sharpe === "number" ? (primary.sharpe as number) : null,
          profitFactor:
            typeof primary.profitFactor === "number"
              ? (primary.profitFactor as number)
              : null,
        }
      : null;

  const existing = listStrategies().find(
    (s) =>
      !s.locked &&
      (s.paramsHash === paramsHash || s.paramsHash === trial.paramsHash),
  );
  if (existing) {
    const dup: PromoteSearchCandidateResult = {
      strategyId: existing.id,
      strategyName: existing.name,
      paramsHash: existing.paramsHash,
      alreadyExists: true,
      existingStrategyId: existing.id,
      registrationState: "duplicate",
      strategyFamily: identity.strategyFamily,
      strategyTypeLabelKo: identity.strategyTypeLabelKo,
      market,
      timeframe: job.config.timeframe,
      params: { ...params },
      lastBacktest,
    };
    recordPlanPromotion(input.jobId, dup, input.iteration, store);
    return dup;
  }

  const name =
    (input.name && input.name.trim()) || identity.readableName;

  const tf = job.config.timeframe;
  const timeframe: "5m" | "15m" | "1h" =
    tf === "5m" || tf === "15m" || tf === "1h" ? tf : "15m";

  const created = createStrategy({
    name,
    description: `전략 탐색 · 출처 job=${job.id} · iteration=${input.iteration} · ${identity.strategyTypeLabelKo} · ${job.config.symbols.join(",")} · ${job.config.timeframe}`,
    params,
    timeframe,
    strategyType: "safe_params",
  });

  if (lastBacktest) {
    try {
      updateStrategyLastBacktest(created.id, {
        totalReturn: lastBacktest.totalReturn,
        mdd: lastBacktest.mdd,
        trades: lastBacktest.trades,
        winRate: lastBacktest.winRate,
      });
    } catch {
      /* non-fatal enrichment */
    }
  }

  const createdResult: PromoteSearchCandidateResult = {
    strategyId: created.id,
    strategyName: created.name,
    paramsHash: created.paramsHash,
    alreadyExists: false,
    existingStrategyId: null,
    registrationState: "registered",
    strategyFamily: identity.strategyFamily,
    strategyTypeLabelKo: identity.strategyTypeLabelKo,
    market,
    timeframe: job.config.timeframe,
    params: { ...params },
    lastBacktest,
  };
  recordPlanPromotion(input.jobId, createdResult, input.iteration, store);
  return createdResult;
}

/** Explicit multi-select registration — only the given iterations. */
export function promoteSelectedTrialsFromJob(
  jobId: string,
  iterations: number[],
  storeOptions?: StrategySearchStoreOptions,
): PromoteSearchCandidateResult[] {
  const unique = [...new Set(iterations.filter((n) => Number.isInteger(n)))];
  const out: PromoteSearchCandidateResult[] = [];
  const seen = new Set<string>();
  for (const iteration of unique) {
    const identityTrial = getSearchTrial(jobId, iteration, storeOptions);
    if (!identityTrial) {
      throw new StrategySearchApiError(
        "INVALID_REQUEST",
        `trial not found: iteration ${iteration}`,
        400,
      );
    }
    if (seen.has(identityTrial.paramsHash)) continue;
    seen.add(identityTrial.paramsHash);
    const identity = buildReadableStrategyIdentity(
      identityTrial.params,
      identityTrial.paramsHash,
    );
    out.push(
      promoteSearchCandidateToStrategy({
        jobId,
        iteration,
        name: identity.readableName,
        storeOptions,
      }),
    );
  }
  return out;
}

/**
 * @deprecated Prefer promoteSelectedTrialsFromJob. Kept for explicit bulk API
 * when caller intentionally registers every Final PASS (not used by UI).
 */
export function promoteAllPassedTrialsFromJob(
  jobId: string,
  storeOptions?: StrategySearchStoreOptions,
): PromoteSearchCandidateResult[] {
  const trials = listSearchTrials(jobId, storeOptions)
    .filter((t) => t.passed)
    .sort((a, b) => a.iteration - b.iteration);
  return promoteSelectedTrialsFromJob(
    jobId,
    trials.map((t) => t.iteration),
    storeOptions,
  );
}
