import { computeParamsHash, isLockedSafeHash } from "../strategy/strategyHash";
import type { SafeV44Params } from "../strategy/strategyTypes";
import {
  assertStrategySearchIteration,
  assertStrategySearchJobId,
  createStrategySearchCandidateId,
} from "./searchId";
import {
  normalizeCandidateParams,
  validateCandidateParams,
  validateSearchParameterRanges,
} from "./paramSpace";
import type { SeededRandom } from "./random";
import type {
  StrategySearchCandidate,
  StrategySearchParameterRange,
  StrategySearchParameterValue,
  StrategySearchParameterValueType,
} from "./types";

const PROTECTED_STRATEGY_ID = "SAFE_v44_i4060";

export class StrategySearchGenerationError extends Error {
  readonly code:
    | "VALIDATION_FAILED"
    | "PROTECTED_HASH_COLLISION"
    | "DUPLICATE_EXHAUSTED"
    | "INVALID_INPUT";

  constructor(
    code: StrategySearchGenerationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "StrategySearchGenerationError";
    this.code = code;
  }
}

export interface GenerateRandomCandidateInput {
  jobId: string;
  iteration: number;
  parameterRanges: StrategySearchParameterRange[];
  random: SeededRandom;
  baseParams: Record<string, StrategySearchParameterValue> | SafeV44Params;
  searchVersion: string;
}

export interface GenerateLocalCandidateInput {
  jobId: string;
  iteration: number;
  parameterRanges: StrategySearchParameterRange[];
  random: SeededRandom;
  parentCandidate: StrategySearchCandidate;
  mutationScale: number;
  searchVersion: string;
}

export interface GenerateUniqueCandidateInput {
  mode: "random" | "local";
  existingHashes: Set<string>;
  maxAttempts: number;
  randomInput?: GenerateRandomCandidateInput;
  localInput?: GenerateLocalCandidateInput;
}

function assertNotProtectedToken(label: string, value: string): void {
  if (value === PROTECTED_STRATEGY_ID || /SAFE_v44_i4060/i.test(value)) {
    throw new StrategySearchGenerationError(
      "INVALID_INPUT",
      `${label} must not reference ${PROTECTED_STRATEGY_ID}`,
    );
  }
}

function resolveValueType(
  range: StrategySearchParameterRange,
): StrategySearchParameterValueType {
  if (range.valueType) return range.valueType;
  if (typeof range.min === "boolean" || typeof range.max === "boolean") {
    return "boolean";
  }
  if (range.enumValues && range.enumValues.length > 0) return "enum";
  return "float";
}

function cloneParams(
  params: Record<string, StrategySearchParameterValue> | SafeV44Params,
): Record<string, StrategySearchParameterValue> {
  const out: Record<string, StrategySearchParameterValue> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    out[k] = v as StrategySearchParameterValue;
  }
  return out;
}

function sampleFromRange(
  range: StrategySearchParameterRange,
  random: SeededRandom,
): StrategySearchParameterValue {
  const valueType = resolveValueType(range);
  if (valueType === "boolean") {
    return random.next() < 0.5;
  }
  if (valueType === "enum") {
    if (!range.enumValues?.length) {
      throw new StrategySearchGenerationError(
        "INVALID_INPUT",
        `enum range missing values for ${range.key}`,
      );
    }
    return random.pick(range.enumValues);
  }
  if (typeof range.min !== "number" || typeof range.max !== "number") {
    throw new StrategySearchGenerationError(
      "INVALID_INPUT",
      `numeric range requires numeric min/max for ${range.key}`,
    );
  }
  if (valueType === "integer") {
    return random.nextInt(Math.ceil(range.min), Math.floor(range.max));
  }
  return random.nextFloat(range.min, range.max);
}

function mutateAroundParent(
  range: StrategySearchParameterRange,
  parentValue: StrategySearchParameterValue,
  mutationScale: number,
  random: SeededRandom,
): StrategySearchParameterValue {
  const valueType = resolveValueType(range);
  if (valueType === "boolean") {
    // Deterministic chance to flip; often remains unchanged.
    if (random.next() < 0.25 * mutationScale) {
      return !Boolean(parentValue);
    }
    return Boolean(parentValue);
  }
  if (valueType === "enum") {
    const values = range.enumValues ?? [];
    if (values.length === 0) return parentValue;
    if (random.next() < 0.35 * mutationScale) {
      return random.pick(values);
    }
    return parentValue;
  }
  if (
    typeof parentValue !== "number" ||
    typeof range.min !== "number" ||
    typeof range.max !== "number"
  ) {
    return parentValue;
  }
  const width = range.max - range.min;
  const maxDelta = width * mutationScale;
  const delta = random.nextFloat(-maxDelta, maxDelta);
  return parentValue + delta;
}

