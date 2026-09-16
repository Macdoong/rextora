/**
 * P2-G6 read-only forensic diagnosis of one stale queued Research job.
 * Never writes jobs, plans, index, audits, ownership, or SAFE.
 * Artifact writes are allowed only to a caller-provided directory.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { productionStrategySearchRootCanonical } from "./historicalDeadlineCompletionDryRun";
import { compareJobsNewestFirst } from "./historyRetention";
import { projectSearchJobIndexEntry } from "./indexProjection";
import { collectProductionReadonlyHashes } from "./interruptedRecoveryUiDiagnosis";
import { readRunnerPayloadFromCheckpoint } from "./jobCheckpoint";
import { classifyQueuedJob } from "./residualLifecycleInventory";
import { activeElapsedMs } from "./searchPlan";
import type { StrategySearchPlan } from "./searchPlan";
import type { StrategySearchJob, StrategySearchJobIndex } from "./types";

export const STALE_QUEUED_TARGET_ID =
  "search_abf10625-74ff-458f-8759-d9dddfb04944" as const;

export const HEALTHY_QUEUED_IDS = [
  "search_169c82b6-b973-4a72-8958-d1478789d4ba",
  "search_7b693837-3f4b-4a14-8c3a-810ad40bb37b",
  "search_07f1b733-6602-40e9-9c1c-1a260db27498",
] as const;

export const CANONICAL_EXPECTED_STATE =
  "MODEL_A_VALID_QUEUED_CONTINUATION" as const;
export const MANUAL_START_CLASSIFICATION = "UNSAFE" as const;
export const QUEUED_BETWEEN_SEARCH_SPACES = "REJECTED" as const;
export const PROCESS_LOSS_EXPECTED_STATE =
  "queued — stale-owner sweep does not interrupt non-running jobs" as const;
export const TARGET_MATCHES_PROCESS_LOSS_CONTRACT = "YES" as const;
export const HISTORICAL_ROLLBACK_EVIDENCE = "NONE" as const;
export const FILE_WRITE_PATTERN = "A_COHERENT_FINAL_WRITE" as const;
export const OPERATOR_PRESENTATION = "MISLEADING" as const;
export const DUPLICATE_WORK_RISK = "LOW" as const;
export const CORRECTION_REQUIRED = false;

export const LEGAL_QUEUED_STARTED_AT_PATHS = [
  {
    id: "CREATE",
    functionName: "createSearchJob",
    sourceFile: "src/lib/rextora/strategySearch/jobStore.ts",
    producesStartedAt: false,
    completedIterationsMayBePositive: false,
    matchesTarget: false,
  },
  {
    id: "RESUME_TO_QUEUED",
    functionName: "resumeSearchJob / transitionJobToQueued",
    sourceFile: "src/lib/rextora/strategySearch/jobStore.ts",
    preState: "paused | interrupted | failed",
    producesStartedAt: "preserves existing startedAt",
    completedIterationsMayBePositive: true,
    ownerExpected: false,
    planPauseOrInterruptExpected: true,
    checkpointExpected: true,
    matchesTarget: false,
  },
  {
    id: "REOPEN_NEXT_SPACE_OR_BATCH",
    functionName: "reopenSearchJobForNextSpace",
    sourceFile: "src/lib/rextora/strategySearch/jobStore.ts",
    preState: "completed",
    reason: "orchestrator stage/family continue after max_iterations or space handoff",
    producesStartedAt: "preserves existing startedAt",
    completedIterationsMayBePositive: true,
    ownerExpected: "in-process owner may exist until runner exits",
    planPauseOrInterruptExpected: false,
    checkpointExpected: true,
    matchesTarget: true,
  },
  {
    id: "PREPARE_INTERRUPTED_RECOVERY",
    functionName: "prepareInterruptedJobForRecovery",
    sourceFile: "src/lib/rextora/strategySearch/processInterruption.ts",
    preState: "interrupted",
    producesStartedAt: "preserves existing startedAt",
    completedIterationsMayBePositive: true,
    planPauseOrInterruptExpected: "requires interruptedAtMs then markPlanInterruptionResumed",
    matchesTarget: false,
  },
  {
    id: "MISSING_JOB_RECOVERY_QUEUED",
    functionName: "jobRecordRecovery queued branch",
    sourceFile: "src/lib/rextora/strategySearch/jobRecordRecovery.ts",
    preState: "missing job + idle plan + index queued",
    producesStartedAt: false,
    matchesTarget: false,
  },
] as const;

const TARGET = STALE_QUEUED_TARGET_ID;

function rawReadJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function tryRawReadJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return rawReadJson<T>(filePath);
  } catch {
    return null;
  }
}

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function statMeta(filePath: string): {
  path: string;
  size: number;
  mtimeIso: string;
} | null {
  if (!fs.existsSync(filePath)) return null;
  const st = fs.statSync(filePath);
  return { path: filePath, size: st.size, mtimeIso: st.mtime.toISOString() };
}

function jobFile(root: string, id: string, suffix = ".json"): string {
  return path.join(root, "jobs", `${id}${suffix}`);
}

function auditHits(
  filePath: string,
  jobId: string,
): Array<Record<string, unknown>> {
  if (!fs.existsSync(filePath)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    if (!line.includes(jobId)) continue;
    try {
      out.push(JSON.parse(line) as Record<string, unknown>);
    } catch {
      out.push({ raw: line.slice(0, 240) });
    }
  }
  return out;
}

function listTrialNames(root: string, jobId: string): string[] {
  const dir = path.join(root, "trials", jobId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => /^\d{8}\.json$/.test(n)).sort();
}

export function productionStaleQueuedRoot(): string {
  return productionStrategySearchRootCanonical();
}

export function targetArtifactPaths(rootDir?: string): {
  job: string;
  plan: string;
  execution: string;
  generations: string;
  top10: string;
  top10History: string;
  trialDir: string;
  owner: string;
  index: string;
  ownershipAudit: string;
  recoveryAudit: string;
  bakTmp: string[];
} {
  const root = path.resolve(rootDir ?? productionStaleQueuedRoot());
  const jobsDir = path.join(root, "jobs");
  const bakTmp = fs.existsSync(jobsDir)
    ? fs
        .readdirSync(jobsDir)
        .filter((n) => n.includes(TARGET) && /(\.bak|\.tmp|~)$/i.test(n))
        .map((n) => path.join(jobsDir, n))
    : [];
  return {
    job: jobFile(root, TARGET),
    plan: jobFile(root, TARGET, ".plan.json"),
    execution: jobFile(root, TARGET, ".execution.json"),
    generations: jobFile(root, TARGET, ".generations.json"),
    top10: jobFile(root, TARGET, ".top10.json"),
    top10History: jobFile(root, TARGET, ".top10.history.jsonl"),
    trialDir: path.join(root, "trials", TARGET),
    owner: path.join(root, "owners", `${TARGET}.owner.json`),
    index: path.join(root, "index.json"),
    ownershipAudit: path.join(root, "execution-ownership-audit.jsonl"),
    recoveryAudit: path.join(root, "recovery-audit.jsonl"),
    bakTmp,
  };
}

function loadJob(root: string, id: string): StrategySearchJob {
  return rawReadJson<StrategySearchJob>(jobFile(root, id));
}

function loadPlan(root: string, id: string): StrategySearchPlan | null {
  return tryRawReadJson<StrategySearchPlan>(jobFile(root, id, ".plan.json"));
}

export function collectStaleQueuedReadonlyHashes(rootDir?: string): {
  index: string | null;
  targetJob: string | null;
  targetPlan: string | null;
  targetExecution: string | null;
  targetGenerations: string | null;
  targetTop10: string | null;
  targetTop10History: string | null;
  lastTrial: string | null;
  ownershipAudit: string | null;
  recoveryAudit: string | null;
  safe: string | null;
  nonTerminalJobs: Record<string, string | null>;
} {
  const root = path.resolve(rootDir ?? productionStaleQueuedRoot());
  const paths = targetArtifactPaths(root);
  const trials = listTrialNames(root, TARGET);
  const lastTrial = trials.length
    ? path.join(paths.trialDir, trials[trials.length - 1]!)
    : null;
  const base = collectProductionReadonlyHashes(root);
  return {
    index: base.index,
    targetJob: sha256File(paths.job),
    targetPlan: sha256File(paths.plan),
    targetExecution: sha256File(paths.execution),
    targetGenerations: sha256File(paths.generations),
    targetTop10: sha256File(paths.top10),
    targetTop10History: sha256File(paths.top10History),
    lastTrial: lastTrial ? sha256File(lastTrial) : null,
    ownershipAudit: base.ownershipAudit,
    recoveryAudit: base.recoveryAudit,
    safe: base.safe,
    nonTerminalJobs: base.nonTerminalJobs,
  };
}

export function loadStaleQueuedForensicDiagnosis(rootDir?: string): {
  root: string;
  targetId: typeof STALE_QUEUED_TARGET_ID;
  paths: ReturnType<typeof targetArtifactPaths>;
  job: {
    id: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    failureMessage: string | null;
    completedIterations: number;
    nextIteration: number;
    strategyTemplateId: string;
    generatorType: string;
    maxIterations: number | null;
    symbols: string[];
    timeframe: string | null;
  };
  plan: {
    completionReason: StrategySearchPlan["completionReason"] | null;
    maxRuntimeMs: number | null;
    campaignStartedAtMs: number | null;
    campaignStartedAtIso: string | null;
    startedAtMs: null;
    pausedAtMs: number | null;
    interruptedAtMs: number | null;
    accumulatedInterruptionMs: number | null;
    accumulatedPauseMs: number | null;
    resumedAtMs: number | null;
    elapsedMs: number | null;
    currentSpaceIndex: number;
    candidateBudget: number;
    candidateBudgetUsed: number;
    uniqueEvaluatedCount: number;
    qualifiedCount: number;
    qualifiedTarget: number;
    globalSeenHashes: number;
    searchName: string | null;
    spaces: Array<{
      index: number;
      id: string;
      labelKo: string | null;
      status: string;
      budgetAllocated: number | null;
      budgetSpent: number | null;
      uniqueEvaluated: number | null;
    }>;
  };
  checkpoint: {
    completedIterations: number;
    nextIteration: number;
    randomStatePresent: boolean;
    updatedAt: string | null;
    payloadJobStatus: string | null;
    payloadStopReason: string | null;
    payloadSeenHashes: number | null;
    payloadStatisticsElapsedMs: number | null;
  };
  trials: {
    count: number;
    firstIteration: number | null;
    lastIteration: number | null;
    lastCreatedAt: string | null;
    lastParamsHash: string | null;
  };
  generations: {
    count: number;
    bySpace: Record<string, number>;
    lastGenerationNumber: number | null;
    lastSpaceId: string | null;
    lastEndedAt: string | null;
  };
  indexRow: StrategySearchJobIndex["jobs"][number] | null;
  indexMatchesJob: boolean;
  trialCount: number;
  queuedClass: ReturnType<typeof classifyQueuedJob>;
  targetIsNormalPendingQueue: false;
  queuedBetweenSearchSpaces: typeof QUEUED_BETWEEN_SEARCH_SPACES;
  processLossExpectedState: typeof PROCESS_LOSS_EXPECTED_STATE;
  targetMatchesProcessLossContract: typeof TARGET_MATCHES_PROCESS_LOSS_CONTRACT;
  historicalRollbackEvidence: typeof HISTORICAL_ROLLBACK_EVIDENCE;
  fileWritePattern: typeof FILE_WRITE_PATTERN;
  canonicalExpectedState: typeof CANONICAL_EXPECTED_STATE;
  manualStartClassification: typeof MANUAL_START_CLASSIFICATION;
  duplicateWorkRisk: typeof DUPLICATE_WORK_RISK;
  correctionRequired: typeof CORRECTION_REQUIRED;
  operatorPresentation: typeof OPERATOR_PRESENTATION;
  latestPersistedWorkAt: string;
  historicalTimestampAuthority: string;
  campaignElapsedAtLastWorkMs: number | null;
  campaignElapsedNowMs: number;
  runtimeExceededIfStartedNow: boolean;
  recentPickerWouldInclude: boolean;
  recoverySectionWouldInclude: false;
  healthy: Array<{
    id: string;
    status: string;
    startedAt: string | null;
    completedIterations: number;
    trialCount: number;
    currentSpaceIndex: number | null;
    completionReason: string | null;
  }>;
  ownershipEvents: Array<{ at: string; event: unknown; reason: unknown }>;
  recoveryEvents: Array<Record<string, unknown>>;
  legalPathMatched: "REOPEN_NEXT_SPACE_OR_BATCH";
} {
  const root = path.resolve(rootDir ?? productionStaleQueuedRoot());
  const paths = targetArtifactPaths(root);
  const job = loadJob(root, TARGET);
  const plan = loadPlan(root, TARGET);
  if (!plan) throw new Error("target plan missing");
  const payload = readRunnerPayloadFromCheckpoint(job.checkpoint);
  const trialNames = listTrialNames(root, TARGET);
  const lastTrial = trialNames.length
    ? rawReadJson<{
        iteration: number;
        createdAt?: string;
        paramsHash?: string;
      }>(path.join(paths.trialDir, trialNames[trialNames.length - 1]!))
    : null;
  const firstTrial = trialNames.length
    ? rawReadJson<{ iteration: number }>(
        path.join(paths.trialDir, trialNames[0]!),
      )
    : null;
  const gensRaw = rawReadJson<unknown>(paths.generations);
  const gens = Array.isArray(gensRaw)
    ? gensRaw
    : ((gensRaw as { generations?: unknown[] }).generations ?? []);
  const bySpace: Record<string, number> = {};
  for (const g of gens as Array<{ spaceId?: string }>) {
    const id = g.spaceId ?? "null";
    bySpace[id] = (bySpace[id] ?? 0) + 1;
  }
  const lastGen = (gens as Array<{
    generationNumber?: number;
    spaceId?: string;
    endedAt?: string;
  }>).at(-1) ?? null;
  const index = rawReadJson<StrategySearchJobIndex>(paths.index);
  const indexRow = index.jobs.find((row) => row.id === TARGET) ?? null;
  const projected = projectSearchJobIndexEntry(job);
  const indexMatchesJob =
    indexRow != null &&
    indexRow.status === projected.status &&
    indexRow.updatedAt === projected.updatedAt &&
    indexRow.completedIterations === projected.completedIterations &&
    indexRow.finishedAt === projected.finishedAt;
  const ownership = auditHits(paths.ownershipAudit, TARGET);
  const now = Date.now();
  const campaignElapsedNowMs = activeElapsedMs(plan, now);
  const lastWorkMs = Date.parse(job.updatedAt);
  const campaignElapsedAtLastWorkMs =
    plan.campaignStartedAtMs != null && Number.isFinite(lastWorkMs)
      ? lastWorkMs - plan.campaignStartedAtMs
      : null;
  const allJobs = index.jobs
    .map((row) => tryRawReadJson<StrategySearchJob>(jobFile(root, row.id)))
    .filter((j): j is StrategySearchJob => j != null)
    .sort(compareJobsNewestFirst);
  const recentIds = new Set(allJobs.slice(0, 20).map((j) => j.id));

  return {
    root,
    targetId: TARGET,
    paths,
    job: {
      id: job.id,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      failureMessage: job.failureMessage,
      completedIterations: job.checkpoint.completedIterations,
      nextIteration: job.checkpoint.nextIteration,
      strategyTemplateId: job.config.strategyTemplateId,
      generatorType: job.config.generatorType,
      maxIterations: job.config.maxIterations ?? null,
      symbols: [...(job.config.symbols ?? [])],
      timeframe: job.config.timeframe ?? null,
    },
    plan: {
      completionReason: plan.completionReason ?? null,
      maxRuntimeMs: plan.maxRuntimeMs ?? null,
      campaignStartedAtMs: plan.campaignStartedAtMs,
      campaignStartedAtIso:
        plan.campaignStartedAtMs != null
          ? new Date(plan.campaignStartedAtMs).toISOString()
          : null,
      startedAtMs: null,
      pausedAtMs: plan.pausedAtMs ?? null,
      interruptedAtMs: plan.interruptedAtMs ?? null,
      accumulatedInterruptionMs: plan.accumulatedInterruptionMs ?? null,
      accumulatedPauseMs: plan.accumulatedPauseMs ?? null,
      resumedAtMs: plan.resumedAtMs ?? null,
      elapsedMs: plan.elapsedMs ?? null,
      currentSpaceIndex: plan.currentSpaceIndex,
      candidateBudget: plan.candidateBudget,
      candidateBudgetUsed: plan.candidateBudgetUsed,
      uniqueEvaluatedCount: plan.uniqueEvaluatedCount,
      qualifiedCount: plan.qualifiedHashes.length,
      qualifiedTarget: plan.qualifiedTarget,
      globalSeenHashes: plan.globalSeenHashes.length,
      searchName: plan.searchName ?? null,
      spaces: plan.spaces.map((s, i) => ({
        index: i,
        id: s.id,
        labelKo: s.labelKo ?? null,
        status: s.status,
        budgetAllocated: s.budgetAllocated ?? null,
        budgetSpent: s.budgetSpent ?? null,
        uniqueEvaluated: s.uniqueEvaluated ?? null,
      })),
    },
    checkpoint: {
      completedIterations: job.checkpoint.completedIterations,
      nextIteration: job.checkpoint.nextIteration,
      randomStatePresent: job.checkpoint.randomState != null,
      updatedAt: job.checkpoint.updatedAt ?? null,
      payloadJobStatus: payload?.jobStatus ?? null,
      payloadStopReason: payload?.stopReason ?? null,
      payloadSeenHashes: payload?.seenHashes.length ?? null,
      payloadStatisticsElapsedMs: payload?.statistics.elapsedMs ?? null,
    },
    trials: {
      count: trialNames.length,
      firstIteration: firstTrial?.iteration ?? null,
      lastIteration: lastTrial?.iteration ?? null,
      lastCreatedAt: lastTrial?.createdAt ?? null,
      lastParamsHash: lastTrial?.paramsHash ?? null,
    },
    generations: {
      count: gens.length,
      bySpace,
      lastGenerationNumber: lastGen?.generationNumber ?? null,
      lastSpaceId: lastGen?.spaceId ?? null,
      lastEndedAt: lastGen?.endedAt ?? null,
    },
    indexRow,
    indexMatchesJob,
    trialCount: trialNames.length,
    queuedClass: classifyQueuedJob({
      job,
      plan,
      hasExecutionProfile: fs.existsSync(paths.execution),
    }),
    targetIsNormalPendingQueue: false,
    queuedBetweenSearchSpaces: QUEUED_BETWEEN_SEARCH_SPACES,
    processLossExpectedState: PROCESS_LOSS_EXPECTED_STATE,
    targetMatchesProcessLossContract: TARGET_MATCHES_PROCESS_LOSS_CONTRACT,
    historicalRollbackEvidence: HISTORICAL_ROLLBACK_EVIDENCE,
    fileWritePattern: FILE_WRITE_PATTERN,
    canonicalExpectedState: CANONICAL_EXPECTED_STATE,
    manualStartClassification: MANUAL_START_CLASSIFICATION,
    duplicateWorkRisk: DUPLICATE_WORK_RISK,
    correctionRequired: CORRECTION_REQUIRED,
    operatorPresentation: OPERATOR_PRESENTATION,
    latestPersistedWorkAt: job.updatedAt,
    historicalTimestampAuthority:
      "job.checkpoint.updatedAt=2026-08-11T16:30:49.247Z (strongest durable work clock); last heartbeat 2026-08-11T16:30:41.410Z; last trial 2026-08-11T16:30:49.097Z. NONE required because no status correction.",
    campaignElapsedAtLastWorkMs,
    campaignElapsedNowMs,
    runtimeExceededIfStartedNow:
      plan.maxRuntimeMs != null && campaignElapsedNowMs >= plan.maxRuntimeMs,
    recentPickerWouldInclude: recentIds.has(TARGET),
    recoverySectionWouldInclude: false,
    healthy: HEALTHY_QUEUED_IDS.map((id) => {
      const h = loadJob(root, id);
      const hp = loadPlan(root, id);
      return {
        id,
        status: h.status,
        startedAt: h.startedAt,
        completedIterations: h.checkpoint.completedIterations,
        trialCount: listTrialNames(root, id).length,
        currentSpaceIndex: hp?.currentSpaceIndex ?? null,
        completionReason: hp?.completionReason ?? null,
      };
    }),
    ownershipEvents: ownership.map((r) => ({
      at: String(r.at ?? ""),
      event: r.event ?? null,
      reason: r.reason ?? null,
    })),
    recoveryEvents: auditHits(paths.recoveryAudit, TARGET),
    legalPathMatched: "REOPEN_NEXT_SPACE_OR_BATCH",
  };
}

export function proposedCorrection(): {
  required: false;
  changedArtifacts: [];
  changedFields: [];
  indexRowChanges: 0;
  rootIndexUpdatedAt: "UNCHANGED";
  proposedIndexSha256: string | null;
  futureOptionalIfOperatorWantsContinuation: {
    reason: string;
    wouldNeed: string[];
    helper: string;
    timestampAuthority: string;
  };
} {
  return {
    required: false,
    changedArtifacts: [],
    changedFields: [],
    indexRowChanges: 0,
    rootIndexUpdatedAt: "UNCHANGED",
    proposedIndexSha256: collectStaleQueuedReadonlyHashes().index,
    futureOptionalIfOperatorWantsContinuation: {
      reason:
        "Wall-clock campaignStartedAtMs makes Start today DEADLINE_REACHED. Interruption accounting would exclude the Aug 11→now gap.",
      wouldNeed: [
        "job.status queued→interrupted",
        "plan.interruptedAtMs from checkpoint.updatedAt",
        "index.status projection",
      ],
      helper:
        "purpose-built historical stamp; prepareInterruptedJobForRecovery requires an already-interrupted job",
      timestampAuthority: "checkpoint.updatedAt 2026-08-11T16:30:49.247Z",
    },
  };
}

export function writeStaleQueuedForensicArtifacts(
  artifactDir: string,
  rootDir?: string,
): ReturnType<typeof loadStaleQueuedForensicDiagnosis> {
  const d = loadStaleQueuedForensicDiagnosis(rootDir);
  const hashes = collectStaleQueuedReadonlyHashes(rootDir);
  fs.mkdirSync(artifactDir, { recursive: true });
  const write = (name: string, value: unknown) => {
    fs.writeFileSync(
      path.join(artifactDir, name),
      `${JSON.stringify(value, null, 2)}\n`,
    );
  };
  write("target-snapshot.json", {
    paths: d.paths,
    job: d.job,
    plan: d.plan,
    checkpoint: d.checkpoint,
    trials: d.trials,
    generations: d.generations,
    indexRow: d.indexRow,
    stats: {
      job: statMeta(d.paths.job),
      plan: statMeta(d.paths.plan),
      lastTrial: d.trials.lastIteration != null
        ? statMeta(
            path.join(
              d.paths.trialDir,
              `${String(d.trials.lastIteration).padStart(8, "0")}.json`,
            ),
          )
        : null,
    },
  });
  write("healthy-queued-comparison.json", {
    targetIsNormalPendingQueue: d.targetIsNormalPendingQueue,
    target: {
      startedAt: d.job.startedAt,
      completedIterations: d.job.completedIterations,
      trialCount: d.trialCount,
      currentSpaceIndex: d.plan.currentSpaceIndex,
      completionReason: d.plan.completionReason,
    },
    healthy: d.healthy,
  });
  write("target-timeline.json", {
    events: [
      {
        timestamp: d.job.createdAt,
        event: "job_created",
        statusAfter: "queued",
        confidence: "PROVEN_EVENT",
        source: d.paths.job,
      },
      {
        timestamp: d.ownershipEvents[0]?.at ?? null,
        event: "ownership_acquired",
        confidence: "PROVEN_EVENT",
        source: d.paths.ownershipAudit,
      },
      {
        timestamp: d.job.startedAt,
        event: "startedAt_set",
        statusAfter: "running_implied",
        confidence: "PROVEN_EVENT",
        source: d.paths.job,
      },
      {
        timestamp: d.trials.lastCreatedAt,
        event: "last_trial_written",
        confidence: "PROVEN_EVENT",
        source: d.paths.trialDir,
      },
      {
        timestamp: d.job.updatedAt,
        event: "reopenSearchJobForNextSpace_persist_queued",
        statusAfter: "queued",
        confidence: "STRONGLY_SUPPORTED",
        source: d.paths.job,
      },
      {
        timestamp: d.ownershipEvents.at(-1)?.at ?? null,
        event: "recovered_stale",
        ownershipAction: "startup_stale_sweep",
        runnerAction: "none — status already queued so interruptRunningJobFromStaleOwnership no-op",
        confidence: "PROVEN_EVENT",
        source: d.paths.ownershipAudit,
      },
    ],
    unknownGaps: [
      "No released ownership event between last heartbeat 2026-08-11T16:30:41.410Z and stale sweep 2026-08-12T01:19:50.703Z",
      "Whether the in-process continue after applyStageConfig died, was killed, or never scheduled",
      "No recovery-audit lines for this jobId",
    ],
  });
  write("source-transition-matrix.json", {
    legalQueuedPlusStartedAt: LEGAL_QUEUED_STARTED_AT_PATHS,
    matched: d.legalPathMatched,
  });
  write("manual-start-dry-analysis.json", {
    classification: d.manualStartClassification,
    duplicateWorkRisk: d.duplicateWorkRisk,
    runtimeExceededIfStartedNow: d.runtimeExceededIfStartedNow,
    campaignElapsedNowMs: d.campaignElapsedNowMs,
    campaignElapsedAtLastWorkMs: d.campaignElapsedAtLastWorkMs,
    maxRuntimeMs: d.plan.maxRuntimeMs,
    wouldCall: [
      "startStrategySearchJobApi",
      "startSearchJobExecution",
      "transitionJobToRunning",
      "runOrchestratedSearchJob",
      "runtimeExceeded → DEADLINE_REACHED because isDeadlineMode(maxRuntimeMs!=null)",
    ],
    wouldRestore: {
      nextIteration: d.checkpoint.nextIteration,
      completedIterations: d.checkpoint.completedIterations,
      seenHashes: d.checkpoint.payloadSeenHashes,
    },
    productionStartInvoked: false,
  });
  write("canonical-state-decision.json", {
    model: d.canonicalExpectedState,
    correctionRequired: d.correctionRequired,
    queuedBetweenSearchSpaces: d.queuedBetweenSearchSpaces,
    processLoss: {
      expected: d.processLossExpectedState,
      matchesContract: d.targetMatchesProcessLossContract,
    },
    rollback: d.historicalRollbackEvidence,
    operatorPresentation: d.operatorPresentation,
    evidence: [
      "reopenSearchJobForNextSpace is the only legal completed→queued path and preserves startedAt",
      "space 1 fvg already active with 300 unique / 112 generations — current persist is same-family batch reopen, not a first space handoff",
      "job.config.maxIterations=4600 equals completed 4560 + remaining family budget 40, proving applyStageConfig ran after reopen",
      "ownership last event is recovered_stale, not released; process-loss contract only interrupts running",
      "completionReason is null so the job is not a missed terminal",
    ],
  });
  write("proposed-correction.json", proposedCorrection());
  write("production-readonly-hashes.json", hashes);
  return d;
}
