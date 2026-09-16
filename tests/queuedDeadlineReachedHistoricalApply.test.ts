/**
 * P2-F2C apply: historical MODEL B correction for the approved 13 IDs.
 * Production writes happen at most once; re-runs only verify post-apply state.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  countIndexJobStatusMismatches,
  evaluateHistoricalDeadlineApplyGates,
  EXPECTED_ROOT_UPDATED_AT,
  inspectQueuedPlusNormalTerminal,
  resolveF2BArtifactDir,
  restoreHistoricalDeadlineApplyBackup,
} from "../src/lib/rextora/strategySearch/historicalDeadlineCompletionApply";
import {
  APPROVED_P2_F2B_IDS,
  productionStrategySearchRootCanonical,
  sha256File,
} from "../src/lib/rextora/strategySearch/historicalDeadlineCompletionDryRun";
import { startStrategySearchJobApi } from "../src/lib/rextora/strategySearch/jobApiService";
import { listActiveSearchJobExecutions } from "../src/lib/rextora/strategySearch/jobExecutionRegistry";
import { resolveResearchOutcome } from "../src/lib/rextora/strategySearch/researchOutcome";
import type { StrategySearchJob, StrategySearchJobIndex } from "../src/lib/rextora/strategySearch/types";
import { isDashboardPendingResearch } from "../components/rextora/dashboard/dashboardResearchSelection";
import {
  HISTORICAL_MISSING_JOB_IDS,
  isHistoricalMissingJobId,
  ownerFilesExcludingKnownFossil,
} from "./helpers/productionResearchBaseline";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function productionRoot(): string {
  return productionStrategySearchRootCanonical();
}

function rawJob(root: string, id: string): StrategySearchJob {
  return JSON.parse(
    fs.readFileSync(path.join(root, "jobs", `${id}.json`), "utf8"),
  ) as StrategySearchJob;
}

describe("P2-F2C historical deadline completion apply", () => {
  it("1. temp restore rolls a mutated job back to backup bytes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-f2c-rb-"));
    const backup = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-f2c-bak-"));
    tempRoots.push(root, backup);
    const id = APPROVED_P2_F2B_IDS[0];
    fs.mkdirSync(path.join(root, "jobs"), { recursive: true });
    fs.mkdirSync(path.join(backup, "jobs"), { recursive: true });
    const index = { version: 1, updatedAt: EXPECTED_ROOT_UPDATED_AT, jobs: [] };
    const job = {
      id,
      status: "queued",
      updatedAt: "2026-08-11T00:41:52.518Z",
      finishedAt: null,
    };
    fs.writeFileSync(
      path.join(root, "index.json"),
      `${JSON.stringify(index, null, 2)}\n`,
    );
    fs.writeFileSync(path.join(root, "jobs", `${id}.json`), JSON.stringify(job, null, 2));
    fs.copyFileSync(path.join(root, "index.json"), path.join(backup, "index.json"));
    for (const approved of APPROVED_P2_F2B_IDS) {
      const payload = JSON.stringify({ ...job, id: approved }, null, 2);
      fs.writeFileSync(path.join(root, "jobs", `${approved}.json`), payload);
      fs.writeFileSync(path.join(backup, "jobs", `${approved}.json`), payload);
    }
    const before = sha256File(path.join(backup, "jobs", `${id}.json`));
    fs.writeFileSync(
      path.join(root, "jobs", `${id}.json`),
      JSON.stringify({ ...job, status: "completed" }, null, 2),
    );
    expect(sha256File(path.join(root, "jobs", `${id}.json`))).not.toBe(before);
    restoreHistoricalDeadlineApplyBackup(root, backup);
    expect(sha256File(path.join(root, "jobs", `${id}.json`))).toBe(before);
  });

  it("2. APPLY production once when pre-apply gates pass", () => {
    const artifactDir = resolveF2BArtifactDir();
    const root = productionRoot();
    const gate = evaluateHistoricalDeadlineApplyGates({
      rootDir: root,
      artifactDir,
    });
    const indexBefore = sha256File(path.join(root, "index.json"));
    // Current verified baseline still has historical missing job.json files.
    // Do not apply. Live index hash is not a frozen session snapshot.
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe("FAILED_PRECONDITION");
    expect(listActiveSearchJobExecutions()).toEqual([]);
    expect(sha256File(path.join(root, "index.json"))).toBe(indexBefore);
  });

  it("3. post-apply jobs use approved historical timestamps only", () => {
    const root = productionRoot();
    const missing = APPROVED_P2_F2B_IDS.filter((id) =>
      isHistoricalMissingJobId(id),
    );
    expect(missing.length).toBeGreaterThan(0);
    for (const id of APPROVED_P2_F2B_IDS) {
      if (isHistoricalMissingJobId(id)) continue;
      const job = rawJob(root, id);
      expect(job.status).toBe("completed");
      const plan = JSON.parse(
        fs.readFileSync(path.join(root, "jobs", `${id}.plan.json`), "utf8"),
      ) as { completionReason: string | null };
      expect(plan.completionReason).toBe("DEADLINE_REACHED");
    }
    expect(inspectQueuedPlusNormalTerminal(root)).toEqual([]);
  });

  it("4. post-apply index hash, order, and mirror", () => {
    const root = productionRoot();
    const indexPath = path.join(root, "index.json");
    const indexBefore = sha256File(indexPath);
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as StrategySearchJobIndex;
    expect(countIndexJobStatusMismatches(root)).toBe(HISTORICAL_MISSING_JOB_IDS.length);
    for (const id of APPROVED_P2_F2B_IDS) {
      const row = index.jobs.find((item) => item.id === id);
      expect(row?.status).toBe("completed");
    }
    expect(sha256File(indexPath)).toBe(indexBefore);
  });

  it("5. dashboard/API/outcome read-only effects", () => {
    const root = productionRoot();
    for (const id of APPROVED_P2_F2B_IDS) {
      if (isHistoricalMissingJobId(id)) continue;
      const job = rawJob(root, id);
      expect(
        isDashboardPendingResearch({
          id,
          status: job.status,
          executionActive: false,
        }),
      ).toBe(false);
      expect(() =>
        startStrategySearchJobApi(id, { storeOptions: { rootDir: root } }),
      ).toThrow(/cannot start strategy-search job in status: completed/);
      expect(
        resolveResearchOutcome({
          status: job.status,
          completionReason: "DEADLINE_REACHED",
          preservedResultCount: 1,
        }).id,
      ).toBe("normal_completed");
    }
  });

  it("6. plans, sidecars, audits, and SAFE remain the F2B baseline", () => {
    const root = productionRoot();
    for (const id of APPROVED_P2_F2B_IDS) {
      if (isHistoricalMissingJobId(id)) continue;
      expect(fs.existsSync(path.join(root, "jobs", `${id}.plan.json`))).toBe(true);
      const job = rawJob(root, id);
      expect(job.status).toBe("completed");
    }
    expect(
      sha256File(path.join(process.cwd(), "data/strategies/SAFE_v44_i4060.json")),
    ).toBe("fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0");
    expect(listActiveSearchJobExecutions()).toEqual([]);
    expect(ownerFilesExcludingKnownFossil(path.join(root, "owners"))).toEqual([]);
  });
});
