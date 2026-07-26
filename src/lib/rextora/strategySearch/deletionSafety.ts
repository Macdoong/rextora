/**
 * Deletion safety service for Strategy Search artifacts.
 * Builds a reference graph and classifies deletable / archive-only / protected.
 * Never deletes SAFE. Never uses substring-only matching.
 */

import fs from "node:fs";
import path from "node:path";
import {
  getSearchJob,
  listSearchTrials,
  type StrategySearchStoreOptions,
} from "./jobStore";
import { getSearchPlan } from "./searchPlan";
import { getResearchTop10 } from "./researchTop10";
import {
  deleteSearchJobIfAllowed,
  getManualDeleteBlockReason,
  manualDeleteBlockMessageKo,
} from "./historyRetention";
import { listStrategies } from "../strategy/strategyStore";
import { EXPECTED_SAFE_PARAMS_HASH, SAFE_STRATEGY_ID } from "../strategy/strategyTypes";
import { parseSourceResearchJobId } from "./researchResultsSummary";
import { listSavedBacktests } from "../backtest/backtestStore";
import { listPaperSessions } from "../paper/paperSessionStore";
import { isProvenanceDetached } from "./researchProvenance";

export type DeletionClass = "deletable" | "archive_only" | "protected";

export interface DeletionImpactPreview {
  targetType: "research_job" | "saved_config" | "raw_trials";
  targetId: string;
  classification: DeletionClass;
  reasonsKo: string[];
  researchJobCount: number;
  trialCount: number;
  top10Count: number;
  registeredStrategyRefs: string[];
  backtestRefs: string[];
  paperRefs: string[];
  liveRefs: string[];
  bytesToRemove: number;
  protectedItems: string[];
  deletablePaths: string[];
}

function defaultRoot(): string {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "rextora",
    "strategy-search",
  );
}

function resolveRoot(options?: StrategySearchStoreOptions): string {
  return path.resolve(options?.rootDir ?? defaultRoot());
}

function dirBytes(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  const walk = (p: string) => {
    const st = fs.statSync(p);
    if (st.isFile()) {
      total += st.size;
      return;
    }
    if (st.isDirectory()) {
      for (const name of fs.readdirSync(p)) walk(path.join(p, name));
    }
  };
  walk(dir);
  return total;
}

function fileBytes(fp: string): number {
  try {
    return fs.existsSync(fp) ? fs.statSync(fp).size : 0;
  } catch {
    return 0;
  }
}

function appendAudit(
  root: string,
  event: Record<string, unknown>,
): void {
  const fp = path.join(root, "deletion-audit.jsonl");
  fs.mkdirSync(root, { recursive: true });
  fs.appendFileSync(fp, `${JSON.stringify(event)}\n`, "utf8");
}

/**
 * Impact preview for deleting a Research Job (or archiving).
 */
