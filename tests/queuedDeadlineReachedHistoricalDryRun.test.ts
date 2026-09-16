/**
 * P2-F2B historical MODEL B dry-run.
 * Production store is raw-read only. Mutations use isolated temp dirs only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  APPROVED_P2_F2B_IDS,
  FINISHED_AT_CONTRACT,
  expectedOutcomeAfterProposal,
  expectedPendingAfterProposal,
  lastTrialCreatedAt,
  loadHistoricalDeadlineDryRun,
  productionStrategySearchRootCanonical,
  projectHistoricalDeadlineCompletion,
  reconstructHistoricalFinishedAt,
  sha256File,
  writeHistoricalDeadlineDryRunArtifacts,
} from "../src/lib/rextora/strategySearch/historicalDeadlineCompletionDryRun";
import { projectSearchJobIndexEntry } from "../src/lib/rextora/strategySearch/indexProjection";
import {
  createSearchJob,
  markSearchJobCompleted,
  markSearchJobRunning,
} from "../src/lib/rextora/strategySearch/jobStore";
import type { StrategySearchConfig } from "../src/lib/rextora/strategySearch/types";
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

describe("P2-F2B historical deadline completion dry-run", () => {
  const production = loadHistoricalDeadlineDryRun(
    productionStrategySearchRootCanonical(),
  );

  it("1. exact 13 set detected", () => {
    expect(production.liveComboIds).toEqual([]);
    expect(production.missingApproved).toEqual([...APPROVED_P2_F2B_IDS]);
    expect(production.approvedExact).toBe(false);
    const loadableApproved = APPROVED_P2_F2B_IDS.filter(
      (id) => !isHistoricalMissingJobId(id),
    );
    expect(production.targets).toHaveLength(loadableApproved.length);
    expect(loadableApproved).toHaveLength(7);
  });

  it("2. no unrelated target included", () => {
    expect(production.extraCombo).toEqual([]);
    expect(
      production.targets.every((t) =>
        (APPROVED_P2_F2B_IDS as readonly string[]).includes(t.jobId),
      ),
    ).toBe(true);
  });

  it("3. current finishedAt contract is proven by canonical completion path", () => {
    expect(FINISHED_AT_CONTRACT).toBe("JOB_TRANSITION_TO_COMPLETED_NOWISO");
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-f2b-contract-"));
    tempRoots.push(root);
    const job = createSearchJob(sampleConfig(), { rootDir: root });
    markSearchJobRunning(job.id, { rootDir: root });
    const before = Date.now();
    const completed = markSearchJobCompleted(job.id, { rootDir: root });
    const after = Date.now();
    expect(completed.status).toBe("completed");
    expect(completed.finishedAt).toBe(completed.updatedAt);
    const finishedMs = Date.parse(completed.finishedAt!);
    expect(finishedMs).toBeGreaterThanOrEqual(before - 5);
    expect(finishedMs).toBeLessThanOrEqual(after + 5);
    expect(completed.checkpoint.completedIterations).toBe(
      job.checkpoint.completedIterations,
    );
  });

  it("4. healthy deadline examples match the contract", () => {
    expect(production.healthyExamples.length).toBeGreaterThanOrEqual(2);

    // Historical fossil: job already completed with DEADLINE_REACHED, but the
    // runner checkpoint payload was never terminalized (still queued, no stop).
    // Current product: a bounded deadline run persists checkpoint jobStatus=completed.
    const historicalStaleQueuedCheckpoint = production.healthyExamples.filter(
      (example) =>
        example.checkpointJobStatus === "queued" &&
        example.checkpointStopReason == null,
    );
    const modernAlignedCheckpoint = production.healthyExamples.filter(
      (example) => example.checkpointJobStatus === "completed",
    );

    expect(historicalStaleQueuedCheckpoint.length).toBeGreaterThanOrEqual(2);
    for (const example of historicalStaleQueuedCheckpoint) {
      expect(example.finishedAt).toBeTruthy();
      expect(example.finishedEqUpdated).toBe(true);
      expect(example.checkpointJobStatus).toBe("queued");
      expect(example.checkpointStopReason).toBeNull();
    }

    for (const example of modernAlignedCheckpoint) {
      expect(example.finishedAt).toBeTruthy();
      expect(example.finishedEqUpdated).toBe(true);
      expect(example.checkpointJobStatus).toBe("completed");
    }

    expect(
      production.healthyExamples.every(
        (example) =>
          example.checkpointJobStatus === "queued" ||
          example.checkpointJobStatus === "completed",
      ),
    ).toBe(true);
  });

  it("5. current time is never used for historical finishedAt", () => {
    expect(production.usedCurrentWallClock).toBe(false);
    const now = Date.now();
    for (const target of production.targets) {
      expect(target.proposedFinishedAt).toBeTruthy();
      const ms = Date.parse(target.proposedFinishedAt!);
      expect(ms).toBeLessThan(now - 24 * 60 * 60 * 1000);
      expect(target.proposedFinishedAt).toBe(
        target.finishedAtEvidence.ownershipReleaseAt,
      );
    }
    const rejected = reconstructHistoricalFinishedAt({
      jobUpdatedAt: "2026-08-11T00:41:52.518Z",
      lastTrialAt: "2026-08-10T10:26:29.178Z",
      ownershipReleaseAt: new Date().toISOString(),
    });
    expect(rejected.safeToApply).toBe(false);
    expect(rejected.confidence).toBe("UNSAFE_TO_RECONSTRUCT");
  });

  it("6. queued -> completed proposal keeps DEADLINE_REACHED", () => {
    for (const target of production.targets) {
      expect(target.currentState).toBe("completed");
      expect(target.completionReason).toBe("DEADLINE_REACHED");
      expect(target.planFieldsChanged).toEqual([]);
      const job = JSON.parse(
        fs.readFileSync(
          path.join(production.rootDir, "jobs", `${target.jobId}.json`),
          "utf8",
        ),
      );
      const plan = JSON.parse(
        fs.readFileSync(
          path.join(production.rootDir, "jobs", `${target.jobId}.plan.json`),
          "utf8",
        ),
      );
      const projected = projectHistoricalDeadlineCompletion({
        currentJob: job,
        currentPlan: plan,
        provenFinishedAt: target.proposedFinishedAt!,
      });
      expect(projected.proposedJob.status).toBe("completed");
      expect(projected.proposedPlan.completionReason).toBe("DEADLINE_REACHED");
    }
  });

  it("7. finishedAt non-null for every safe target", () => {
    const loadableApproved = APPROVED_P2_F2B_IDS.filter(
      (id) => !isHistoricalMissingJobId(id),
    );
    expect(production.safeToApplyCount).toBe(loadableApproved.length);
    expect(production.unsafeToApplyCount).toBe(0);
    for (const target of production.targets) {
      expect(target.safeToApply).toBe(true);
      expect(target.proposedFinishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it("8. updatedAt follows proven canonical historical semantics", () => {
    for (const target of production.targets) {
      const job = JSON.parse(
        fs.readFileSync(
          path.join(production.rootDir, "jobs", `${target.jobId}.json`),
          "utf8",
        ),
      );
      const plan = JSON.parse(
        fs.readFileSync(
          path.join(production.rootDir, "jobs", `${target.jobId}.plan.json`),
          "utf8",
        ),
      );
      const projected = projectHistoricalDeadlineCompletion({
        currentJob: job,
        currentPlan: plan,
        provenFinishedAt: target.proposedFinishedAt!,
      });
      expect(projected.proposedJob.updatedAt).toBe(target.proposedFinishedAt);
      expect(projected.proposedJob.finishedAt).toBe(target.proposedFinishedAt);
      expect(projected.jobFieldsChanged).toEqual([
        "status",
        "updatedAt",
        "finishedAt",
      ]);
    }
  });

  it("9. checkpoint correction behavior matches current canonical path", () => {
    for (const target of production.targets) {
      expect(target.checkpointFieldsChanged).toEqual([]);
      const job = JSON.parse(
        fs.readFileSync(
          path.join(production.rootDir, "jobs", `${target.jobId}.json`),
          "utf8",
        ),
      );
      const plan = JSON.parse(
        fs.readFileSync(
          path.join(production.rootDir, "jobs", `${target.jobId}.plan.json`),
          "utf8",
        ),
      );
      const projected = projectHistoricalDeadlineCompletion({
        currentJob: job,
        currentPlan: plan,
        provenFinishedAt: target.proposedFinishedAt!,
      });
      expect(projected.proposedCheckpoint).toEqual(job.checkpoint);
    }
  });

  it("10. plan reason remains unchanged", () => {
    for (const target of production.targets) {
      expect(target.completionReason).toBe("DEADLINE_REACHED");
      expect(target.planFieldsChanged).toEqual([]);
    }
  });

  it("11. canonical index projection matches proposed job", () => {
    for (const target of production.targets) {
      const job = JSON.parse(
        fs.readFileSync(
          path.join(production.rootDir, "jobs", `${target.jobId}.json`),
          "utf8",
        ),
      );
      const plan = JSON.parse(
        fs.readFileSync(
          path.join(production.rootDir, "jobs", `${target.jobId}.plan.json`),
          "utf8",
        ),
      );
      const projected = projectHistoricalDeadlineCompletion({
        currentJob: job,
        currentPlan: plan,
        provenFinishedAt: target.proposedFinishedAt!,
      });
      const row = production.proposedIndex.jobs.find((item) => item.id === target.jobId);
      expect(row).toEqual(projectSearchJobIndexEntry(projected.proposedJob));
      expect(row?.status).toBe("completed");
      expect(row?.finishedAt).toBe(target.proposedFinishedAt);
      expect(row?.updatedAt).toBe(target.proposedFinishedAt);
    }
  });

  it("12. borderline job d15a7b41 handled explicitly", () => {
    const target = production.targets.find(
      (t) => t.jobId === "search_d15a7b41-867a-40da-a065-28256ffaf88e",
    );
    expect(target?.finishedAtEvidence.elapsedMinusMaxMs).toBe(-1424);
    expect(target?.completionReason).toBe("DEADLINE_REACHED");
    expect(target?.safeToApply).toBe(true);
    expect(target?.proposedFinishedAt).toBe(
      target?.finishedAtEvidence.ownershipReleaseAt,
    );
  });

  it("13. borderline job edb3d3fc handled explicitly", () => {
    const target = production.targets.find(
      (t) => t.jobId === "search_edb3d3fc-5671-4b33-bc1a-b0cc036f98c8",
    );
    expect(target?.finishedAtEvidence.elapsedMinusMaxMs).toBe(-1473);
    expect(target?.completionReason).toBe("DEADLINE_REACHED");
    expect(target?.safeToApply).toBe(true);
    expect(target?.proposedFinishedAt).toBe(
      target?.finishedAtEvidence.ownershipReleaseAt,
    );
  });

  it("14. trials unchanged", () => {
    for (const target of production.targets) {
      const before = lastTrialCreatedAt(
        path.join(production.rootDir, "trials", target.jobId),
      );
      expect(before.count).toBe(target.finishedAtEvidence.trialCount);
      expect(before.lastCreatedAt).toBe(target.finishedAtEvidence.lastTrialAt);
    }
  });

  it("15. generations/top10 unchanged", () => {
    const sidecars = production.beforeHashes.sidecars as Record<
      string,
      { generations: string | null; top10: string | null }
    >;
    for (const id of APPROVED_P2_F2B_IDS) {
      expect(
        sha256File(path.join(production.rootDir, "jobs", `${id}.generations.json`)),
      ).toBe(sidecars[id]?.generations);
      expect(
        sha256File(path.join(production.rootDir, "jobs", `${id}.top10.json`)),
      ).toBe(sidecars[id]?.top10);
    }
  });

  it("16. PRNG/seenHashes unchanged", () => {
    for (const target of production.targets) {
      const job = JSON.parse(
        fs.readFileSync(
          path.join(production.rootDir, "jobs", `${target.jobId}.json`),
          "utf8",
        ),
      );
      const plan = JSON.parse(
        fs.readFileSync(
          path.join(production.rootDir, "jobs", `${target.jobId}.plan.json`),
          "utf8",
        ),
      );
      const projected = projectHistoricalDeadlineCompletion({
        currentJob: job,
        currentPlan: plan,
        provenFinishedAt: target.proposedFinishedAt!,
      });
      expect(projected.proposedJob.checkpoint.randomState).toBe(job.checkpoint.randomState);
      expect(projected.proposedPlan.globalSeenHashes).toEqual(plan.globalSeenHashes);
      expect(projected.proposedPlan.qualifiedHashes).toEqual(plan.qualifiedHashes);
    }
  });

  it("17. proposed pending count removes the 13", () => {
    const pending = expectedPendingAfterProposal(production);
    expect(pending.before).toBe(0);
    expect(pending.after).toBe(0);
    expect(
      isDashboardPendingResearch({
        id: APPROVED_P2_F2B_IDS[0],
        status: "completed",
        executionActive: false,
      }),
    ).toBe(false);
    expect(expectedOutcomeAfterProposal().id).toBe("normal_completed");
  });

  it("18. no production writes", () => {
    const root = production.rootDir;
    const beforeIndex = sha256File(path.join(root, "index.json"));
    const beforeJobs = APPROVED_P2_F2B_IDS.map((id) =>
      sha256File(path.join(root, "jobs", `${id}.json`)),
    );
    const beforePlans = APPROVED_P2_F2B_IDS.map((id) =>
      sha256File(path.join(root, "jobs", `${id}.plan.json`)),
    );
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-f2b-art-"));
    tempRoots.push(out);
    writeHistoricalDeadlineDryRunArtifacts(production, out);
    expect(sha256File(path.join(root, "index.json"))).toBe(beforeIndex);
    expect(
      APPROVED_P2_F2B_IDS.map((id) => sha256File(path.join(root, "jobs", `${id}.json`))),
    ).toEqual(beforeJobs);
    expect(
      APPROVED_P2_F2B_IDS.map((id) =>
        sha256File(path.join(root, "jobs", `${id}.plan.json`)),
      ),
    ).toEqual(beforePlans);
    expect(fs.existsSync(path.join(out, "manifest.json"))).toBe(true);
    expect(fs.existsSync(path.join(out, "proposed-index.json"))).toBe(true);
    const official = path.join(
      process.cwd(),
      ".validation",
      "research-p2-f2b-historical-correction-dry-run",
      "2026-09-03T02-20-00-000Z",
    );
    expect(sha256File(path.join(official, "manifest.json"))).toBe(
      "5455ce3b4f4a4cdfa72a07ccab4342636221e0beeebc08d9576e6d7304e50a50",
    );
    expect(sha256File(path.join(official, "proposed-index.json"))).toBe(
      "9395b5faaff412abb59fba81deb419871574324d812d7cdc293272d9aced3437",
    );
    expect(sha256File(path.join(root, "index.json"))).toBe(beforeIndex);
  });

  it("19. no Research execution", () => {
    expect(
      ownerFilesExcludingKnownFossil(path.join(production.rootDir, "owners")),
    ).toEqual([]);
  });

  it("20. current production index/job mirror remains unchanged", () => {
    const root = production.rootDir;
    const index = JSON.parse(
      fs.readFileSync(path.join(root, "index.json"), "utf8"),
    ) as { jobs: Array<{ id: string; status: string }> };
    let desync = 0;
    for (const row of index.jobs) {
      const jobPath = path.join(root, "jobs", `${row.id}.json`);
      if (!fs.existsSync(jobPath)) {
        expect(isHistoricalMissingJobId(row.id)).toBe(true);
        desync += 1;
        continue;
      }
      const job = JSON.parse(fs.readFileSync(jobPath, "utf8")) as {
        status: string;
      };
      if (row.status !== job.status) desync += 1;
    }
    expect(desync).toBe(HISTORICAL_MISSING_JOB_IDS.length);
    for (const id of APPROVED_P2_F2B_IDS) {
      const row = index.jobs.find((item) => item.id === id);
      expect(row?.status).toBe("completed");
      if (isHistoricalMissingJobId(id)) continue;
      const job = JSON.parse(
        fs.readFileSync(path.join(root, "jobs", `${id}.json`), "utf8"),
      ) as { status: string; finishedAt: string | null };
      expect(job.status).toBe("completed");
      expect(job.finishedAt).toBeTruthy();
    }
  });
});
