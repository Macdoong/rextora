/**
 * Phase 5.1 — corrupted checkpoint cases must fail cleanly without FS corruption.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  StrategySearchCheckpointError,
  StrategySearchJobRunnerError,
  createInitialRunnerPayload,
  createSearchJob,
  createSeededRandom,
  decodeRunnerCheckpointPayload,
  encodeRunnerCheckpointPayload,
  getSearchJob,
  markSearchJobRunning,
  readRunnerPayloadFromCheckpoint,
  runSearchJob,
  updateSearchCheckpoint,
  type StrategySearchConfig,
  type StrategySearchRunnerCheckpointPayload,
} from "../src/lib/rextora/strategySearch";

const SAFE_PATH = path.join(
  process.cwd(),
  "data",
  "strategies",
  "SAFE_v44_i4060.json",
);

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "rextora-search-ckpt-corrupt-"),
  );
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function sampleConfig(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "template_search_base",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 11,
    generatorType: "random",
    maxIterations: 2,
    parameterRanges: [
      { key: "ema_fast", min: 10, max: 30, step: 1, valueType: "integer" },
    ],
    evaluationWindows: [
      {
        id: "w1",
        label: "w1",
        fromOpenTime: 1,
        toOpenTime: 2,
      },
    ],
    passCriteria: { minTradeCount: null },
    costStress: { enabled: false, multipliers: [1] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

function validPayload(): StrategySearchRunnerCheckpointPayload {
  return createInitialRunnerPayload({
    prng: createSeededRandom(11).getState(),
    jobStatus: "running",
  });
}

function runFixtures(rootDir: string) {
  return {
    jobId: "",
    storeOptions: { rootDir },
    windows: [
      {
        id: "w1",
        label: "w1",
        requestedFrom: 1,
        requestedTo: 2,
        requiredForPass: true,
      },
    ],
    balance: 10_000,
    baseCostConfig: {
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0,
      applyFunding: false,
      applySpread: false,
      spreadRate: 0,
    },
    passPolicy: { thresholds: { minTradeCount: 0 } },
    scoreWeights: {
      returnWeight: 1,
      mddWeight: 0.5,
      profitFactorWeight: 0.25,
      winRateWeight: 0.25,
      tradeAdequacyWeight: 0.25,
      negativeMonthWeight: 0.1,
      consistencyWeight: 0.1,
    },
    costStressScenarios: [],
    jitterConfig: {
      enabled: false,
      sampleCount: 1,
      mutationScale: 0.1,
      seed: 1,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: [
        { key: "ema_fast", min: 10, max: 30, step: 1, valueType: "integer" as const },
      ],
    },
    evaluate: async () => {
      throw new Error("evaluate must not run on corrupt checkpoint");
    },
  };
}

function writeCorruptRandomState(
  rootDir: string,
  jobId: string,
  randomState: string,
): void {
  const file = path.join(rootDir, "jobs", `${jobId}.json`);
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
    status: string;
    checkpoint: Record<string, unknown>;
  };
  raw.status = "running";
  raw.checkpoint.randomState = randomState;
  raw.checkpoint.completedIterations = 1;
  raw.checkpoint.nextIteration = 1;
  fs.writeFileSync(file, JSON.stringify(raw, null, 2));
}

describe("strategySearch Phase 5.1 checkpoint corruption", () => {
  it("rejects invalid JSON with clear CORRUPT_CHECKPOINT error", () => {
    expect(() => decodeRunnerCheckpointPayload("{")).toThrow(
      StrategySearchCheckpointError,
    );
    try {
      decodeRunnerCheckpointPayload("{");
    } catch (err) {
      expect(err).toBeInstanceOf(StrategySearchCheckpointError);
      expect((err as StrategySearchCheckpointError).code).toBe(
        "CORRUPT_CHECKPOINT",
      );
      expect((err as Error).message).toMatch(/not valid JSON/i);
    }
  });

  it("rejects truncated / non-object payloads", () => {
    expect(() => decodeRunnerCheckpointPayload('"truncated')).toThrow(
      StrategySearchCheckpointError,
    );
    expect(() => decodeRunnerCheckpointPayload("null")).toThrow(
      StrategySearchCheckpointError,
    );
    expect(() => decodeRunnerCheckpointPayload("[]")).toThrow(
      StrategySearchCheckpointError,
    );
    expect(() => decodeRunnerCheckpointPayload('"x"')).toThrow(
      StrategySearchCheckpointError,
    );
  });

  it("rejects missing fields, invalid statistics, unknown job state, modified PRNG", () => {
    const base = JSON.parse(
      encodeRunnerCheckpointPayload(validPayload()),
    ) as Record<string, unknown>;

    const missingPrng = { ...base };
    delete missingPrng.prng;
    expect(() =>
      decodeRunnerCheckpointPayload(JSON.stringify(missingPrng)),
    ).toThrow(/prng/i);

    const badStats = {
      ...base,
      statistics: { generated: "nope" },
    };
    expect(() =>
      decodeRunnerCheckpointPayload(JSON.stringify(badStats)),
    ).toThrow(/statistics/i);

    const unknownState = { ...base, jobStatus: "exploded" };
    expect(() =>
      decodeRunnerCheckpointPayload(JSON.stringify(unknownState)),
    ).toThrow(/jobStatus/i);

    const badPrng = {
      ...base,
      prng: { algorithm: "xorshift", seed: 1, state: 1 },
    };
    expect(() =>
      decodeRunnerCheckpointPayload(JSON.stringify(badPrng)),
    ).toThrow(/prng algorithm/i);

    const mutatedState = {
      ...base,
      prng: { algorithm: "mulberry32", seed: 1.5, state: 2 },
    };
    expect(() =>
      decodeRunnerCheckpointPayload(JSON.stringify(mutatedState)),
    ).toThrow(/prng seed\/state/i);

    const wrongVersion = { ...base, version: 99 };
    expect(() =>
      decodeRunnerCheckpointPayload(JSON.stringify(wrongVersion)),
    ).toThrow(/version/i);
  });

  it("runSearchJob fails gracefully on corrupt checkpoint without FS/SAFE corruption", async () => {
    const safeBefore = fs.readFileSync(SAFE_PATH);
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig(), opts);
    const jobFile = path.join(root, "jobs", `${job.id}.json`);
    const indexFile = path.join(root, "index.json");

    writeCorruptRandomState(root, job.id, "{not-json");

    await expect(
      runSearchJob({
        ...runFixtures(root),
        jobId: job.id,
      }),
    ).rejects.toMatchObject({
      name: "StrategySearchJobRunnerError",
      code: "CORRUPT_CHECKPOINT",
    });

    const failed = getSearchJob(job.id, opts);
    expect(failed?.status).toBe("failed");
    expect(failed?.failureMessage).toMatch(/not valid JSON/i);

    // Job + index remain valid JSON (status update is expected; no FS corruption)
    const jobRaw = JSON.parse(fs.readFileSync(jobFile, "utf8")) as {
      id: string;
      status: string;
    };
    expect(jobRaw.id).toBe(job.id);
    expect(jobRaw.status).toBe("failed");
    const indexRaw = JSON.parse(fs.readFileSync(indexFile, "utf8")) as {
      jobs: Array<{ id: string; status: string }>;
    };
    expect(indexRaw.jobs.some((j) => j.id === job.id && j.status === "failed")).toBe(
      true,
    );

    const safeAfter = fs.readFileSync(SAFE_PATH);
    expect(Buffer.compare(safeBefore, safeAfter)).toBe(0);
    const safeJson = JSON.parse(safeAfter.toString("utf8")) as {
      name: string;
      params_hash: string;
    };
    expect(safeJson.name).toBe("SAFE_v44_i4060");
    expect(safeJson.params_hash).toBe("7893ca3f0e30");
  });

  it("runSearchJob fails on invalid statistics / unknown job state in persisted payload", async () => {
    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig(), opts);
    markSearchJobRunning(job.id, opts);

    const payload = validPayload();
    const encoded = encodeRunnerCheckpointPayload(payload);
    const parsed = JSON.parse(encoded) as Record<string, unknown>;
    parsed.statistics = {
      ...(parsed.statistics as object),
      evaluated: Number.NaN,
    };
    updateSearchCheckpoint(
      job.id,
      {
        completedIterations: 0,
        nextIteration: 0,
        randomState: JSON.stringify(parsed),
        bestCandidate: null,
        bestPassedCandidate: null,
        updatedAt: new Date().toISOString(),
      },
      opts,
    );

    await expect(
      runSearchJob({
        ...runFixtures(root),
        jobId: job.id,
      }),
    ).rejects.toBeInstanceOf(StrategySearchJobRunnerError);

    expect(getSearchJob(job.id, opts)?.status).toBe("failed");

    // Unknown job state
    const job2 = createSearchJob(sampleConfig({ seed: 22 }), opts);
    markSearchJobRunning(job2.id, opts);
    const p2 = JSON.parse(
      encodeRunnerCheckpointPayload(validPayload()),
    ) as Record<string, unknown>;
    p2.jobStatus = "not_a_real_state";
    updateSearchCheckpoint(
      job2.id,
      {
        completedIterations: 0,
        nextIteration: 0,
        randomState: JSON.stringify(p2),
        bestCandidate: null,
        bestPassedCandidate: null,
        updatedAt: new Date().toISOString(),
      },
      opts,
    );
    await expect(
      runSearchJob({
        ...runFixtures(root),
        jobId: job2.id,
      }),
    ).rejects.toMatchObject({ code: "CORRUPT_CHECKPOINT" });
    expect(getSearchJob(job2.id, opts)?.status).toBe("failed");
  });

  it("does not mutate checkpoint inputs during encode/build", () => {
    const payload = validPayload();
    payload.seenHashes.push("abc");
    const before = structuredClone(payload);
    const encoded = encodeRunnerCheckpointPayload(payload);
    payload.seenHashes.push("mutated-after-encode");
    const decoded = decodeRunnerCheckpointPayload(encoded)!;
    expect(decoded.seenHashes).toEqual(before.seenHashes);

    const best = {
      candidateId: "c1",
      iteration: 0,
      paramsHash: "h1",
      score: 1,
      passed: true,
    };
    const bestBefore = { ...best };
    const cp = {
      completedIterations: 1,
      nextIteration: 1,
      randomState: encoded,
      bestCandidate: best,
      bestPassedCandidate: best,
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    const read = readRunnerPayloadFromCheckpoint(cp);
    expect(read?.seenHashes).toEqual(before.seenHashes);
    best.score = -1;
    expect(bestBefore.score).toBe(1);
  });
});