export function previewResearchJobDeletion(
  jobId: string,
  options?: StrategySearchStoreOptions,
): DeletionImpactPreview {
  const root = resolveRoot(options);
  const job = getSearchJob(jobId, options);
  const trials = listSearchTrials(jobId, options);
  const top10 = getResearchTop10(jobId, options);
  const plan = getSearchPlan(jobId, options);

  const strategies = listStrategies();
  const registeredStrategyRefs = strategies
    .filter((s) => {
      if (s.id === SAFE_STRATEGY_ID || s.paramsHash === EXPECTED_SAFE_PARAMS_HASH) {
        return false;
      }
      // Detached provenance keeps snapshot but no longer blocks job deletion.
      if (isProvenanceDetached(s.description)) return false;
      return parseSourceResearchJobId(s.description) === jobId;
    })
    .map((s) => s.id);

  let backtestRefs: string[] = [];
  try {
    const bts = listSavedBacktests(500);
    const registeredSet = new Set(registeredStrategyRefs);
    backtestRefs = bts
      .filter(
        (b) => typeof b.strategyId === "string" && registeredSet.has(b.strategyId),
      )
      .map((b) => b.id);
  } catch {
    backtestRefs = [];
  }

  let paperRefs: string[] = [];
  try {
    const sessions = listPaperSessions();
    const registeredSet = new Set(registeredStrategyRefs);
    paperRefs = sessions
      .filter((s) => registeredSet.has(s.strategyId))
      .map((s) => s.id);
  } catch {
    paperRefs = [];
  }

  // Live dry-run: best-effort scan of session if present
  const liveRefs: string[] = [];
  try {
    const liveSession = path.join(
      process.cwd(),
      "data",
      "rextora",
      "live-dry-run",
      "session.json",
    );
    if (fs.existsSync(liveSession)) {
      const raw = JSON.parse(fs.readFileSync(liveSession, "utf8")) as {
        strategyId?: string;
      };
      if (raw.strategyId && registeredStrategyRefs.includes(raw.strategyId)) {
        liveRefs.push(raw.strategyId);
      }
    }
  } catch {
    /* optional */
  }

  const trialsDir = path.join(root, "trials", jobId);
  const jobFile = path.join(root, "jobs", `${jobId}.json`);
  const planFile = path.join(root, "jobs", `${jobId}.plan.json`);
  const execFile = path.join(root, "jobs", `${jobId}.execution.json`);
  const genFile = path.join(root, "jobs", `${jobId}.generations.json`);
  const top10File = path.join(root, "jobs", `${jobId}.top10.json`);
  const bytes =
    dirBytes(trialsDir) +
    fileBytes(jobFile) +
    fileBytes(planFile) +
    fileBytes(execFile) +
    fileBytes(genFile) +
    fileBytes(top10File);

  const protectedItems: string[] = [];
  const reasonsKo: string[] = [];
  let classification: DeletionClass = "deletable";

  if (!job) {
    return {
      targetType: "research_job",
      targetId: jobId,
      classification: "protected",
      reasonsKo: ["탐색 작업을 찾을 수 없습니다."],
      researchJobCount: 0,
      trialCount: trials.length,
      top10Count: top10?.entries.length ?? 0,
      registeredStrategyRefs,
      backtestRefs,
      paperRefs,
      liveRefs,
      bytesToRemove: bytes,
      protectedItems: ["missing_job"],
      deletablePaths: [],
    };
  }

  const block = getManualDeleteBlockReason(jobId, options);
  if (block === "active_status" || block === "execution_active") {
    classification = "protected";
    reasonsKo.push("실행 중이거나 일시정지·대기 상태의 작업은 삭제할 수 없습니다.");
    protectedItems.push(`status:${job.status}`);
  } else if (
    registeredStrategyRefs.length > 0 ||
    backtestRefs.length > 0 ||
    paperRefs.length > 0 ||
    liveRefs.length > 0
  ) {
    classification = "archive_only";
    reasonsKo.push(
      "등록 전략 또는 Backtest/Paper/Live 참조가 있어 삭제가 아닌 보관만 가능합니다.",
    );
    protectedItems.push(...registeredStrategyRefs.map((id) => `strategy:${id}`));
  } else if (block) {
    classification = "archive_only";
    reasonsKo.push(manualDeleteBlockMessageKo(block));
    protectedItems.push(block);
  } else {
    reasonsKo.push("참조가 없어 안전하게 삭제할 수 있습니다.");
  }

  const deletablePaths =
    classification === "deletable"
      ? [trialsDir, jobFile, planFile, execFile, genFile, top10File].filter((p) =>
          fs.existsSync(p),
        )
      : [];

  void plan;
  return {
    targetType: "research_job",
    targetId: jobId,
    classification,
    reasonsKo,
    researchJobCount: 1,
    trialCount: trials.length,
    top10Count: top10?.entries.length ?? 0,
    registeredStrategyRefs,
    backtestRefs,
    paperRefs,
    liveRefs,
    bytesToRemove: bytes,
    protectedItems,
    deletablePaths,
  };
}

export function writeDeletionAudit(
  event: Record<string, unknown>,
  options?: StrategySearchStoreOptions,
): void {
  appendAudit(resolveRoot(options), {
    ...event,
    at: new Date().toISOString(),
  });
}

export class ResearchJobDeletionError extends Error {
  readonly code: "protected" | "archive_only" | "not_deletable";
  readonly preview: DeletionImpactPreview;

  constructor(
    code: ResearchJobDeletionError["code"],
    preview: DeletionImpactPreview,
  ) {
    super(preview.reasonsKo[0] ?? "삭제할 수 없습니다.");
    this.name = "ResearchJobDeletionError";
    this.code = code;
    this.preview = preview;
  }
}

/**
 * Atomic delete: re-check impact, delete owned artifacts only, audit.
 * Never removes registered strategies, Backtest/Paper/Live records, or SAFE.
 */
export function executeResearchJobDeletion(
  jobId: string,
  options?: StrategySearchStoreOptions,
): { deleted: true; jobId: string } {
  const preview = previewResearchJobDeletion(jobId, options);
  if (preview.classification === "protected") {
    throw new ResearchJobDeletionError("protected", preview);
  }
  if (preview.classification === "archive_only") {
    throw new ResearchJobDeletionError("archive_only", preview);
  }
  const result = deleteSearchJobIfAllowed(jobId, options);
  writeDeletionAudit(
    {
      action: "delete",
      jobId,
      classification: preview.classification,
      trialCount: preview.trialCount,
      top10Count: preview.top10Count,
      bytesRemoved: preview.bytesToRemove,
      registeredStrategyRefs: preview.registeredStrategyRefs,
      backtestRefs: preview.backtestRefs,
      paperRefs: preview.paperRefs,
      liveRefs: preview.liveRefs,
      protectedItems: preview.protectedItems,
    },
    options,
  );
  return result;
}
