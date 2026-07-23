import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSearchJob,
  createStrategySearchCandidateId,
  getSearchJob,
  getSearchTrial,
  updateSearchCheckpoint,
  saveSearchTrial,
  type StrategySearchConfig,
} from "../src/lib/rextora/strategySearch";

const DEFAULT_ROOT = path.join(
  process.cwd(),
  "data",
  "rextora",
  "strategy-search",
);

const SAFE_DIR = path.join(process.cwd(), "data", "strategies");

let createdJobId: string | null = null;
let rootExistedBefore = false;
let jobsDirExistedBefore = false;
let trialsDirExistedBefore = false;
let indexExistedBefore = false;

function sampleConfig(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "template_default_root",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 1001,
    generatorType: "random",
    maxIterations: 3,
    parameterRanges: [{ key: "ema_fast", min: 10, max: 20, step: 1 }],
    evaluationWindows: [
      {
        id: "w",
        label: "window",
        fromOpenTime: 10,
        toOpenTime: 20,
      },
    ],
    passCriteria: { minTradeCount: 0 },
    costStress: { enabled: false, multipliers: [1] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

function removeIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) fs.rmSync(filePath, { recursive: true, force: true });
}

afterEach(() => {
  if (createdJobId) {
    const jobId = createdJobId;
    createdJobId = null;
    removeIfExists(path.join(DEFAULT_ROOT, "jobs", `${jobId}.json`));
    removeIfExists(path.join(DEFAULT_ROOT, "jobs", `${jobId}.json.tmp`));
    removeIfExists(path.join(DEFAULT_ROOT, "jobs", `${jobId}.json.bak`));
    removeIfExists(path.join(DEFAULT_ROOT, "trials", jobId));

    // Rebuild index without this job if index exists
    const indexPath = path.join(DEFAULT_ROOT, "index.json");
    if (fs.existsSync(indexPath)) {
      try {
        const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
          version: 1;
          updatedAt: string;
          jobs: Array<{ id: string }>;
        };
        const remaining = (index.jobs ?? []).filter((j) => j.id !== jobId);
        if (remaining.length === 0 && !indexExistedBefore) {
          removeIfExists(indexPath);
          removeIfExists(`${indexPath}.tmp`);
          removeIfExists(`${indexPath}.bak`);
        } else {
          fs.writeFileSync(
            indexPath,
            JSON.stringify(
              {
                version: 1,
                updatedAt: new Date().toISOString(),
                jobs: remaining,
              },
              null,
              2,
            ),
            "utf8",
          );
        }
      } catch {
        // leave pre-existing corrupt index alone
      }
    }

    if (!jobsDirExistedBefore) {
      const jobsDir = path.join(DEFAULT_ROOT, "jobs");
      if (fs.existsSync(jobsDir) && fs.readdirSync(jobsDir).length === 0) {
        fs.rmdirSync(jobsDir);
      }
    }
    if (!trialsDirExistedBefore) {
      const trialsDir = path.join(DEFAULT_ROOT, "trials");
      if (fs.existsSync(trialsDir) && fs.readdirSync(trialsDir).length === 0) {
        fs.rmdirSync(trialsDir);
      }
    }
    if (!rootExistedBefore) {
      if (
        fs.existsSync(DEFAULT_ROOT) &&
        fs.readdirSync(DEFAULT_ROOT).length === 0
      ) {
        fs.rmdirSync(DEFAULT_ROOT);
      }
    }
  }
});

describe("strategySearch default root restart", () => {
  it("persists and reloads through the real default runtime root", () => {
    rootExistedBefore = fs.existsSync(DEFAULT_ROOT);
    jobsDirExistedBefore = fs.existsSync(path.join(DEFAULT_ROOT, "jobs"));
    trialsDirExistedBefore = fs.existsSync(path.join(DEFAULT_ROOT, "trials"));
    indexExistedBefore = fs.existsSync(path.join(DEFAULT_ROOT, "index.json"));

    const safeBefore = fs.readFileSync(
      path.join(SAFE_DIR, "SAFE_v44_i4060.json"),
    );

    // Default root (no rootDir override) — simulates a fresh process handle
    const job = createSearchJob(sampleConfig());
    createdJobId = job.id;

    const checkpointed = updateSearchCheckpoint(job.id, {
      completedIterations: 1,
      nextIteration: 1,
      randomState: "default-root-rng",
      bestCandidate: {
        candidateId: createStrategySearchCandidateId(job.id, 0),
        iteration: 0,
        paramsHash: "defaulthash01",
        score: 3.5,
        passed: true,
      },
      bestPassedCandidate: {
        candidateId: createStrategySearchCandidateId(job.id, 0),
        iteration: 0,
        paramsHash: "defaulthash01",
        score: 3.5,
        passed: true,
      },
      updatedAt: new Date().toISOString(),
    });

    const trial = saveSearchTrial({
      jobId: job.id,
      iteration: 0,
      candidateId: createStrategySearchCandidateId(job.id, 0),
      params: { ema_fast: 16 },
      paramsHash: "defaulthash01",
      generatorType: "random",
      parentCandidateIds: [],
      score: 3.5,
      passed: true,
      failureReasons: [],
      windowResults: [{ windowId: "w", ok: true }],
      costStressResults: [],
      jitterResults: [],
      durationMs: 5,
      createdAt: new Date().toISOString(),
    });

    // Simulate process restart: new calls with default configuration
    const reloadedJob = getSearchJob(job.id);
    const reloadedTrial = getSearchTrial(job.id, 0);

    expect(reloadedJob).not.toBeNull();
    expect(reloadedJob?.id).toBe(job.id);
    expect(reloadedJob?.checkpoint.completedIterations).toBe(1);
    expect(reloadedJob?.checkpoint.randomState).toBe("default-root-rng");
    expect(reloadedJob?.checkpoint.bestCandidate?.paramsHash).toBe(
      checkpointed.checkpoint.bestCandidate?.paramsHash,
    );
    expect(reloadedTrial?.paramsHash).toBe(trial.paramsHash);
    expect(reloadedTrial?.candidateId).toBe(trial.candidateId);

    expect(
      fs.existsSync(path.join(DEFAULT_ROOT, "jobs", `${job.id}.json`)),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(DEFAULT_ROOT, "trials", job.id, "00000000.json")),
    ).toBe(true);

    const safeAfter = fs.readFileSync(
      path.join(SAFE_DIR, "SAFE_v44_i4060.json"),
    );
    expect(Buffer.compare(safeBefore, safeAfter)).toBe(0);
    expect(
      fs
        .readdirSync(SAFE_DIR)
        .some((name) => name.includes(job.id) || name.startsWith("search_")),
    ).toBe(false);
  });
});
