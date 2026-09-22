import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSearchJob,
  getSearchJob,
  listSearchJobs,
  saveSearchJob,
} from "../src/lib/rextora/strategySearch/jobStore";
import {
  inspectOrphanSearchJobs,
  recoverOrphanSearchJobs,
} from "../src/lib/rextora/strategySearch/orphanJobRecovery";
import { productionRextoraDataRootCanonical } from "../src/lib/rextora/storage/runtimePaths";
import type { StrategySearchConfig } from "../src/lib/rextora/strategySearch/types";

const LEAKED_FOSSIL_ID = "search_43ccb40b-8069-4829-a337-c54cdcef4a59";
const PRODUCTION_SEARCH_ROOT = path.join(
  productionRextoraDataRootCanonical(),
  "strategy-search",
);
const PRODUCTION_INDEX = path.join(PRODUCTION_SEARCH_ROOT, "index.json");
function sampleConfig(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "template_search_base",
    symbols: ["ETHUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 1,
    generatorType: "random",
    maxIterations: 10,
    parameterRanges: [{ key: "ema_fast", min: 10, max: 40, step: 1 }],
    evaluationWindows: [
      {
        id: "w1",
        label: "recent",
        fromOpenTime: 1_700_000_000_000,
        toOpenTime: 1_700_100_000_000,
      },
    ],
    passCriteria: { minTradeCount: 1, requireAllWindowsPass: true },
    costStress: { enabled: false, multipliers: [] },
    jitter: { enabled: false, samples: 0, relativeAmplitude: 0 },
  };
}

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

describe("research active index invariant", () => {
  const previousSearchDir = process.env.REXTORA_STRATEGY_SEARCH_DIR;
  let tempRoot = "";

  afterEach(() => {
    if (previousSearchDir === undefined) delete process.env.REXTORA_STRATEGY_SEARCH_DIR;
    else process.env.REXTORA_STRATEGY_SEARCH_DIR = previousSearchDir;
    if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = "";
  });

  it("production index remains authoritative and excludes the leaked fossil", () => {
    const indexBefore = sha256File(PRODUCTION_INDEX);
    const index = JSON.parse(fs.readFileSync(PRODUCTION_INDEX, "utf8")) as {
      jobs: Array<{ id: string; status: string }>;
    };
    expect(index.jobs.length).toBeGreaterThan(0);
    expect(index.jobs.some((row) => row.id === LEAKED_FOSSIL_ID)).toBe(false);

    const listed = listSearchJobs({ rootDir: PRODUCTION_SEARCH_ROOT });
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.length).toBeLessThanOrEqual(index.jobs.length);
    expect(listed.every((job) => index.jobs.some((row) => row.id === job.id))).toBe(true);
    expect(listed.some((job) => job.id === LEAKED_FOSSIL_ID)).toBe(false);

    const inspection = inspectOrphanSearchJobs({ rootDir: PRODUCTION_SEARCH_ROOT });
    expect(inspection.mutation).toBe(false);
    expect(inspection.candidates).not.toContain(LEAKED_FOSSIL_ID);
    expect(inspection.skipped).not.toContain(LEAKED_FOSSIL_ID);
    expect(inspection.scanned).toBeLessThanOrEqual(index.jobs.length);

    const fossilPath = path.join(
      PRODUCTION_SEARCH_ROOT,
      "jobs",
      `${LEAKED_FOSSIL_ID}.json`,
    );
    expect(fs.existsSync(fossilPath)).toBe(true);
    const fossil = getSearchJob(LEAKED_FOSSIL_ID, { rootDir: PRODUCTION_SEARCH_ROOT });
    expect(fossil?.status).toBe("interrupted");
    expect(fossil?.id).toBe(LEAKED_FOSSIL_ID);
    expect(sha256File(PRODUCTION_INDEX)).toBe(indexBefore);
  });

  it("disk-only historical files cannot become active, recovered, or counted", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-index-invariant-"));
    const indexed = createSearchJob(sampleConfig(), { rootDir: tempRoot });
    const fossil = createSearchJob(sampleConfig(), { rootDir: tempRoot });
    const fossilFile = path.join(tempRoot, "jobs", `${fossil.id}.json`);
    const raw = JSON.parse(fs.readFileSync(fossilFile, "utf8")) as {
      id: string;
      status: string;
    };
    raw.status = "interrupted";
    fs.writeFileSync(fossilFile, JSON.stringify(raw, null, 2));

    const indexPath = path.join(tempRoot, "index.json");
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
      jobs: Array<{ id: string }>;
    };
    index.jobs = index.jobs.filter((row) => row.id !== fossil.id);
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));

    const listed = listSearchJobs({ rootDir: tempRoot });
    expect(listed.map((job) => job.id)).toEqual([indexed.id]);
    expect(listed).toHaveLength(1);

    const inspection = inspectOrphanSearchJobs({ rootDir: tempRoot });
    expect(inspection.candidates).not.toContain(fossil.id);
    expect(inspection.scanned).toBe(1);

    const recovered = recoverOrphanSearchJobs({ rootDir: tempRoot });
    expect(recovered.resumed).not.toContain(fossil.id);
    expect(recovered.recordRecovered).not.toContain(fossil.id);
    expect(listSearchJobs({ rootDir: tempRoot }).map((job) => job.id)).toEqual([
      indexed.id,
    ]);
    expect(getSearchJob(fossil.id, { rootDir: tempRoot })?.id).toBe(fossil.id);
    expect(
      (JSON.parse(fs.readFileSync(indexPath, "utf8")) as { jobs: Array<{ id: string }> })
        .jobs.map((row) => row.id),
    ).toEqual([indexed.id]);
  });

  it("saveSearchJob on an explicit disk-only id is the only path that can re-index it", () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-index-import-"));
    const fossil = createSearchJob(sampleConfig(), { rootDir: tempRoot });
    const indexPath = path.join(tempRoot, "index.json");
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as {
      jobs: Array<{ id: string }>;
    };
    index.jobs = [];
    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
    expect(listSearchJobs({ rootDir: tempRoot })).toHaveLength(0);

    const loaded = getSearchJob(fossil.id, { rootDir: tempRoot });
    expect(loaded).not.toBeNull();
    saveSearchJob(loaded!, { rootDir: tempRoot });
    expect(listSearchJobs({ rootDir: tempRoot }).map((job) => job.id)).toEqual([
      fossil.id,
    ]);
  });
});