function finalizeCandidate(input: {
  jobId: string;
  iteration: number;
  generatorType: "random" | "local";
  parentCandidateIds: string[];
  params: Record<string, StrategySearchParameterValue>;
  parameterRanges: StrategySearchParameterRange[];
}): StrategySearchCandidate {
  const normalized = normalizeCandidateParams(
    input.params,
    input.parameterRanges,
  );
  const validation = validateCandidateParams(normalized, input.parameterRanges);
  if (!validation.ok) {
    throw new StrategySearchGenerationError(
      "VALIDATION_FAILED",
      `candidate validation failed: ${validation.issues
        .map((i) => i.code)
        .join(",")}`,
    );
  }

  const paramsHash = computeParamsHash(normalized);
  if (isLockedSafeHash(paramsHash) || paramsHash === "7893ca3f0e30") {
    throw new StrategySearchGenerationError(
      "PROTECTED_HASH_COLLISION",
      "generated params_hash collides with protected SAFE hash 7893ca3f0e30",
    );
  }

  const candidateId = createStrategySearchCandidateId(
    input.jobId,
    input.iteration,
  );
  assertNotProtectedToken("candidateId", candidateId);

  return {
    candidateId,
    jobId: input.jobId,
    iteration: input.iteration,
    generatorType: input.generatorType,
    parentCandidateIds: [...input.parentCandidateIds],
    params: normalized,
    paramsHash,
    createdAt: new Date().toISOString(),
  };
}

const GENERATION_ATTEMPTS = 64;

function tryFinalize(
  buildParams: () => Record<string, StrategySearchParameterValue>,
  meta: {
    jobId: string;
    iteration: number;
    generatorType: "random" | "local";
    parentCandidateIds: string[];
    parameterRanges: StrategySearchParameterRange[];
  },
): StrategySearchCandidate {
  let lastError: unknown;
  for (let attempt = 0; attempt < GENERATION_ATTEMPTS; attempt += 1) {
    try {
      return finalizeCandidate({
        ...meta,
        params: buildParams(),
      });
    } catch (error) {
      lastError = error;
      if (
        error instanceof StrategySearchGenerationError &&
        error.code === "PROTECTED_HASH_COLLISION"
      ) {
        // Retry with a new draw — collision is rare and regenerable.
        continue;
      }
      if (
        error instanceof StrategySearchGenerationError &&
        error.code === "VALIDATION_FAILED"
      ) {
        continue;
      }
      throw error;
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new StrategySearchGenerationError(
    "VALIDATION_FAILED",
    "unable to generate a valid candidate",
  );
}

export function generateRandomCandidate(
  input: GenerateRandomCandidateInput,
): StrategySearchCandidate {
  assertStrategySearchJobId(input.jobId);
  assertStrategySearchIteration(input.iteration);
  assertNotProtectedToken("searchVersion", input.searchVersion);
  assertNotProtectedToken("jobId", input.jobId);

  const rangeCheck = validateSearchParameterRanges(input.parameterRanges);
  if (!rangeCheck.ok) {
    throw new StrategySearchGenerationError(
      "VALIDATION_FAILED",
      `invalid parameterRanges: ${rangeCheck.issues[0]?.message}`,
    );
  }

  return tryFinalize(
    () => {
      const params = cloneParams(input.baseParams);
      for (const range of input.parameterRanges) {
        params[range.key] = sampleFromRange(range, input.random);
      }
      return params;
    },
    {
      jobId: input.jobId,
      iteration: input.iteration,
      generatorType: "random",
      parentCandidateIds: [],
      parameterRanges: input.parameterRanges,
    },
  );
}

export function generateLocalCandidate(
  input: GenerateLocalCandidateInput,
): StrategySearchCandidate {
  assertStrategySearchJobId(input.jobId);
  assertStrategySearchIteration(input.iteration);
  assertNotProtectedToken("searchVersion", input.searchVersion);
  assertNotProtectedToken("jobId", input.jobId);

  if (
    !Number.isFinite(input.mutationScale) ||
    input.mutationScale <= 0 ||
    input.mutationScale > 1
  ) {
    throw new StrategySearchGenerationError(
      "INVALID_INPUT",
      "mutationScale must be in (0, 1]",
    );
  }

  const rangeCheck = validateSearchParameterRanges(input.parameterRanges);
  if (!rangeCheck.ok) {
    throw new StrategySearchGenerationError(
      "VALIDATION_FAILED",
      `invalid parameterRanges: ${rangeCheck.issues[0]?.message}`,
    );
  }

  return tryFinalize(
    () => {
      // Clone parent params — never mutate parentCandidate.
      const params = cloneParams(input.parentCandidate.params);
      for (const range of input.parameterRanges) {
        const parentValue = params[range.key];
        if (parentValue === undefined) continue;
        params[range.key] = mutateAroundParent(
          range,
          parentValue,
          input.mutationScale,
          input.random,
        );
      }
      return params;
    },
    {
      jobId: input.jobId,
      iteration: input.iteration,
      generatorType: "local",
      parentCandidateIds: [input.parentCandidate.candidateId],
      parameterRanges: input.parameterRanges,
    },
  );
}

/**
 * Retry generation until paramsHash is unique.
 * Iteration / candidateId stay fixed to the requested iteration.
 */
export function generateUniqueCandidate(
  input: GenerateUniqueCandidateInput,
): StrategySearchCandidate {
  if (!Number.isInteger(input.maxAttempts) || input.maxAttempts < 1) {
    throw new StrategySearchGenerationError(
      "INVALID_INPUT",
      "maxAttempts must be a positive integer",
    );
  }

  for (let attempt = 0; attempt < input.maxAttempts; attempt += 1) {
    const candidate =
      input.mode === "random"
        ? generateRandomCandidate(input.randomInput!)
        : generateLocalCandidate(input.localInput!);
    if (!input.existingHashes.has(candidate.paramsHash)) {
      return candidate;
    }
  }

  throw new StrategySearchGenerationError(
    "DUPLICATE_EXHAUSTED",
    `unable to generate a unique candidate after ${input.maxAttempts} attempts`,
  );
}
