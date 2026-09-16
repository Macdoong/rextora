/**
 * P2-G6 stale queued job forensic diagnosis.
 * Production is raw-read only. No start/resume/orphan recovery.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listActiveSearchJobExecutions } from "../src/lib/rextora/strategySearch/jobExecutionRegistry";
import {
  CANONICAL_EXPECTED_STATE,
  CORRECTION_REQUIRED,
  DUPLICATE_WORK_RISK,
  HEALTHY_QUEUED_IDS,
  HISTORICAL_ROLLBACK_EVIDENCE,
  LEGAL_QUEUED_STARTED_AT_PATHS,
  MANUAL_START_CLASSIFICATION,
  QUEUED_BETWEEN_SEARCH_SPACES,
  STALE_QUEUED_TARGET_ID,
  collectStaleQueuedReadonlyHashes,
  loadStaleQueuedForensicDiagnosis,
  productionStaleQueuedRoot,
  proposedCorrection,
  writeStaleQueuedForensicArtifacts,
} from "../src/lib/rextora/strategySearch/staleQueuedJobForensic";
import { ownerFilesExcludingKnownFossil } from "./helpers/productionResearchBaseline";

const ARTIFACT_DIR = path.join(
  process.cwd(),
  ".validation/research-p2-g6-stale-queued-forensic/2026-09-03T05-50-00-000Z",
);

const SAFE = path.join(process.cwd(), "data/strategies/SAFE_v44_i4060.json");

describe("P2-G6 stale queued job forensic", () => {
  it("1. exact target loaded", () => {
    const d = loadStaleQueuedForensicDiagnosis();
    expect(d.targetId).toBe(STALE_QUEUED_TARGET_ID);
    expect(d.job.id).toBe(STALE_QUEUED_TARGET_ID);
    expect(d.paths.job).toContain(`${STALE_QUEUED_TARGET_ID}.json`);
  });

  it("2. target remains queued during diagnosis", () => {
    const before = collectStaleQueuedReadonlyHashes();
    const d = loadStaleQueuedForensicDiagnosis();
    expect(d.job.status).toBe("queued");
    expect(d.indexRow?.status).toBe("queued");
    expect(collectStaleQueuedReadonlyHashes()).toEqual(before);
  });

  it("3. healthy queued comparison captured", () => {
    const d = loadStaleQueuedForensicDiagnosis();
    expect(d.healthy.map((h) => h.id)).toEqual([...HEALTHY_QUEUED_IDS]);
    expect(d.healthy.every((h) => h.status === "queued")).toBe(true);
    expect(d.healthy.every((h) => h.startedAt == null)).toBe(true);
    expect(d.healthy.every((h) => h.completedIterations === 0)).toBe(true);
    expect(d.healthy.every((h) => h.trialCount === 0)).toBe(true);
    expect(d.job.startedAt).not.toBeNull();
    expect(d.job.completedIterations).toBe(4560);
  });

  it("4. legal queued+startedAt transitions identified", () => {
    expect(LEGAL_QUEUED_STARTED_AT_PATHS.some((p) => p.matchesTarget)).toBe(
      true,
    );
    expect(
      LEGAL_QUEUED_STARTED_AT_PATHS.find((p) => p.matchesTarget)?.id,
    ).toBe("REOPEN_NEXT_SPACE_OR_BATCH");
    const store = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/jobStore.ts"),
      "utf8",
    );
    expect(store).toContain("export function reopenSearchJobForNextSpace");
    expect(store).toContain('["completed", "queued"]');
  });

  it("5. target search-space reopen classification", () => {
    const d = loadStaleQueuedForensicDiagnosis();
    expect(d.queuedBetweenSearchSpaces).toBe(QUEUED_BETWEEN_SEARCH_SPACES);
    expect(QUEUED_BETWEEN_SEARCH_SPACES).toBe("REJECTED");
    expect(d.plan.spaces[0]?.status).toBe("completed");
    expect(d.plan.spaces[1]?.status).toBe("active");
    expect(d.plan.spaces[1]?.uniqueEvaluated).toBe(300);
    expect(d.generations.bySpace.fvg).toBe(112);
  });

  it("6. target process-loss classification", () => {
    const d = loadStaleQueuedForensicDiagnosis();
    expect(d.targetMatchesProcessLossContract).toBe("YES");
    expect(d.plan.interruptedAtMs).toBeNull();
    expect(d.recoveryEvents).toEqual([]);
    expect(d.ownershipEvents.at(-1)?.event).toBe("recovered_stale");
    const interrupt = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/processInterruption.ts",
      ),
      "utf8",
    );
    expect(interrupt).toContain('job.status !== "running"');
  });

  it("7. rollback/recovery evidence classification", () => {
    expect(HISTORICAL_ROLLBACK_EVIDENCE).toBe("NONE");
    const d = loadStaleQueuedForensicDiagnosis();
    expect(d.historicalRollbackEvidence).toBe("NONE");
    expect(d.paths.bakTmp).toEqual([]);
  });

  it("8. checkpoint continuity classification", () => {
    const d = loadStaleQueuedForensicDiagnosis();
    expect(d.checkpoint.completedIterations).toBe(4560);
    expect(d.checkpoint.nextIteration).toBe(4560);
    expect(d.trials.count).toBe(4560);
    expect(d.trials.lastIteration).toBe(4559);
    expect(d.checkpoint.randomStatePresent).toBe(true);
    expect(d.checkpoint.payloadJobStatus).toBe("completed");
    expect(d.checkpoint.payloadStopReason).toBe("max_iterations");
    expect(d.job.maxIterations).toBe(4600);
  });

  it("9. manual start dry behavior", () => {
    const d = loadStaleQueuedForensicDiagnosis();
    expect(d.manualStartClassification).toBe(MANUAL_START_CLASSIFICATION);
    expect(d.runtimeExceededIfStartedNow).toBe(true);
    expect(d.plan.completionReason).toBeNull();
    const api = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/jobApiService.ts"),
      "utf8",
    );
    expect(api).toContain("if (job.status === \"queued\")");
    expect(api).toContain("startSearchJobExecution");
    const orch = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/searchOrchestrator.ts",
      ),
      "utf8",
    );
    expect(orch).toContain("if (runtimeExceeded(plan))");
    expect(orch).toContain("DEADLINE_REACHED");
  });

  it("10. duplicate-work risk classification", () => {
    expect(DUPLICATE_WORK_RISK).toBe("LOW");
    const d = loadStaleQueuedForensicDiagnosis();
    expect(d.duplicateWorkRisk).toBe("LOW");
    expect(d.checkpoint.nextIteration).toBe(d.trials.lastIteration! + 1);
  });

  it("11. canonical expected-state decision", () => {
    const d = loadStaleQueuedForensicDiagnosis();
    expect(d.canonicalExpectedState).toBe(CANONICAL_EXPECTED_STATE);
    expect(CANONICAL_EXPECTED_STATE).toBe("MODEL_A_VALID_QUEUED_CONTINUATION");
    expect(d.targetIsNormalPendingQueue).toBe(false);
  });

  it("12. proposed correction changes only allowlisted fields if applicable", () => {
    const proposed = proposedCorrection();
    expect(proposed.required).toBe(false);
    expect(proposed.changedArtifacts).toEqual([]);
    expect(proposed.changedFields).toEqual([]);
    expect(CORRECTION_REQUIRED).toBe(false);
  });

  it("13. index projection remains read-only", () => {
    const before = collectStaleQueuedReadonlyHashes();
    const proposed = proposedCorrection();
    expect(proposed.indexRowChanges).toBe(0);
    expect(proposed.rootIndexUpdatedAt).toBe("UNCHANGED");
    expect(proposed.proposedIndexSha256).toBe(before.index);
    expect(collectStaleQueuedReadonlyHashes().index).toBe(before.index);
  });

  it("14. no production job mutation", () => {
    const before = collectStaleQueuedReadonlyHashes();
    writeStaleQueuedForensicArtifacts(ARTIFACT_DIR);
    const after = collectStaleQueuedReadonlyHashes();
    expect(after).toEqual(before);
    expect(after.targetJob).toBe(before.targetJob);
    expect(after.targetPlan).toBe(before.targetPlan);
    expect(after.lastTrial).toBe(before.lastTrial);
    for (const name of [
      "target-snapshot.json",
      "healthy-queued-comparison.json",
      "target-timeline.json",
      "source-transition-matrix.json",
      "manual-start-dry-analysis.json",
      "canonical-state-decision.json",
      "proposed-correction.json",
      "production-readonly-hashes.json",
    ]) {
      expect(fs.existsSync(path.join(ARTIFACT_DIR, name))).toBe(true);
    }
  });

  it("15. no Research execution", () => {
    expect(listActiveSearchJobExecutions()).toEqual([]);
    expect(
      ownerFilesExcludingKnownFossil(
        path.join(productionStaleQueuedRoot(), "owners"),
      ),
    ).toEqual([]);
    const forensic = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/lib/rextora/strategySearch/staleQueuedJobForensic.ts",
      ),
      "utf8",
    );
    expect(forensic).not.toContain("recoverOrphanSearchJobs(");
    expect(forensic).not.toContain("startStrategySearchJobApi(");
    expect(forensic).not.toContain("startSearchJobExecution(");
  });

  it("16. SAFE unchanged", () => {
    const raw = fs.readFileSync(SAFE, "utf8");
    expect(raw).toContain("7893ca3f0e30");
    expect(raw).toContain("SAFE_v44_i4060");
    const hashes = collectStaleQueuedReadonlyHashes();
    expect(hashes.safe).toBe(
      "fb3f19169c8911fe041f3f8cb1d9e654f9166078f0c5cd8e29f04ec02a56dfc0",
    );
  });
});
