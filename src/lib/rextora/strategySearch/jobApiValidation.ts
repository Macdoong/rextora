/**
 * Validate Strategy Search API create-job payloads.
 * Manual validation (repository convention — no zod).
 */

import { validateCostStressScenarios } from "./costStress";
import { validatePassPolicy, validateScoreWeights } from "./evaluationPolicy";
import { validateJitterConfig } from "./jitterEvaluator";
import { validateSearchParameterRanges } from "./paramSpace";
import type {
  StrategySearchBacktestCostConfig,
  StrategySearchConfig,
  StrategySearchCostStressScenario,
  StrategySearchJitterConfig,
  StrategySearchPassPolicy,
  StrategySearchScoreWeights,
  StrategySearchWindow,
} from "./types";
import type {
  StrategySearchDataReference,
  StrategySearchExecutionProfile,
} from "./jobExecutionProfile";
import { STRATEGY_SEARCH_EXECUTION_PROFILE_VERSION } from "./jobExecutionProfile";
import type {
  QualificationProfileId,
  SearchDepthProfileId,
} from "./operatorProfiles";

export interface ValidatedOperatorPlanInput {
  depthProfile: SearchDepthProfileId;
  qualificationProfile: QualificationProfileId;
  qualifiedTarget: number;
  /** Default false — continue past first PASS until runtime/budget. */
  stopWhenQualifiedTarget: boolean;
  candidateBudget: number;
  stageBatchSize: number;
  maxRuntimeMs: number | null;
  minScore: number | null;
  searchName: string;
}

export class StrategySearchApiValidationError extends Error {
  readonly code: string;
  readonly details: string[];

  constructor(code: string, message: string, details: string[] = []) {
    super(message);
    this.name = "StrategySearchApiValidationError";
    this.code = code;
    this.details = details;
  }
}

const DENY_KEYS = new Set([
  "candles",
  "preloadedCandles",
  "preloadedCandlesByKey",
  "saveStrategy",
  "strategyPath",
  "strategiesDir",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function requireFiniteNumber(
  value: unknown,
  label: string,
  details: string[],
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    details.push(`${label} must be a finite number`);
    return null;
  }
  return value;
}

function parseCostConfig(
  raw: unknown,
  details: string[],
): StrategySearchBacktestCostConfig | null {
  if (!isObject(raw)) {
    details.push("baseCostConfig must be an object");
    return null;
  }
  const feeRate = requireFiniteNumber(raw.feeRate, "baseCostConfig.feeRate", details);
  const slippageRate = requireFiniteNumber(
    raw.slippageRate,
    "baseCostConfig.slippageRate",
    details,
  );
  const fundingRate = requireFiniteNumber(
    raw.fundingRate,
    "baseCostConfig.fundingRate",
    details,
  );
  const spreadRate = requireFiniteNumber(
    raw.spreadRate,
    "baseCostConfig.spreadRate",
    details,
  );
  if (
    feeRate == null ||
    slippageRate == null ||
    fundingRate == null ||
    spreadRate == null
  ) {
    return null;
  }
  if (typeof raw.applyFunding !== "boolean") {
    details.push("baseCostConfig.applyFunding must be a boolean");
    return null;
  }
  if (typeof raw.applySpread !== "boolean") {
    details.push("baseCostConfig.applySpread must be a boolean");
    return null;
  }
  if ("costGuardK" in raw || "costGuardKOverride" in raw) {
    details.push("baseCostConfig must not include costGuardK fields");
    return null;
  }
  return {
    feeRate,
    slippageRate,
    fundingRate,
    applyFunding: raw.applyFunding,
    applySpread: raw.applySpread,
    spreadRate,
  };
}

function parseWindows(raw: unknown, details: string[]): StrategySearchWindow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) {
    details.push("evaluationWindows must be a non-empty array");
    return null;
  }
  const windows: StrategySearchWindow[] = [];
  let requiredCount = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const w = raw[i];
    if (!isObject(w)) {
      details.push(`evaluationWindows[${i}] must be an object`);
      return null;
    }
    if (typeof w.id !== "string" || !w.id) {
      details.push(`evaluationWindows[${i}].id is required`);
      return null;
    }
    if (typeof w.label !== "string") {
      details.push(`evaluationWindows[${i}].label must be a string`);
      return null;
    }
    const fromOpenTime = requireFiniteNumber(
      w.fromOpenTime,
      `evaluationWindows[${i}].fromOpenTime`,
      details,
    );
    const toOpenTime = requireFiniteNumber(
      w.toOpenTime,
      `evaluationWindows[${i}].toOpenTime`,
      details,
    );
    if (fromOpenTime == null || toOpenTime == null) return null;
    if (fromOpenTime > toOpenTime) {
      details.push(`evaluationWindows[${i}] fromOpenTime must be <= toOpenTime`);
      return null;
    }
    const requiredForPass =
      w.requiredForPass === undefined ? true : w.requiredForPass === true;
    if (w.requiredForPass !== undefined && typeof w.requiredForPass !== "boolean") {
      details.push(`evaluationWindows[${i}].requiredForPass must be a boolean`);
      return null;
    }
    if (requiredForPass) requiredCount += 1;
    windows.push({
      id: w.id,
      label: w.label,
      fromOpenTime,
      toOpenTime,
      requiredForPass,
    });
  }
  if (requiredCount === 0) {
    details.push("at least one evaluation window must be requiredForPass");
    return null;
  }
  return windows;
}

