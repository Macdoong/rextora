/**
 * P2-F2B1 diagnosis: root index.json.updatedAt write contract.
 * Temp stores for writer experiments. Production is raw-read only.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { projectIndexInPlace } from "../src/lib/rextora/strategySearch/indexReconciliationPlan";
import { projectSearchJobIndexEntry } from "../src/lib/rextora/strategySearch/indexProjection";
import {
  createSearchJob,
  deleteSearchJob,
  markSearchJobRunning,
  saveSearchJob,
} from "../src/lib/rextora/strategySearch/jobStore";
import type {
  StrategySearchConfig,
  StrategySearchJobIndex,
} from "../src/lib/rextora/strategySearch/types";

const APPROVED_13 = [
  "search_0c286c6a-5d8c-4e2b-bdff-046dd71281a4",
  "search_1683a734-341d-4da8-99c7-476ad80c078d",
  "search_32bc4514-085c-4351-95d0-aa553f3c2884",
  "search_5bedd873-2e89-4604-ab27-07a9dff27e74",
  "search_6b0b920d-e45b-4101-8f2d-2013380d86a5",
  "search_6b527e08-d01d-49b8-b398-1ad27482182f",
  "search_747c28e9-c250-47ca-acfb-06eba1ed9c69",
  "search_78e8dd3f-5fea-4955-8535-7578338a18e1",
  "search_bd7a9043-1ed1-42a7-8bdc-c70ff22d249d",
  "search_d15a7b41-867a-40da-a065-28256ffaf88e",
  "search_e47a902f-5ee3-484f-88ca-73313de44cc6",
  "search_e4fe7b86-5140-40a9-b098-f6fe1eaa3027",
  "search_edb3d3fc-5671-4b33-bc1a-b0cc036f98c8",
] as const;

const F2B_PROPOSED_INDEX_SHA256 =
  "9395b5faaff412abb59fba81deb419871574324d812d7cdc293272d9aced3437";
const PRODUCTION_ROOT_UPDATED_AT = "2026-08-27T15:12:30.273Z";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-f2b1-"));
  tempRoots.push(root);
  return root;
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

function readIndex(root: string): StrategySearchJobIndex {
  return JSON.parse(
    fs.readFileSync(path.join(root, "index.json"), "utf8"),
  ) as StrategySearchJobIndex;
}

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function sha256Text(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function productionRoot(): string {
  return path.join(process.cwd(), "data", "rextora", "strategy-search");
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("P2-F2B1 index root updatedAt contract", () => {
  it("1. root updatedAt schema contract captured", () => {
    const index = readIndex(productionRoot());
    expect(index.version).toBe(1);
    expect(typeof index.updatedAt).toBe("string");
    expect(index.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(Array.isArray(index.jobs)).toBe(true);
  });

  it("2. normal create behavior", async () => {
    const root = makeTempRoot();
    const first = createSearchJob(sampleConfig(), { rootDir: root });
    const afterCreate = readIndex(root);
    expect(afterCreate.updatedAt >= first.updatedAt).toBe(true);
    expect(Date.parse(afterCreate.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(first.updatedAt),
    );
    await sleepMs(5);
    const second = createSearchJob(sampleConfig(), { rootDir: root });
    const afterSecond = readIndex(root);
    expect(afterSecond.updatedAt > afterCreate.updatedAt).toBe(true);
    expect(afterSecond.updatedAt >= second.updatedAt).toBe(true);
  });

  it("3. normal update behavior", async () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const before = readIndex(root);
    await sleepMs(5);
    saveSearchJob({ ...job, config: { ...job.config, seed: 2 } }, { rootDir: root });
    const after = readIndex(root);
    expect(after.updatedAt > before.updatedAt).toBe(true);
    const row = after.jobs.find((item) => item.id === job.id);
    expect(row?.updatedAt).not.toBe(before.jobs[0]?.updatedAt);
    expect(after.updatedAt >= row!.updatedAt).toBe(true);
  });

  it("4. normal transition behavior", async () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const before = readIndex(root);
    await sleepMs(5);
    const running = markSearchJobRunning(job.id, { rootDir: root });
    const after = readIndex(root);
    expect(after.updatedAt > before.updatedAt).toBe(true);
    expect(running.updatedAt).not.toBe(job.updatedAt);
    expect(after.updatedAt >= running.updatedAt).toBe(true);
  });

  it("5. deletion behavior if applicable", async () => {
    const root = makeTempRoot();
    const keep = createSearchJob(sampleConfig(), { rootDir: root });
    const doomed = createSearchJob(sampleConfig(), { rootDir: root });
    const before = readIndex(root);
    await sleepMs(5);
    deleteSearchJob(doomed.id, { rootDir: root });
    const after = readIndex(root);
    expect(after.jobs.map((row) => row.id)).toEqual([keep.id]);
    expect(after.updatedAt > before.updatedAt).toBe(true);
    expect(after.jobs[0]?.updatedAt).toBe(keep.updatedAt);
    expect(after.updatedAt !== after.jobs[0]?.updatedAt).toBe(true);
  });

  it("6. root timestamp vs row timestamp distinction", async () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const afterCreate = readIndex(root);
    await sleepMs(5);
    deleteSearchJob(job.id, { rootDir: root });
    const afterDelete = readIndex(root);
    expect(afterDelete.jobs).toEqual([]);
    expect(afterDelete.updatedAt > afterCreate.updatedAt).toBe(true);
    expect(afterDelete.updatedAt).not.toBe(job.updatedAt);
  });

  it("7. projectIndexInPlace behavior", () => {
    const root = makeTempRoot();
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    const index = readIndex(root);
    const proposedJob = {
      ...job,
      status: "completed" as const,
      updatedAt: "2026-08-11T00:41:52.554Z",
      finishedAt: "2026-08-11T00:41:52.554Z",
    };
    const proposed = projectIndexInPlace(
      index,
      new Map([[job.id, proposedJob]]),
      [job.id],
    );
    expect(proposed.updatedAt).toBe(index.updatedAt);
    expect(proposed.jobs[0]).toEqual(projectSearchJobIndexEntry(proposedJob));
    expect(proposed.jobs[0]?.updatedAt).not.toBe(index.updatedAt);
  });

  it("8. E2C precedent captured", () => {
    const before = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          ".validation/research-p2-e2c-index-reconciliation-apply/2026-09-03T00-44-12-154Z/index.before.json",
        ),
        "utf8",
      ),
    ) as StrategySearchJobIndex;
    const after = readIndex(productionRoot());
    const e2bProposed = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          ".validation/research-p2-e2b-index-reconciliation-dry-run/2026-09-02T15-07-42-438Z/proposed-index.json",
        ),
        "utf8",
      ),
    ) as StrategySearchJobIndex;
    expect(before.updatedAt).toBe(PRODUCTION_ROOT_UPDATED_AT);
    expect(after.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(e2bProposed.updatedAt).toBe(PRODUCTION_ROOT_UPDATED_AT);
  });

  it("9. historical reconciliation preserve variant", () => {
    const proposed = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          ".validation/research-p2-f2b-historical-correction-dry-run/2026-09-03T02-20-00-000Z/proposed-index.json",
        ),
        "utf8",
      ),
    ) as StrategySearchJobIndex;
    expect(proposed.updatedAt).toBe(PRODUCTION_ROOT_UPDATED_AT);
    expect(sha256Text(`${JSON.stringify(proposed, null, 2)}\n`)).toBe(
      F2B_PROPOSED_INDEX_SHA256,
    );
  });

  it("10. canonical reconciliation variant", () => {
    const current = readIndex(productionRoot());
    const proposed = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          ".validation/research-p2-f2b-historical-correction-dry-run/2026-09-03T02-20-00-000Z/proposed-index.json",
        ),
        "utf8",
      ),
    ) as StrategySearchJobIndex;
    const inPlace = projectIndexInPlace(
      current,
      new Map(
        proposed.jobs.flatMap((row) => {
          const jobPath = path.join(productionRoot(), "jobs", `${row.id}.json`);
          if (!fs.existsSync(jobPath)) return [];
          const job = JSON.parse(fs.readFileSync(jobPath, "utf8"));
          if (!(APPROVED_13 as readonly string[]).includes(row.id)) {
            return [[row.id, job]];
          }
          return [
            [
              row.id,
              {
                ...job,
                status: row.status,
                updatedAt: row.updatedAt,
                finishedAt: row.finishedAt,
              },
            ],
          ];
        }),
      ),
      APPROVED_13,
    );
    expect(inPlace.updatedAt).toBe(current.updatedAt);
    const maxRow = proposed.jobs
      .slice()
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0]!;
    expect(maxRow.updatedAt).not.toBe(proposed.updatedAt);
    const applyTime = new Date().toISOString();
    expect(applyTime > proposed.updatedAt).toBe(true);
  });

  it("11. no production write", () => {
    const root = productionRoot();
    const beforeIndex = sha256File(path.join(root, "index.json"));
    const beforeJobs = APPROVED_13.map((id) =>
      sha256File(path.join(root, "jobs", `${id}.json`)),
    );
    const beforePlans = APPROVED_13.map((id) =>
      sha256File(path.join(root, "jobs", `${id}.plan.json`)),
    );
    readIndex(root);
    expect(sha256File(path.join(root, "index.json"))).toBe(beforeIndex);
    expect(
      APPROVED_13.map((id) => sha256File(path.join(root, "jobs", `${id}.json`))),
    ).toEqual(beforeJobs);
    expect(
      APPROVED_13.map((id) => sha256File(path.join(root, "jobs", `${id}.plan.json`))),
    ).toEqual(beforePlans);
  });

  it("12. current production index unchanged", () => {
    const indexPath = path.join(productionRoot(), "index.json");
    const before = sha256File(indexPath);
    const index = readIndex(productionRoot());
    expect(index.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    for (const id of APPROVED_13) {
      const row = index.jobs.find((item) => item.id === id);
      const jobPath = path.join(productionRoot(), "jobs", `${id}.json`);
      if (!fs.existsSync(jobPath)) {
        expect(row?.status).toBe("completed");
        continue;
      }
      const job = JSON.parse(fs.readFileSync(jobPath, "utf8")) as { status: string };
      expect(row?.status).toBe("completed");
      expect(job.status).toBe("completed");
    }
    expect(sha256File(indexPath)).toBe(before);
  });
});
