import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeJsonStore, invalidateJsonStoreCache } from "../src/lib/rextora/storage/jsonStore";
import {
  productionRextoraDataRootCanonical,
  rextoraDataRoot,
} from "../src/lib/rextora/storage/runtimePaths";
import {
  UNSAFE_TEST_REXTORA_STORE,
  assertTestStoreIsNotProduction,
} from "../src/lib/rextora/storage/testStoreGuard";
import { createSearchJob, listSearchJobs } from "../src/lib/rextora/strategySearch/jobStore";
import { recoverOrphanSearchJobs } from "../src/lib/rextora/strategySearch/orphanJobRecovery";
import { writeDurableJsonPayload } from "../src/lib/rextora/strategySearch/durableJsonWrite";
import type { StrategySearchConfig } from "../src/lib/rextora/strategySearch/types";

const PRODUCTION_PATHS = {
  research: path.join(process.cwd(), "data/rextora/strategy-search/index.json"),
  backtest: path.join(process.cwd(), "data/rextora/backtests/index.json"),
  strategy: path.join(process.cwd(), "data/rextora/strategies/index.json"),
  positions: path.join(process.cwd(), "data/rextora/positions.json"),
  paper: path.join(process.cwd(), "data/rextora/paper-sessions/index.json"),
  safe: path.join(process.cwd(), "data/strategies/SAFE_v44_i4060.json"),
} as const;

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function snapshotProduction(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(PRODUCTION_PATHS).map(([key, filePath]) => [key, sha256File(filePath)]),
  );
}

function sampleConfig(): StrategySearchConfig {
  return {
    searchVersion: "1",
    strategyTemplateId: "template_search_base",
    symbols: ["BTCUSDT"],
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

describe("production store isolation", () => {
  const previousDataDir = process.env.REXTORA_DATA_DIR;

  afterEach(() => {
    if (previousDataDir === undefined) delete process.env.REXTORA_DATA_DIR;
    else process.env.REXTORA_DATA_DIR = previousDataDir;
    invalidateJsonStoreCache();
  });

  it("uses an isolated writable data root by default", () => {
    const isolated = path.resolve(rextoraDataRoot());
    const production = path.resolve(productionRextoraDataRootCanonical());
    expect(isolated).not.toBe(production);
    expect(isolated.startsWith(production + path.sep)).toBe(false);
    expect(process.env.REXTORA_DATA_DIR).toBeTruthy();
    expect(path.resolve(process.env.REXTORA_DATA_DIR!)).toBe(isolated);
  });

  it("representative mutating Research/Paper/json writes leave production hashes unchanged", () => {
    const before = snapshotProduction();
    writeJsonStore("isolation-probe.json", { ok: true });
    const job = createSearchJob(sampleConfig());
    expect(job.id.startsWith("search_")).toBe(true);
    expect(listSearchJobs().some((row) => row.id === job.id)).toBe(true);
    recoverOrphanSearchJobs();
    const after = snapshotProduction();
    expect(after).toEqual(before);
    expect(fs.existsSync(path.join(isolatedOrThrow(), "isolation-probe.json"))).toBe(true);
    expect(
      fs.existsSync(
        path.join(productionRextoraDataRootCanonical(), "isolation-probe.json"),
      ),
    ).toBe(false);
  });

  it("write guard rejects an intentional production mutation path before disk change", () => {
    const before = snapshotProduction();
    const productionIndex = PRODUCTION_PATHS.research;
    delete process.env.REXTORA_DATA_DIR;
    invalidateJsonStoreCache();

    expect(() => writeJsonStore("positions.json", { leaked: true })).toThrow(
      UNSAFE_TEST_REXTORA_STORE,
    );
    expect(() =>
      writeDurableJsonPayload(productionIndex, JSON.stringify({ leaked: true })),
    ).toThrow(UNSAFE_TEST_REXTORA_STORE);
    expect(() => assertTestStoreIsNotProduction(productionIndex)).toThrow(
      UNSAFE_TEST_REXTORA_STORE,
    );
    expect(() => createSearchJob(sampleConfig())).toThrow(
      UNSAFE_TEST_REXTORA_STORE,
    );

    expect(snapshotProduction()).toEqual(before);
  });
});

function isolatedOrThrow(): string {
  const isolated = process.env.REXTORA_DATA_DIR;
  if (!isolated) throw new Error("expected isolated REXTORA_DATA_DIR");
  return path.resolve(isolated);
}