function parseDataRef(
  raw: unknown,
  details: string[],
): StrategySearchDataReference | null {
  if (!isObject(raw)) {
    details.push("dataRef must be an object");
    return null;
  }
  if (raw.source !== "binance_historical") {
    details.push('dataRef.source must be "binance_historical"');
    return null;
  }
  const availableFrom = requireFiniteNumber(
    raw.availableFrom,
    "dataRef.availableFrom",
    details,
  );
  const availableTo = requireFiniteNumber(
    raw.availableTo,
    "dataRef.availableTo",
    details,
  );
  if (availableFrom == null || availableTo == null) return null;
  if (availableFrom > availableTo) {
    details.push("dataRef.availableFrom must be <= availableTo");
    return null;
  }
  return {
    source: "binance_historical",
    availableFrom,
    availableTo,
  };
}

export interface ValidatedCreateSearchJob {
  config: StrategySearchConfig;
  execution: StrategySearchExecutionProfile;
  operatorPlan: ValidatedOperatorPlanInput | null;
}

/**
 * Validate and normalize a create-job API body.
 * Does not mutate the input object.
 */
export function validateCreateSearchJobBody(
  body: unknown,
): ValidatedCreateSearchJob {
  const details: string[] = [];
  if (!isObject(body)) {
    throw new StrategySearchApiValidationError(
      "INVALID_REQUEST",
      "request body must be a JSON object",
    );
  }

  for (const key of Object.keys(body)) {
    if (DENY_KEYS.has(key)) {
      details.push(`field "${key}" is not allowed`);
    }
  }

  if (
    typeof body.searchVersion !== "string" ||
    !body.searchVersion.trim()
  ) {
    details.push("searchVersion is required");
  }
  if (
    typeof body.strategyTemplateId !== "string" ||
    !body.strategyTemplateId.trim()
  ) {
    details.push("strategyTemplateId is required");
  }
  // Template id may reference SAFE as a read-only template name, but never
  // as a write target. Explicit overwrite flags are rejected above.
  if (
    typeof body.strategyTemplateId === "string" &&
    /data[/\\]strategies/i.test(body.strategyTemplateId)
  ) {
    details.push("strategyTemplateId must not be a filesystem path");
  }

  if (!Array.isArray(body.symbols) || body.symbols.length === 0) {
    details.push("symbols must be a non-empty array");
  } else if (!body.symbols.every((s) => typeof s === "string" && s.length > 0)) {
    details.push("symbols entries must be non-empty strings");
  }

  if (typeof body.timeframe !== "string" || !body.timeframe) {
    details.push("timeframe is required");
  }
  if (typeof body.dataVersion !== "string" || !body.dataVersion) {
    details.push("dataVersion is required");
  }

  const seed = requireFiniteNumber(body.seed, "seed", details);
  if (seed != null && !Number.isInteger(seed)) {
    details.push("seed must be an integer");
  }

  if (
    body.generatorType !== "random" &&
    body.generatorType !== "local" &&
    body.generatorType !== "genetic"
  ) {
    details.push('generatorType must be "random", "local", or "genetic"');
  }

  let maxIterations: number | null = null;
  if (body.maxIterations === null) {
    maxIterations = null;
  } else if (
    typeof body.maxIterations !== "number" ||
    !Number.isInteger(body.maxIterations) ||
    body.maxIterations < 1
  ) {
    details.push("maxIterations must be null or an integer >= 1");
  } else {
    maxIterations = body.maxIterations;
  }

  const rangesResult = validateSearchParameterRanges(
    Array.isArray(body.parameterRanges)
      ? (body.parameterRanges as StrategySearchConfig["parameterRanges"])
      : [],
  );
  if (!Array.isArray(body.parameterRanges) || body.parameterRanges.length === 0) {
    details.push("parameterRanges must be a non-empty array");
  } else if (!rangesResult.ok) {
    for (const issue of rangesResult.issues) {
      details.push(issue.message);
    }
  }

  const windows = parseWindows(body.evaluationWindows, details);
  const balance = requireFiniteNumber(body.balance, "balance", details);
  if (balance != null && balance <= 0) {
    details.push("balance must be > 0");
  }
  const baseCostConfig = parseCostConfig(body.baseCostConfig, details);
  const dataRef = parseDataRef(body.dataRef, details);

  if (!isObject(body.passPolicy)) {
    details.push("passPolicy must be an object");
  } else {
    try {
      validatePassPolicy(body.passPolicy as unknown as StrategySearchPassPolicy);
    } catch (err) {
      details.push(err instanceof Error ? err.message : "passPolicy invalid");
    }
  }

  if (!isObject(body.scoreWeights)) {
    details.push("scoreWeights must be an object");
  } else {
    try {
      validateScoreWeights(body.scoreWeights as unknown as StrategySearchScoreWeights);
    } catch (err) {
      details.push(err instanceof Error ? err.message : "scoreWeights invalid");
    }
  }

  if (!Array.isArray(body.costStressScenarios)) {
    details.push("costStressScenarios must be an array");
  } else {
    try {
      validateCostStressScenarios(
        body.costStressScenarios as unknown as StrategySearchCostStressScenario[],
      );
    } catch (err) {
      details.push(
        err instanceof Error ? err.message : "costStressScenarios invalid",
      );
    }
  }

  if (!isObject(body.jitterConfig)) {
    details.push("jitterConfig must be an object");
  } else {
    try {
      validateJitterConfig(body.jitterConfig as unknown as StrategySearchJitterConfig);
    } catch (err) {
      details.push(err instanceof Error ? err.message : "jitterConfig invalid");
    }
  }

  // Stub fields derived for StrategySearchConfig persistence
  if (!isObject(body.passCriteria) && body.passCriteria !== undefined) {
    details.push("passCriteria must be an object when provided");
  }

  if (details.length > 0) {
    throw new StrategySearchApiValidationError(
      "INVALID_REQUEST",
      "invalid strategy-search job configuration",
      details,
    );
  }

  const passPolicy = body.passPolicy as unknown as StrategySearchPassPolicy;
  const scoreWeights = body.scoreWeights as unknown as StrategySearchScoreWeights;
  const costStressScenarios =
    body.costStressScenarios as unknown as StrategySearchCostStressScenario[];
  const jitterConfig = body.jitterConfig as unknown as StrategySearchJitterConfig;
  const parameterRanges =
    body.parameterRanges as unknown as StrategySearchConfig["parameterRanges"];

  const config: StrategySearchConfig = {
    searchVersion: String(body.searchVersion),
    strategyTemplateId: String(body.strategyTemplateId),
    symbols: [...(body.symbols as string[])],
    timeframe: String(body.timeframe),
    dataVersion: String(body.dataVersion),
    seed: seed!,
    generatorType: body.generatorType as StrategySearchConfig["generatorType"],
    maxIterations,
    parameterRanges: parameterRanges.map((r) => ({ ...r })),
    evaluationWindows: windows!.map((w) => ({ ...w })),
    passCriteria: isObject(body.passCriteria)
      ? { ...(body.passCriteria as StrategySearchConfig["passCriteria"]) }
      : {
          minTradeCount: passPolicy.thresholds.minTradeCount ?? null,
          maxMdd: passPolicy.thresholds.maxMdd ?? null,
          minTotalReturn: passPolicy.thresholds.minTotalReturn ?? null,
          requireAllWindowsPass: true,
        },
    costStress: {
      enabled: costStressScenarios.length > 0,
      multipliers: costStressScenarios.map((s) => s.feeMultiplier),
    },
    jitter: {
      enabled: jitterConfig.enabled,
      samples: jitterConfig.enabled ? jitterConfig.sampleCount : 0,
      relativeAmplitude: jitterConfig.enabled ? jitterConfig.mutationScale : 0,
    },
  };

  const execution: StrategySearchExecutionProfile = {
    version: STRATEGY_SEARCH_EXECUTION_PROFILE_VERSION,
    balance: balance!,
    baseCostConfig: baseCostConfig!,
    passPolicy: { thresholds: { ...passPolicy.thresholds } },
    scoreWeights: { ...scoreWeights },
    costStressScenarios: costStressScenarios.map((s) => ({ ...s })),
    jitterConfig: {
      ...jitterConfig,
      parameterRanges: jitterConfig.parameterRanges.map((r) => ({ ...r })),
    },
    dataRef: { ...dataRef! },
  };

  let operatorPlan: ValidatedOperatorPlanInput | null = null;
  if (isObject(body.operatorPlan)) {
    const op = body.operatorPlan;
    const depth = op.depthProfile;
    const qual = op.qualificationProfile;
    const depthOk =
      depth === "fast" || depth === "standard" || depth === "deep";
    const qualOk =
      qual === "conservative" ||
      qual === "balanced" ||
      qual === "aggressive" ||
      qual === "custom";
    if (!depthOk) details.push("operatorPlan.depthProfile invalid");
    if (!qualOk) details.push("operatorPlan.qualificationProfile invalid");
    const qt = requireFiniteNumber(
      op.qualifiedTarget,
      "operatorPlan.qualifiedTarget",
      details,
    );
    const budget = requireFiniteNumber(
      op.candidateBudget,
      "operatorPlan.candidateBudget",
      details,
    );
    const stageBatch = requireFiniteNumber(
      op.stageBatchSize,
      "operatorPlan.stageBatchSize",
      details,
    );
    if (qt != null && (!Number.isInteger(qt) || qt < 1 || qt > 50)) {
      details.push("operatorPlan.qualifiedTarget must be 1–50");
    }
    if (budget != null && (!Number.isInteger(budget) || budget < 1)) {
      details.push("operatorPlan.candidateBudget must be a positive integer");
    }
    if (stageBatch != null && (!Number.isInteger(stageBatch) || stageBatch < 1)) {
      details.push("operatorPlan.stageBatchSize must be a positive integer");
    }
    let maxRuntimeMs: number | null = null;
    if (op.maxRuntimeMs != null) {
      maxRuntimeMs = requireFiniteNumber(
        op.maxRuntimeMs,
        "operatorPlan.maxRuntimeMs",
        details,
      );
    }
    let minScore: number | null = null;
    if (op.minScore != null && op.minScore !== "") {
      minScore = requireFiniteNumber(
        op.minScore,
        "operatorPlan.minScore",
        details,
      );
    }
    if (details.length === 0 && depthOk && qualOk && qt != null && budget != null && stageBatch != null) {
      operatorPlan = {
        depthProfile: depth,
        qualificationProfile: qual,
        qualifiedTarget: qt,
        stopWhenQualifiedTarget: op.stopWhenQualifiedTarget === true,
        candidateBudget: budget,
        stageBatchSize: stageBatch,
        maxRuntimeMs,
        minScore,
        searchName:
          typeof op.searchName === "string" && op.searchName.trim()
            ? op.searchName.trim().slice(0, 80)
            : String(body.strategyTemplateId).slice(0, 80),
      };
    }
  }

  if (details.length > 0) {
    throw new StrategySearchApiValidationError(
      "INVALID_REQUEST",
      "invalid strategy-search job configuration",
      details,
    );
  }

  return { config, execution, operatorPlan };
}
