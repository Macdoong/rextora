import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import * as strategyHash from "../src/lib/rextora/strategy/strategyHash";
import {
  StrategySearchGenerationError,
  createSeededRandom,
  createStrategySearchJobId,
  generateLocalCandidate,
  generateRandomCandidate,
  generateUniqueCandidate,
  getDefaultSafeV44SearchSpace,
  restoreSeededRandom,
  type StrategySearchCandidate,
  type StrategySearchParameterRange,
} from "../src/lib/rextora/strategySearch";

const SAFE_PATH = path.join(
  process.cwd(),
  "data",
  "strategies",
  "SAFE_v44_i4060.json",
);

function numericSubset(): StrategySearchParameterRange[] {
  return getDefaultSafeV44SearchSpace().filter((r) =>
    ["ema_fast", "ema_mid", "ema_slow", "sl_atr_mult", "confirm_bear"].includes(
      r.key,
    ),
  );
}

describe("strategySearch candidateGenerator", () => {
  it("produces identical sequences for the same seed and restores state", () => {
    const ranges = numericSubset();
    const jobId = createStrategySearchJobId();
    const a = createSeededRandom(12345);
    const b = createSeededRandom(12345);
    const seqA = [
      generateRandomCandidate({
        jobId,
        iteration: 0,
        parameterRanges: ranges,
        random: a,
        baseParams: CONTEXT_FALLBACK_PARAMS,
        searchVersion: "search-v2",
      }),
      generateRandomCandidate({
        jobId,
        iteration: 1,
        parameterRanges: ranges,
        random: a,
        baseParams: CONTEXT_FALLBACK_PARAMS,
        searchVersion: "search-v2",
      }),
    ];
    const seqB = [
      generateRandomCandidate({
        jobId,
        iteration: 0,
        parameterRanges: ranges,
        random: b,
        baseParams: CONTEXT_FALLBACK_PARAMS,
        searchVersion: "search-v2",
      }),
      generateRandomCandidate({
        jobId,
        iteration: 1,
        parameterRanges: ranges,
        random: b,
        baseParams: CONTEXT_FALLBACK_PARAMS,
        searchVersion: "search-v2",
      }),
    ];
    expect(seqA[0].params).toEqual(seqB[0].params);
    expect(seqA[1].params).toEqual(seqB[1].params);

    const mid = createSeededRandom(99);
    generateRandomCandidate({
      jobId,
      iteration: 0,
      parameterRanges: ranges,
      random: mid,
      baseParams: CONTEXT_FALLBACK_PARAMS,
      searchVersion: "search-v2",
    });
    const state = mid.getState();
    const continued = generateRandomCandidate({
      jobId,
      iteration: 1,
      parameterRanges: ranges,
      random: mid,
      baseParams: CONTEXT_FALLBACK_PARAMS,
      searchVersion: "search-v2",
    });
    const restored = restoreSeededRandom(state);
    const afterRestore = generateRandomCandidate({
      jobId,
      iteration: 1,
      parameterRanges: ranges,
      random: restored,
      baseParams: CONTEXT_FALLBACK_PARAMS,
      searchVersion: "search-v2",
    });
    expect(afterRestore.params).toEqual(continued.params);

    const other = createSeededRandom(54321);
    const different = generateRandomCandidate({
      jobId,
      iteration: 0,
      parameterRanges: ranges,
      random: other,
      baseParams: CONTEXT_FALLBACK_PARAMS,
      searchVersion: "search-v2",
    });
    expect(different.paramsHash).not.toBe(seqA[0].paramsHash);
  });

  it("formats candidate IDs safely and keeps values in range", () => {
    const ranges = numericSubset();
    const jobId = createStrategySearchJobId();
    const random = createSeededRandom(7);
    const candidate = generateRandomCandidate({
      jobId,
      iteration: 12,
      parameterRanges: ranges,
      random,
      baseParams: CONTEXT_FALLBACK_PARAMS,
      searchVersion: "search-v2",
    });
    expect(candidate.candidateId).toBe(`${jobId}_candidate_00000012`);
    expect(candidate.candidateId).not.toMatch(/SAFE_v44_i4060/i);
    expect(candidate.generatorType).toBe("random");
    expect(candidate.parentCandidateIds).toEqual([]);

    for (const key of Object.keys(CONTEXT_FALLBACK_PARAMS)) {
      expect(candidate.params[key]).toBeDefined();
    }
    for (const range of ranges) {
      const value = candidate.params[range.key];
      if (range.valueType === "boolean") {
        expect(typeof value).toBe("boolean");
      } else if (typeof range.min === "number" && typeof range.max === "number") {
        expect(value as number).toBeGreaterThanOrEqual(range.min);
        expect(value as number).toBeLessThanOrEqual(range.max);
      }
      if (range.valueType === "integer") {
        expect(Number.isInteger(value)).toBe(true);
      }
    }

    // Non-searchable fields remain base values
    expect(candidate.params.rsi_period).toBe(CONTEXT_FALLBACK_PARAMS.rsi_period);
  });

  it("local generation mutates around parent without mutating parent", () => {
    const ranges = numericSubset();
    const jobId = createStrategySearchJobId();
    const parent: StrategySearchCandidate = generateRandomCandidate({
      jobId,
      iteration: 0,
      parameterRanges: ranges,
      random: createSeededRandom(11),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      searchVersion: "search-v2",
    });
    const parentSnapshot = JSON.stringify(parent);
    const child = generateLocalCandidate({
      jobId,
      iteration: 1,
      parameterRanges: ranges,
      random: createSeededRandom(12),
      parentCandidate: parent,
      mutationScale: 0.2,
      searchVersion: "search-v2",
    });
    expect(JSON.stringify(parent)).toBe(parentSnapshot);
    expect(child.generatorType).toBe("local");
    expect(child.parentCandidateIds).toEqual([parent.candidateId]);

    for (const range of ranges) {
      if (range.valueType === "boolean") continue;
      if (typeof range.min !== "number" || typeof range.max !== "number") continue;
      const parentValue = parent.params[range.key] as number;
      const childValue = child.params[range.key] as number;
      const maxDelta = (range.max - range.min) * 0.2 + (range.step ?? 1);
      expect(Math.abs(childValue - parentValue)).toBeLessThanOrEqual(
        maxDelta + 1e-9,
      );
      expect(childValue).toBeGreaterThanOrEqual(range.min);
      expect(childValue).toBeLessThanOrEqual(range.max);
    }
  });

  it("hashes normalized params stably and rejects protected collisions", () => {
    const ranges = numericSubset();
    const jobId = createStrategySearchJobId();
    const c1 = generateRandomCandidate({
      jobId,
      iteration: 0,
      parameterRanges: ranges,
      random: createSeededRandom(21),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      searchVersion: "search-v2",
    });
    expect(c1.paramsHash).toBe(strategyHash.computeParamsHash(c1.params));
    const c2 = generateRandomCandidate({
      jobId,
      iteration: 1,
      parameterRanges: ranges,
      random: createSeededRandom(22),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      searchVersion: "search-v2",
    });
    if (JSON.stringify(c1.params) !== JSON.stringify(c2.params)) {
      expect(c1.paramsHash).not.toBe(c2.paramsHash);
    }

    const existing = new Set<string>([c1.paramsHash]);
    const unique = generateUniqueCandidate({
      mode: "random",
      existingHashes: existing,
      maxAttempts: 20,
      randomInput: {
        jobId,
        iteration: 3,
        parameterRanges: ranges,
        random: createSeededRandom(99),
        baseParams: CONTEXT_FALLBACK_PARAMS,
        searchVersion: "search-v2",
      },
    });
    expect(existing.has(unique.paramsHash)).toBe(false);
    expect(unique.iteration).toBe(3);
    expect(unique.candidateId.endsWith("_candidate_00000003")).toBe(true);

    const dupHashSpy = vi
      .spyOn(strategyHash, "computeParamsHash")
      .mockReturnValue("duplicatehash1");
    expect(() =>
      generateUniqueCandidate({
        mode: "random",
        existingHashes: new Set(["duplicatehash1"]),
        maxAttempts: 3,
        randomInput: {
          jobId,
          iteration: 9,
          parameterRanges: ranges,
          random: createSeededRandom(1000),
          baseParams: CONTEXT_FALLBACK_PARAMS,
          searchVersion: "search-v2",
        },
      }),
    ).toThrow(/unique candidate/);
    dupHashSpy.mockRestore();

    const spy = vi
      .spyOn(strategyHash, "computeParamsHash")
      .mockReturnValue("7893ca3f0e30");
    const lockedSpy = vi
      .spyOn(strategyHash, "isLockedSafeHash")
      .mockReturnValue(true);
    expect(() =>
      generateRandomCandidate({
        jobId,
        iteration: 0,
        parameterRanges: ranges,
        random: createSeededRandom(1),
        baseParams: CONTEXT_FALLBACK_PARAMS,
        searchVersion: "search-v2",
      }),
    ).toThrow(/7893ca3f0e30/);
    spy.mockRestore();
    lockedSpy.mockRestore();
  });

  it("does not write files and keeps SAFE bytes identical", () => {
    const before = fs.readFileSync(SAFE_PATH);
    const strategiesBefore = fs.readdirSync(path.dirname(SAFE_PATH));
    const ranges = numericSubset();
    const jobId = createStrategySearchJobId();
    generateRandomCandidate({
      jobId,
      iteration: 0,
      parameterRanges: ranges,
      random: createSeededRandom(1),
      baseParams: CONTEXT_FALLBACK_PARAMS,
      searchVersion: "search-v2",
    });
    const after = fs.readFileSync(SAFE_PATH);
    expect(Buffer.compare(before, after)).toBe(0);
    const json = JSON.parse(after.toString("utf8")) as {
      params_hash: string;
      name: string;
    };
    expect(json.name).toBe("SAFE_v44_i4060");
    expect(json.params_hash).toBe("7893ca3f0e30");
    expect(fs.readdirSync(path.dirname(SAFE_PATH))).toEqual(strategiesBefore);
  });

  it("rejects searchVersion referencing the protected strategy id", () => {
    expect(() =>
      generateRandomCandidate({
        jobId: createStrategySearchJobId(),
        iteration: 0,
        parameterRanges: numericSubset(),
        random: createSeededRandom(1),
        baseParams: CONTEXT_FALLBACK_PARAMS,
        searchVersion: "SAFE_v44_i4060",
      }),
    ).toThrow(/SAFE_v44_i4060/);
  });
});
