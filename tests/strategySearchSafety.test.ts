import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSearchJob,
  createStrategySearchCandidateId,
  createStrategySearchJobId,
  getSearchJob,
  markSearchJobCancelled,
  markSearchJobPaused,
  markSearchJobRunning,
  requestCancelSearchJob,
  requestPauseSearchJob,
  resumeSearchJob,
  saveSearchTrial,
  updateSearchCheckpoint,
  type StrategySearchConfig,
} from "../src/lib/rextora/strategySearch";

const SAFE_PATH = path.join(
  process.cwd(),
  "data",
  "strategies",
  "SAFE_v44_i4060.json",
);

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-search-safe-"));
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
    seed: 7,
    generatorType: "local",
    maxIterations: 2,
    parameterRanges: [{ key: "ema_fast", min: 10, max: 30, step: 1 }],
    evaluationWindows: [
      {
        id: "full",
        label: "full",
        fromOpenTime: 1,
        toOpenTime: 2,
      },
    ],
    passCriteria: { minTradeCount: null },
    costStress: { enabled: false, multipliers: [1] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

describe("strategySearch SAFE integrity", () => {
  it("preserves SAFE_v44_i4060 name and hash", () => {
    const raw = JSON.parse(fs.readFileSync(SAFE_PATH, "utf8")) as {
      name: string;
      params_hash: string;
    };
    expect(raw.name).toBe("SAFE_v44_i4060");
    expect(raw.params_hash).toBe("7893ca3f0e30");
  });

  it("keeps protected SAFE bytes identical across store ops and recovery", () => {
    const before = fs.readFileSync(SAFE_PATH);
    const strategiesDirBefore = new Set(
      fs.readdirSync(path.join(process.cwd(), "data", "strategies")),
    );

    const root = makeTempRoot();
    const opts = { rootDir: root };
    const job = createSearchJob(sampleConfig(), opts);

    markSearchJobRunning(job.id, opts);
    updateSearchCheckpoint(
      job.id,
      {
        completedIterations: 1,
        nextIteration: 1,
        randomState: "token",
        bestCandidate: null,
        bestPassedCandidate: null,
        updatedAt: new Date().toISOString(),
      },
      opts,
    );
    saveSearchTrial(
      {
        jobId: job.id,
        iteration: 0,
        candidateId: createStrategySearchCandidateId(job.id, 0),
        params: { ema_fast: 18 },
        paramsHash: "deadbeefcafe",
        generatorType: "local",
        parentCandidateIds: [],
        score: null,
        passed: false,
        failureReasons: [{ code: "phase1", message: "no evaluation yet" }],
        windowResults: [],
        costStressResults: [],
        jitterResults: [],
        durationMs: 1,
        createdAt: new Date().toISOString(),
      },
      opts,
    );

    requestPauseSearchJob(job.id, opts);
    markSearchJobPaused(job.id, opts);
    resumeSearchJob(job.id, opts);
    markSearchJobRunning(job.id, opts);
    requestCancelSearchJob(job.id, opts);
    markSearchJobCancelled(job.id, opts);

    // Recovery scenario: valid .bak, missing target
    const target = path.join(root, "jobs", `${job.id}.json`);
    const bak = `${target}.bak`;
    fs.copyFileSync(target, bak);
    fs.unlinkSync(target);
    const recovered = getSearchJob(job.id, opts);
    expect(recovered?.id).toBe(job.id);
    expect(recovered?.status).toBe("cancelled");

    const after = fs.readFileSync(SAFE_PATH);
    expect(Buffer.compare(before, after)).toBe(0);

    const safeJson = JSON.parse(after.toString("utf8")) as {
      name: string;
      params_hash: string;
    };
    expect(safeJson.name).toBe("SAFE_v44_i4060");
    expect(safeJson.params_hash).toBe("7893ca3f0e30");

    const strategiesDirAfter = new Set(
      fs.readdirSync(path.join(process.cwd(), "data", "strategies")),
    );
    expect(strategiesDirAfter).toEqual(strategiesDirBefore);

    expect(job.id).not.toMatch(/SAFE_v44_i4060/i);
    expect(createStrategySearchCandidateId(job.id, 0)).not.toMatch(
      /SAFE_v44_i4060/i,
    );
    expect(createStrategySearchJobId()).not.toMatch(/SAFE_v44_i4060/i);

    for (const name of fs.readdirSync(
      path.join(process.cwd(), "data", "strategies"),
    )) {
      expect(name.startsWith("search_")).toBe(false);
      expect(name).not.toContain(job.id);
    }
    expect(
      fs.existsSync(
        path.join(process.cwd(), "data", "strategies", `${job.id}.json`),
      ),
    ).toBe(false);
  });
});
