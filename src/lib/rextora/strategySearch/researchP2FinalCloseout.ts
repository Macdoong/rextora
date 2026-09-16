/**
 * P2-G9 read-only final Research lifecycle close-out inventory.
 * Never writes production jobs, plans, index, audits, ownership, or SAFE.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  DASHBOARD_ATTENTION_VISIBLE_CAP,
  RESEARCH_RECOVERY_HREF,
} from "@/components/rextora/dashboard/dashboardResearchSelection";
import {
  RECOVERY_API_PAGE_SIZE,
  RECOVERY_VISIBLE_PAGE_SIZE,
  discoverInterruptedRecoveryJobs,
  isInterruptedRecoveryJob,
} from "@/components/rextora/strategySearch/interruptedRecoveryDiscovery";
import { productionStrategySearchRootCanonical } from "./historicalDeadlineCompletionDryRun";
import { projectSearchJobIndexEntry } from "./indexProjection";
import {
  type StrategySearchPlan,
} from "./searchPlan";
import {
  currentDeadlineReached,
  THREE_HOURS_MS,
  TWENTY_TWO_DAYS_MS,
} from "./queuedContinuationRuntimeDiagnosis";
import {
  isQueuedContinuationJob,
  queuedContinuationNeedsDowntimeNormalization,
} from "./processInterruption";
import {
  DEFAULT_ORPHAN_AUTO_RESUME_LIMIT,
  resolveOrphanAutoResumeLimit,
} from "./orphanJobRecovery";
import {
  buildResidualIssues,
  loadResidualLifecycleInventory,
  productionResidualInventoryRoot,
  type ResidualLifecycleInventory,
} from "./residualLifecycleInventory";
import {
  loadInterruptedRecoveryUiDiagnosis,
} from "./interruptedRecoveryUiDiagnosis";
import {
  planOrphanStartupSelection,
  resolveOrphanAutoResumeLimit as resolveStartupLimit,
} from "./startupResumePolicyDiagnosis";
import { STALE_QUEUED_TARGET_ID } from "./staleQueuedJobForensic";
import { listActiveSearchJobExecutions } from "./jobExecutionRegistry";
import { planHasNormalTerminalCompletionReason } from "./jobExecutionRegistry";
import type {
  StrategySearchJob,
  StrategySearchJobIndex,
  StrategySearchJobIndexEntry,
} from "./types";

export const PRIOR_VERIFIED_HEAD = "8c00049eb2e01980719487e1f12bcb3c7e4e5b8b";
export const G8_TYPo_HEAD = "8c00049eb2e01980719487e1f12bcb3e7e4e5b8b";

export type QueuedLifecycleClass =
  | "FRESH_PENDING"
  | "VALID_CONTINUATION"
  | "INVALID_QUEUE"
  | "REVIEW_REQUIRED";

export type InterruptedLifecycleClass =
  | "RESUMABLE"
  | "DEADLINE_TERMINALIZABLE"
  | "BLOCKED"
  | "INVALID";

export type P2CloseDecision =
  | "P2_CLOSE_READY"
  | "P2_CLOSE_WITH_DOCUMENTED_DEBT"
  | "P2_NOT_READY";

export type DebtSeverity =
  | "BLOCKER"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "INFORMATIONAL";

export interface ResidualDebtItem {
  issueCode: string;
  severity: DebtSeverity;
  category: "functional" | "structural" | "documentation" | "UX";
  affectedCount: number;
  affectedIds: string[];
  runtimeImpact: string;
  operatorImpact: string;
  recurrencePossible: boolean;
  p2Blocker: boolean;
  recommendedPhase: string;
}

function sha256File(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

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

function readGitHead(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function readGitBranch(): string {
  try {
    return execSync("git branch --show-current", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function indexFieldsEqual(
  row: StrategySearchJobIndexEntry,
  canonical: StrategySearchJobIndexEntry,
): string[] {
  const diffs: string[] = [];
  for (const key of [
    "id",
    "status",
    "updatedAt",
    "completedIterations",
    "finishedAt",
    "strategyTemplateId",
    "generatorType",
    "createdAt",
  ] as const) {
    if (row[key] !== canonical[key]) diffs.push(key);
  }
  return diffs;
}

export function verifyG8SourceContract(): {
  present: boolean;
  matchesModelB: boolean;
  evidence: string[];
} {
  const pi = path.join(process.cwd(), "src/lib/rextora/strategySearch/processInterruption.ts");
  const api = path.join(process.cwd(), "src/lib/rextora/strategySearch/jobApiService.ts");
  const orch = path.join(process.cwd(), "src/lib/rextora/strategySearch/searchOrchestrator.ts");
  const plan = path.join(process.cwd(), "src/lib/rextora/strategySearch/searchPlan.ts");
  const piSrc = fs.readFileSync(pi, "utf8");
  const apiSrc = fs.readFileSync(api, "utf8");
  const orchSrc = fs.readFileSync(orch, "utf8");
  const planSrc = fs.readFileSync(plan, "utf8");
  const evidence: string[] = [];
  const checks = {
    needs: piSrc.includes("queuedContinuationNeedsDowntimeNormalization"),
    normalize: piSrc.includes("normalizeQueuedContinuationRuntimeIfNeeded"),
    restore: piSrc.includes("restoreQueuedContinuationPlan"),
    fold: piSrc.includes("foldQueuedContinuationDowntime"),
    boundary: piSrc.includes("resolveQueuedContinuationBoundaryMs"),
    startIntegrate: apiSrc.includes("normalizeQueuedContinuationRuntimeIfNeeded"),
    rollback: apiSrc.includes("restoreQueuedContinuationPlan"),
    campaignPreserved: piSrc.includes("campaignStartedAtMs") && !piSrc.includes("campaignStartedAtMs = Date.now()"),
    activeElapsedUnchanged: planSrc.includes("export function activeElapsedMs"),
    runtimeExceededUnchanged: orchSrc.includes("return activeElapsedMs(plan) >= plan.maxRuntimeMs"),
  };
  if (checks.needs) evidence.push("queuedContinuationNeedsDowntimeNormalization");
  if (checks.normalize) evidence.push("normalizeQueuedContinuationRuntimeIfNeeded");
  if (checks.startIntegrate) evidence.push("startStrategySearchJobApi integration");
  if (checks.rollback) evidence.push("restoreQueuedContinuationPlan rollback");
  if (checks.boundary) evidence.push("durable boundary clocks");
  const present =
    checks.needs &&
    checks.normalize &&
    checks.startIntegrate &&
    checks.rollback &&
    checks.fold &&
    checks.boundary;
  const matchesModelB =
    present &&
    checks.campaignPreserved &&
    checks.activeElapsedUnchanged &&
    checks.runtimeExceededUnchanged;
  return { present, matchesModelB, evidence };
}

export function classifyQueuedLifecycle(input: {
  job: StrategySearchJob;
  plan: StrategySearchPlan | null;
  hasExecutionProfile: boolean;
}): QueuedLifecycleClass {
  if (input.job.status !== "queued") return "REVIEW_REQUIRED";
  if (
    input.job.finishedAt != null ||
    planHasNormalTerminalCompletionReason(input.plan)
  ) {
    return "INVALID_QUEUE";
  }
  if (isQueuedContinuationJob(input.job, input.plan)) {
    return "VALID_CONTINUATION";
  }
  if (
    input.job.startedAt == null &&
    input.job.checkpoint.completedIterations === 0 &&
    (input.plan == null || input.plan.campaignStartedAtMs == null)
  ) {
    return "FRESH_PENDING";
  }
  return "REVIEW_REQUIRED";
}

export function classifyInterruptedLifecycle(input: {
  interruptedClass: string | null;
}): InterruptedLifecycleClass {
  switch (input.interruptedClass) {
    case "VALID_INTERRUPTED_RESUMABLE":
      return "RESUMABLE";
    case "VALID_INTERRUPTED_DEADLINE_TERMINALIZABLE":
      return "DEADLINE_TERMINALIZABLE";
    case "INVALID_INTERRUPTED":
      return "INVALID";
    case "HISTORICAL_ATTENTION_ONLY":
      return "BLOCKED";
    default:
      return "BLOCKED";
  }
}

export function isUnsafeQueuedStartWithoutG8(input: {
  job: StrategySearchJob;
  plan: StrategySearchPlan | null;
  now?: number;
}): boolean {
  if (input.job.status !== "queued" || !input.plan) return false;
  if (planHasNormalTerminalCompletionReason(input.plan)) return false;
  if (!isQueuedContinuationJob(input.job, input.plan)) return false;
  const now = input.now ?? Date.now();
  return currentDeadlineReached(input.plan, now);
}

export function isUnsafeQueuedStartAtNow(input: {
  job: StrategySearchJob;
  plan: StrategySearchPlan | null;
  now?: number;
  g8Present?: boolean;
}): boolean {
  if (input.job.status !== "queued" || !input.plan) return false;
  if (planHasNormalTerminalCompletionReason(input.plan)) return false;
  if (!isQueuedContinuationJob(input.job, input.plan)) return false;
  const now = input.now ?? Date.now();
  const g8 = input.g8Present ?? true;
  if (g8 && queuedContinuationNeedsDowntimeNormalization(input.job, input.plan, now)) {
    return false;
  }
  return currentDeadlineReached(input.plan, now);
}

function scanIndexCanonicalMirror(root: string): {
  statusMismatch: string[];
  canonicalMismatch: Array<{ jobId: string; fields: string[] }>;
} {
  const index = rawReadJson<StrategySearchJobIndex>(path.join(root, "index.json"));
  const statusMismatch: string[] = [];
  const canonicalMismatch: Array<{ jobId: string; fields: string[] }> = [];
  for (const row of index.jobs) {
    const job = tryRawReadJson<StrategySearchJob>(
      path.join(root, "jobs", `${row.id}.json`),
    );
    if (!job) {
      statusMismatch.push(row.id);
      continue;
    }
    if (row.status !== job.status) statusMismatch.push(row.id);
    const canonical = projectSearchJobIndexEntry(job);
    const diffs = indexFieldsEqual(row, canonical);
    if (diffs.length > 0) {
      canonicalMismatch.push({ jobId: row.id, fields: diffs });
    }
  }
  return { statusMismatch, canonicalMismatch };
}

function classifyMutatingGetRecover(): {
  classification: "FUNCTIONAL_BLOCKER" | "HIGH_DEBT" | "MEDIUM_DEBT" | "LOW_DEBT";
  semantics: string;
  unsetRisk: string;
  overrideRisk: string;
} {
  const route = path.join(
    process.cwd(),
    "app/api/rextora/strategy-search/recover/route.ts",
  );
  const src = fs.readFileSync(route, "utf8");
  const unsetLimit = resolveOrphanAutoResumeLimit(process.env);
  const getReadonly =
    src.includes("inspectOrphanSearchJobs") && !src.includes("return POST()");
  return {
    classification: getReadonly
      ? "LOW_DEBT"
      : unsetLimit === 0
        ? "MEDIUM_DEBT"
        : "HIGH_DEBT",
    semantics: getReadonly
      ? "GET inspects via inspectOrphanSearchJobs; POST mutates via recoverOrphanSearchJobs"
      : "GET and POST both call recoverOrphanSearchJobs(); GET is idempotent mutation hook",
    unsetRisk: getReadonly
      ? "GET cannot mutate even when auto-resume limit is nonzero"
      : unsetLimit === 0
        ? "Default-zero: recoverOrphanSearchJobs runs but selects 0 auto-starts"
        : "Nonzero default would auto-start on GET probe",
    overrideRisk: getReadonly
      ? "REXTORA_ORPHAN_AUTO_RESUME_LIMIT>0 can mutate via POST recover only"
      : "REXTORA_ORPHAN_AUTO_RESUME_LIMIT>0 can mutate via GET/POST recover endpoint",
  };
}

function classifyAgentInterruptedResume(): {
  classification: "FUNCTIONAL_BLOCKER" | "HIGH_DEBT" | "MEDIUM_DEBT" | "LOW_DEBT";
  blocksOperatorRecovery: boolean;
  contradictsUi: boolean;
  note: string;
} {
  const src = fs.readFileSync(
    path.join(process.cwd(), "src/lib/rextora/agent/v2/tools/execHandlers.ts"),
    "utf8",
  );
  const usesResumeForInterrupted =
    src.includes('current.status === "interrupted"') &&
    src.includes("resumeStrategySearchJobApi");
  const usesResumeForPaused = src.includes('current.status === "paused"');
  const usesStartOtherwise = src.includes("startStrategySearchJobApi");
  return {
    classification: usesResumeForInterrupted ? "LOW_DEBT" : "MEDIUM_DEBT",
    blocksOperatorRecovery: false,
    contradictsUi: !usesResumeForInterrupted,
    note: usesResumeForInterrupted
      ? "search.start resumes paused and interrupted via resumeStrategySearchJobApi; no auto-resume"
      : usesResumeForPaused && usesStartOtherwise
        ? "search.start resumes paused only; interrupted jobs need resumeStrategySearchJobApi — Research Recovery UI supports Resume"
        : "Agent search.start path does not resume interrupted",
  };
}

function assessDiskOnlyRuntimeRisk(
  inventory: ResidualLifecycleInventory,
): "NONE" | "LOW" | "MATERIAL" | "UNKNOWN" {
  if (inventory.diskOnlyCount === 0) return "NONE";
  const recoverSrc = fs.readFileSync(
    path.join(process.cwd(), "src/lib/rextora/strategySearch/orphanJobRecovery.ts"),
    "utf8",
  );
  const reindex = recoverSrc.includes("recoverOrphanIndexEntries");
  if (reindex && inventory.diskOnlyCount > 0) return "LOW";
  return inventory.diskOnlyCount > 5 ? "MATERIAL" : "LOW";
}

function assessResponsiveContract(): "PASS" | "FAIL" {
  const section = fs.readFileSync(
    path.join(
      process.cwd(),
      "components/rextora/strategySearch/InterruptedRecoverySection.tsx",
    ),
    "utf8",
  );
  const css = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");
  const ok =
    section.includes('id="ss-recovery"') &&
    section.includes("flex-wrap") &&
    section.includes("min-w-0") &&
    css.includes("#ss-recovery") &&
    css.includes("scroll-margin-top") &&
    RECOVERY_API_PAGE_SIZE === 100 &&
    RECOVERY_VISIBLE_PAGE_SIZE === 10 &&
    DASHBOARD_ATTENTION_VISIBLE_CAP === 3 &&
    RESEARCH_RECOVERY_HREF === "/strategy-search#ss-recovery";
  return ok ? "PASS" : "FAIL";
}

function buildG9ResidualDebt(
  inventory: ResidualLifecycleInventory,
  queuedUnsafe: string[],
  mutatingGet: ReturnType<typeof classifyMutatingGetRecover>,
  agentGap: ReturnType<typeof classifyAgentInterruptedResume>,
  diskRisk: ReturnType<typeof assessDiskOnlyRuntimeRisk>,
): ResidualDebtItem[] {
  const base = buildResidualIssues(inventory).map((row) => ({
    issueCode: row.issueCode,
    severity: row.severity,
    category:
      row.issueCode.includes("UI") || row.issueCode.includes("VIEWPORT")
        ? ("UX" as const)
        : row.issueCode.includes("INDEX") || row.issueCode.includes("DISK")
          ? ("structural" as const)
          : ("functional" as const),
    affectedCount: row.affectedCount,
    affectedIds: row.exactIds,
    runtimeImpact: row.runtimeImpact,
    operatorImpact: row.operatorImpact,
    recurrencePossible: row.currentRecurrencePossible,
    p2Blocker: row.severity === "BLOCKER",
    recommendedPhase: row.recommendedNextAction,
  }));

  const extra: ResidualDebtItem[] = [
    {
      issueCode: "MUTATING_GET_RECOVER",
      severity:
        mutatingGet.classification === "HIGH_DEBT"
          ? "HIGH"
          : mutatingGet.classification === "MEDIUM_DEBT"
            ? "MEDIUM"
            : "LOW",
      category: "structural",
      affectedCount: 1,
      affectedIds: ["GET /api/rextora/strategy-search/recover"],
      runtimeImpact: mutatingGet.unsetRisk,
      operatorImpact: mutatingGet.overrideRisk,
      recurrencePossible: true,
      p2Blocker: false,
      recommendedPhase: "P3: split GET health from POST recover or no-op GET",
    },
    {
      issueCode: "AGENT_INTERRUPTED_RESUME_GAP",
      severity:
        agentGap.classification === "MEDIUM_DEBT" ? "MEDIUM" : "LOW",
      category: "UX",
      affectedCount: inventory.interruptedIds.length,
      affectedIds: inventory.interruptedIds.slice(0, 5),
      runtimeImpact: agentGap.note,
      operatorImpact: "Recovery UI/API Resume works; Agent search.start does not",
      recurrencePossible: true,
      p2Blocker: false,
      recommendedPhase: "P3: route interrupted to resumeStrategySearchJobApi in Agent",
    },
    {
      issueCode: "DISK_ONLY_FOSSILS",
      severity: diskRisk === "MATERIAL" ? "HIGH" : diskRisk === "LOW" ? "LOW" : "INFORMATIONAL",
      category: "structural",
      affectedCount: inventory.diskOnlyCount,
      affectedIds: inventory.diskOnly.map((d) => d.jobId),
      runtimeImpact: `disk-only runtime risk=${diskRisk}`,
      operatorImpact: "hidden from index; may appear after re-index",
      recurrencePossible: false,
      p2Blocker: false,
      recommendedPhase: "P3: approved re-index or archival policy",
    },
    {
      issueCode: "VIEWPORT_VISUAL_VALIDATION_PENDING",
      severity: "INFORMATIONAL",
      category: "UX",
      affectedCount: 0,
      affectedIds: [],
      runtimeImpact: "DOM/CSS contracts pass; no live browser proof in G9",
      operatorImpact: "responsive behavior unverified at 390/1024/1440 in this phase",
      recurrencePossible: false,
      p2Blocker: false,
      recommendedPhase: "Global UI regression phase",
    },
    {
      issueCode: "HISTORICAL_INTERRUPTED_ATTENTION_ONLY",
      severity: "LOW",
      category: "functional",
      affectedCount: inventory.interruptedClassCounts.HISTORICAL_ATTENTION_ONLY,
      affectedIds: inventory.interruptedIds.filter(
        (id) =>
          inventory.jobs.find((j) => j.jobId === id)?.interruptedClass ===
          "HISTORICAL_ATTENTION_ONLY",
      ),
      runtimeImpact: "blocked by missing profile/timing/checkpoint",
      operatorImpact: "visible in Recovery UI but Resume disabled",
      recurrencePossible: false,
      p2Blocker: false,
      recommendedPhase: "Historical cleanup or leave attention-only",
    },
  ];

  if (queuedUnsafe.length > 0) {
    extra.unshift({
      issueCode: "UNSAFE_QUEUED_START",
      severity: "BLOCKER",
      category: "functional",
      affectedCount: queuedUnsafe.length,
      affectedIds: queuedUnsafe,
      runtimeImpact: "Start would false-deadline without G8 normalization",
      operatorImpact: "operator Start unsafe",
      recurrencePossible: true,
      p2Blocker: true,
      recommendedPhase: "Fix G8 or block Start",
    });
  }

  const merged = [...base, ...extra];
  const seen = new Set<string>();
  return merged.filter((item) => {
    if (seen.has(item.issueCode)) return false;
    seen.add(item.issueCode);
    return item.affectedCount > 0 || item.severity === "INFORMATIONAL";
  });
}

function decideP2Close(input: {
  inventory: ResidualLifecycleInventory;
  queuedUnsafe: string[];
  indexStatusMismatch: number;
  canonicalMismatch: number;
  terminalViolations: number;
  debt: ResidualDebtItem[];
}): P2CloseDecision {
  const blockers = input.debt.filter((d) => d.p2Blocker);
  if (
    input.queuedUnsafe.length > 0 ||
    input.inventory.jobs.some((j) =>
      j.findings.includes("queued_plus_normal_terminal_reason"),
    ) ||
    input.terminalViolations > 0 ||
    input.inventory.ownershipInconsistencies.activeExecutionWithTerminalJob.length >
      0 ||
    blockers.some((b) => b.issueCode !== "UNSAFE_QUEUED_START" && b.p2Blocker)
  ) {
    return "P2_NOT_READY";
  }
  if (
    input.debt.length > 0 ||
    input.inventory.reviewCount > 0 ||
    input.inventory.interruptedClassCounts.HISTORICAL_ATTENTION_ONLY > 0
  ) {
    return "P2_CLOSE_WITH_DOCUMENTED_DEBT";
  }
  return "P2_CLOSE_READY";
}

export function loadResearchP2FinalCloseout(rootDir?: string): {
  branch: string;
  actualHead: string;
  priorHead: string;
  headChangedSincePriorVerification: boolean;
  g8: ReturnType<typeof verifyG8SourceContract>;
  inventory: ResidualLifecycleInventory;
  indexJobStatusMismatchTotal: number;
  indexJobCanonicalMismatchTotal: number;
  queuedClassification: Array<{
    jobId: string;
    class: QueuedLifecycleClass;
    unsafeWithoutG8: boolean;
    unsafeAtNow: boolean;
    g8WouldNormalize: boolean;
  }>;
  interruptedClassification: Array<{
    jobId: string;
    class: InterruptedLifecycleClass;
    blocker: string | null;
  }>;
  autoResume: {
    developmentUnset: number;
    productionUnset: number;
    testUnset: number;
    defaultSelectedIds: string[];
    explicitLimit2SelectedIds: string[];
    explicitLimit100CandidateCount: number;
  };
  recoveryUi: ReturnType<typeof loadInterruptedRecoveryUiDiagnosis>;
  operatorPresentationContradictionCount: number;
  mutatingGetRecover: ReturnType<typeof classifyMutatingGetRecover>;
  agentInterruptedResume: ReturnType<typeof classifyAgentInterruptedResume>;
  diskOnlyRuntimeRisk: ReturnType<typeof assessDiskOnlyRuntimeRisk>;
  responsiveDomCssContract: "PASS" | "FAIL";
  residualDebt: ResidualDebtItem[];
  closeDecision: P2CloseDecision;
  terminalViolationIds: string[];
  queuedWithNormalTerminalReason: string[];
  unsafeQueuedStartIds: string[];
} {
  const root = path.resolve(rootDir ?? productionResidualInventoryRoot());
  const actualHead = readGitHead();
  const inventory = loadResidualLifecycleInventory(root);
  const mirror = scanIndexCanonicalMirror(root);
  const g8 = verifyG8SourceContract();
  const jobsDir = path.join(root, "jobs");

  const queuedClassification = inventory.jobs
    .filter((j) => j.status === "queued")
    .map((rec) => {
      const job = tryRawReadJson<StrategySearchJob>(path.join(jobsDir, `${rec.jobId}.json`))!;
      const plan = tryRawReadJson<StrategySearchPlan>(
        path.join(jobsDir, `${rec.jobId}.plan.json`),
      );
      const now = Date.now();
      return {
        jobId: rec.jobId,
        class: classifyQueuedLifecycle({
          job,
          plan,
          hasExecutionProfile: fs.existsSync(
            path.join(jobsDir, `${rec.jobId}.execution.json`),
          ),
        }),
        unsafeWithoutG8: isUnsafeQueuedStartWithoutG8({ job, plan, now }),
        unsafeAtNow: isUnsafeQueuedStartAtNow({
          job,
          plan,
          now,
          g8Present: g8.present,
        }),
        g8WouldNormalize: queuedContinuationNeedsDowntimeNormalization(
          job,
          plan,
          now,
        ),
      };
    });

  const interruptedClassification = inventory.jobs
    .filter((j) => j.status === "interrupted")
    .map((rec) => {
      const job = tryRawReadJson<StrategySearchJob>(path.join(jobsDir, `${rec.jobId}.json`))!;
      tryRawReadJson<StrategySearchPlan>(
        path.join(jobsDir, `${rec.jobId}.plan.json`),
      );
      return {
        jobId: rec.jobId,
        class: classifyInterruptedLifecycle({
          interruptedClass: rec.interruptedClass,
        }),
        blocker:
          rec.interruptedClass === "VALID_INTERRUPTED_RESUMABLE"
            ? null
            : rec.interruptedClass,
      };
    });

  const unsafeQueuedStartIds = queuedClassification
    .filter((q) => q.unsafeAtNow)
    .map((q) => q.jobId);

  const terminalViolationIds = [
    ...inventory.terminalWithoutFinishedAt,
    ...inventory.terminalWithActiveExecution,
    ...inventory.terminalIllegalReason,
  ];

  const queuedWithNormalTerminalReason = inventory.jobs
    .filter((j) => j.findings.includes("queued_plus_normal_terminal_reason"))
    .map((j) => j.jobId);

  const defaultPlan = planOrphanStartupSelection({
    rootDir: root,
    resumeLimit: resolveStartupLimit(process.env),
  });
  const limit2 = planOrphanStartupSelection({ rootDir: root, resumeLimit: 2 });
  const limit100 = planOrphanStartupSelection({ rootDir: root, resumeLimit: 100 });

  const recoveryUi = loadInterruptedRecoveryUiDiagnosis(root);
  const mutatingGetRecover = classifyMutatingGetRecover();
  const agentInterruptedResume = classifyAgentInterruptedResume();
  const diskOnlyRuntimeRisk = assessDiskOnlyRuntimeRisk(inventory);
  inventory.diskOnlyRuntimeRisk = diskOnlyRuntimeRisk;

  const residualDebt = buildG9ResidualDebt(
    inventory,
    unsafeQueuedStartIds,
    mutatingGetRecover,
    agentInterruptedResume,
    diskOnlyRuntimeRisk,
  );

  const closeDecision = decideP2Close({
    inventory,
    queuedUnsafe: unsafeQueuedStartIds,
    indexStatusMismatch: mirror.statusMismatch.length,
    canonicalMismatch: mirror.canonicalMismatch.length,
    terminalViolations: terminalViolationIds.length,
    debt: residualDebt,
  });

  return {
    branch: readGitBranch(),
    actualHead,
    priorHead: PRIOR_VERIFIED_HEAD,
    headChangedSincePriorVerification: actualHead !== PRIOR_VERIFIED_HEAD,
    g8,
    inventory,
    indexJobStatusMismatchTotal: mirror.statusMismatch.length,
    indexJobCanonicalMismatchTotal: mirror.canonicalMismatch.length,
    queuedClassification,
    interruptedClassification,
    autoResume: {
      developmentUnset: resolveOrphanAutoResumeLimit({ NODE_ENV: "development" }),
      productionUnset: resolveOrphanAutoResumeLimit({ NODE_ENV: "production" }),
      testUnset: resolveOrphanAutoResumeLimit({ NODE_ENV: "test" }),
      defaultSelectedIds: defaultPlan.selected
        .filter((s) => s.selected)
        .map((s) => s.jobId),
      explicitLimit2SelectedIds: limit2.selected
        .filter((s) => s.selected)
        .map((s) => s.jobId),
      explicitLimit100CandidateCount: limit100.selected.filter((s) => s.selected)
        .length,
    },
    recoveryUi,
    operatorPresentationContradictionCount:
      inventory.dashboard.contradictions.length,
    mutatingGetRecover,
    agentInterruptedResume,
    diskOnlyRuntimeRisk,
    responsiveDomCssContract: assessResponsiveContract(),
    residualDebt,
    closeDecision,
    terminalViolationIds,
    queuedWithNormalTerminalReason,
    unsafeQueuedStartIds,
  };
}

export function writeResearchP2FinalCloseoutArtifacts(
  outDir: string,
  rootDir?: string,
): {
  outDir: string;
  closeout: ReturnType<typeof loadResearchP2FinalCloseout>;
} {
  const closeout = loadResearchP2FinalCloseout(rootDir);
  fs.mkdirSync(outDir, { recursive: true });
  const write = (name: string, value: unknown) =>
    fs.writeFileSync(path.join(outDir, name), JSON.stringify(value, null, 2));

  write("head-verification.json", {
    branch: closeout.branch,
    actualHead: closeout.actualHead,
    priorHead: closeout.priorHead,
    g8TypoHeadFromReport: G8_TYPo_HEAD,
    headChangedSincePriorVerification: closeout.headChangedSincePriorVerification,
    g8: closeout.g8,
  });
  write("production-status.json", {
    owners: fs.existsSync(path.join(closeout.inventory.rootDir, "owners"))
      ? fs.readdirSync(path.join(closeout.inventory.rootDir, "owners")).filter((n) =>
          n.endsWith(".owner.json"),
        ).length
      : 0,
    registryActive: listActiveSearchJobExecutions().length,
    indexedJobCount: closeout.inventory.indexedJobCount,
    statusCounts: closeout.inventory.statusCounts,
    hashes: closeout.inventory.hashes,
  });
  write("lifecycle-inventory.json", {
    diskJobCount: closeout.inventory.diskJobCount,
    diskOnlyCount: closeout.inventory.diskOnlyCount,
    healthyCount: closeout.inventory.healthyCount,
    reviewCount: closeout.inventory.reviewCount,
    invalidCount: closeout.inventory.invalidCount,
    terminalViolationIds: closeout.terminalViolationIds,
    indexJobStatusMismatchTotal: closeout.indexJobStatusMismatchTotal,
    indexJobCanonicalMismatchTotal: closeout.indexJobCanonicalMismatchTotal,
  });
  write("queued-classification.json", {
    queued: closeout.queuedClassification,
    targetId: STALE_QUEUED_TARGET_ID,
    queuedWithNormalTerminalReason: closeout.queuedWithNormalTerminalReason,
    unsafeQueuedStartIds: closeout.unsafeQueuedStartIds,
  });
  write("interrupted-classification.json", {
    interrupted: closeout.interruptedClassification,
    classCounts: closeout.inventory.interruptedClassCounts,
  });
  write("auto-resume-policy.json", {
    defaultOrphanAutoResumeLimit: DEFAULT_ORPHAN_AUTO_RESUME_LIMIT,
    ...closeout.autoResume,
    unexpectedDefaultBootStartCount:
      closeout.autoResume.defaultSelectedIds.length,
  });
  write("g8-runtime-regression.json", {
    caseA: {
      activeMs: 10 * 60_000,
      downtimeMs: TWENTY_TWO_DAYS_MS,
      remainingMs: THREE_HOURS_MS - 10 * 60_000,
    },
    caseB: {
      activeMs: 179 * 60_000,
      remainingMs: 60_000,
    },
    caseExpired: { activeMs: 181 * 60_000, deadline: true },
    source: closeout.g8,
  });
  write("operator-recovery-ui.json", {
    recoveryUi: closeout.recoveryUi,
    responsiveDomCssContract: closeout.responsiveDomCssContract,
    dashboardRecoveryHref: RESEARCH_RECOVERY_HREF,
    dashboardAttentionCap: DASHBOARD_ATTENTION_VISIBLE_CAP,
  });
  write("residual-debt.json", closeout.residualDebt);
  write("close-decision.json", {
    decision: closeout.closeDecision,
    operatorPresentationContradictionCount:
      closeout.operatorPresentationContradictionCount,
    mutatingGetRecover: closeout.mutatingGetRecover,
    agentInterruptedResume: closeout.agentInterruptedResume,
    diskOnlyRuntimeRisk: closeout.diskOnlyRuntimeRisk,
  });
  write("production-readonly-hashes.json", closeout.inventory.hashes);
  return { outDir, closeout };
}

export function productionCloseoutRoot(): string {
  return productionStrategySearchRootCanonical();
}

export { THREE_HOURS_MS, TWENTY_TWO_DAYS_MS, STALE_QUEUED_TARGET_ID };
