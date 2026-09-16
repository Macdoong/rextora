import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  inspectOrphanSearchJobs,
} from "../src/lib/rextora/strategySearch/orphanJobRecovery";
import {
  createSearchJob,
  markSearchJobInterrupted,
  type StrategySearchStoreOptions,
} from "../src/lib/rextora/strategySearch/jobStore";
import type { StrategySearchConfig } from "../src/lib/rextora/strategySearch/types";

const tempRoots: string[] = [];

function tempStore(): StrategySearchStoreOptions {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-recover-get-"));
  tempRoots.push(root);
  return { rootDir: root };
}

afterEach(() => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

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

function walkFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(root)) {
    const fp = path.join(root, name);
    if (fs.statSync(fp).isDirectory()) out.push(...walkFiles(fp));
    else out.push(fp);
  }
  return out.sort();
}

function hashTree(root: string): string {
  return walkFiles(root)
    .map((fp) => `${fp}:${fs.readFileSync(fp).toString("hex")}`)
    .join("\n");
}

describe("GET recover is inspect-only", () => {
  it("inspectOrphanSearchJobs does not write isolated store files", () => {
    const store = tempStore();
    const job = createSearchJob(sampleConfig(), store);
    markSearchJobInterrupted(job.id, store);
    const before = hashTree(store.rootDir!);
    const result = inspectOrphanSearchJobs(store);
    expect(result.mutation).toBe(false);
    expect(result.resumed).toEqual([]);
    expect(result.recordRecovered).toEqual([]);
    expect(result.candidates).toContain(job.id);
    expect(hashTree(store.rootDir!)).toBe(before);
  });

  it("route GET uses inspect, POST uses recover", () => {
    const route = fs.readFileSync(
      path.join(
        process.cwd(),
        "app/api/rextora/strategy-search/recover/route.ts",
      ),
      "utf8",
    );
    expect(route).toContain("inspectOrphanSearchJobs");
    expect(route).toContain("recoverOrphanSearchJobs");
    expect(route).not.toContain("return POST()");
    expect(route).toMatch(/export async function GET[\s\S]*inspectOrphanSearchJobs/);
    expect(route).toMatch(/export async function POST[\s\S]*recoverOrphanSearchJobs/);
  });
});
