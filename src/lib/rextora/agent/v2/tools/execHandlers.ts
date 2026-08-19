/**
 * Write tool handlers — thin adapters over existing APIs only.
 * Never Live, never exchange, never SAFE mutation.
 */

import {
  cancelStrategySearchJobApi,
  createStrategySearchJobApi,
  getStrategySearchJobApi,
  pauseStrategySearchJobApi,
  resumeStrategySearchJobApi,
  startStrategySearchJobApi,
} from "@/src/lib/rextora/strategySearch/jobApiService";
import {
  promoteTopResearchResults,
  registerTrialForBacktest,
} from "@/src/lib/rextora/strategySearch/researchResultsSummary";
import { runAndSaveBacktest } from "@/src/lib/rextora/backtest/backtestRunner";
import type { BacktestConfig } from "@/src/lib/rextora/backtest/backtestTypes";
import {
  approveAndStartPaperSession,
  pausePaperSessionService,
  preparePaperFromResults,
  resumePaperSessionService,
  stopPaperSessionService,
} from "@/src/lib/rextora/paper/paperSessionService";
import {
  getStrategyById,
  updateStrategyDisplayMeta,
} from "@/src/lib/rextora/strategy/strategyStore";
import {
  applyLibraryArchiveTag,
  descriptionHasLibraryArchive,
} from "@/src/lib/rextora/strategy/libraryArchive";
import {
  deleteStrategyWithSafety,
  previewStrategyDeletion,
} from "@/src/lib/rextora/strategySearch/strategyDeletionSafety";
import type { ToolContext } from "./toolContext";
import { rebuildMemoryIndex, resetVerifiedMemory } from "../memory";
import { buildNewSearchPlan } from "../reasoning/toolPlanBuilder";

const PATTERN_ALIASES: Record<string, string> = {
  fair_value_gap: "fvg",
  fvg: "fvg",
  order_block: "order_block",
  orderblock: "order_block",
  support_resistance: "support_resistance",
  trendline: "trendline",
  liquidity: "liquidity",
  structure: "structure",
  demand: "demand",
  supply: "supply",
};

function isCanonicalSearchCreateBody(
  body: Record<string, unknown>,
): boolean {
  return (
    typeof body.searchVersion === "string" &&
    typeof body.strategyTemplateId === "string" &&
    Array.isArray(body.symbols) &&
    body.symbols.length > 0 &&
    typeof body.dataVersion === "string" &&
    typeof body.seed === "number" &&
    body.passPolicy != null &&
    typeof body.passPolicy === "object" &&
    body.jitterConfig != null &&
    typeof body.jitterConfig === "object" &&
    body.operatorPlan != null &&
    typeof body.operatorPlan === "object"
  );
}

/** Expand provider shorthand createBody into the canonical job API payload. */
export function normalizeSearchCreateBody(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  if (isCanonicalSearchCreateBody(raw)) return raw;
  const symbol =
    typeof raw.symbol === "string" && raw.symbol.trim()
      ? raw.symbol.trim()
      : Array.isArray(raw.symbols) && typeof raw.symbols[0] === "string"
        ? raw.symbols[0]
        : "BTCUSDT";
  const timeframe =
    typeof raw.timeframe === "string" && raw.timeframe.trim()
      ? raw.timeframe.trim()
      : "15m";
  const patterns = Array.isArray(raw.patterns)
    ? raw.patterns
        .filter((p): p is string => typeof p === "string")
        .map((p) => PATTERN_ALIASES[p] ?? PATTERN_ALIASES[p.toLowerCase()] ?? p)
    : undefined;
  const { draft } = buildNewSearchPlan({
    symbol,
    timeframe,
    patternSpaceIds: patterns && patterns.length > 0 ? patterns : undefined,
  });
  return draft.createBody as Record<string, unknown>;
}

export async function handleMemoryReset(
  _input: Record<string, unknown>,
  ctx: ToolContext,
) {
  if (!ctx.sessionId) throw new Error("MEMORY_SESSION_REQUIRED");
  const removedFiles = resetVerifiedMemory(ctx.sessionId);
  const index = rebuildMemoryIndex(ctx.sessionId);
  return { reset: true, removedFiles, remainingRecords: index.entries.length };
}

export async function handleSearchCreate(input: Record<string, unknown>) {
  const rawBody = (input.createBody ?? input) as Record<string, unknown>;
  const createBody = normalizeSearchCreateBody(rawBody);
  try {
    const job = createStrategySearchJobApi(createBody);
    return {
      jobId: job.id,
      status: job.status,
      name: job.searchName,
      symbol: job.symbols?.[0] ?? null,
      symbols: job.symbols,
      timeframe: job.timeframe,
    };
  } catch (err) {
    // Preserve validation details in the tool-error message so audits and
    // operator evidence can identify the exact createBody defect.
    const details =
      err &&
      typeof err === "object" &&
      "details" in err &&
      Array.isArray((err as { details?: unknown }).details)
        ? (err as { details: string[] }).details.filter(
            (d): d is string => typeof d === "string" && d.trim().length > 0,
          )
        : [];
    if (err instanceof Error && details.length > 0) {
      throw new Error(`${err.message}: ${details.join("; ")}`);
    }
    throw err;
  }
}

export async function handleSearchStart(input: Record<string, unknown>) {
  const jobId = String(input.jobId ?? "");
  const current = getStrategySearchJobApi(jobId);
  const started = current.status === "paused"
    ? resumeStrategySearchJobApi(jobId)
    : startStrategySearchJobApi(jobId);
  return {
    jobId: started.id,
    status: started.status,
    name: started.searchName,
  };
}

export async function handleSearchPause(input: Record<string, unknown>) {
  const jobId = String(input.jobId ?? "");
  const paused = pauseStrategySearchJobApi(jobId);
  return {
    jobId: paused.id,
    status: paused.status,
  };
}

export async function handleSearchCancel(input: Record<string, unknown>) {
  const jobId = String(input.jobId ?? "");
  const cancelled = cancelStrategySearchJobApi(jobId);
  return {
    jobId: cancelled.id,
    status: cancelled.status,
  };
}

export async function handleBacktestRun(input: Record<string, unknown>) {
  const strategyId = String(input.strategyId ?? "");
  const strategy = getStrategyById(strategyId);
  if (!strategy) {
    throw new Error(`STRATEGY_NOT_FOUND:${strategyId}`);
  }

  const symbol =
    typeof input.symbol === "string"
      ? input.symbol
      : "BTCUSDT";
  const timeframe =
    typeof input.timeframe === "string"
      ? input.timeframe
      : strategy.timeframe ?? "15m";

  const config: BacktestConfig = {
    strategyId,
    symbols: [symbol],
    timeframe,
    fromOpenTime:
      typeof input.fromOpenTime === "number" ? input.fromOpenTime : undefined,
    toOpenTime:
      typeof input.toOpenTime === "number" ? input.toOpenTime : undefined,
    balance: typeof input.balance === "number" ? input.balance : 10_000,
    feeRate: typeof input.feeRate === "number" ? input.feeRate : 0.0004,
    slippageRate:
      typeof input.slippageRate === "number" ? input.slippageRate : 0.0002,
    fundingRate: 0.0001,
    applyFunding: false,
    applySpread: false,
    spreadRate: 0.0001,
    costStressMultipliers: [1, 1.5, 2],
    costGuardK: 3,
    dataMode: "binance",
  };

  const result = await runAndSaveBacktest(config);
  return {
    runId: result.saved?.id ?? null,
    strategyId,
    symbol,
    timeframe,
    status: result.saved?.status ?? "completed",
    exchangeCalled: false,
  };
}

export async function handlePaperPrepare(input: Record<string, unknown>) {
  const strategyId = String(input.strategyId ?? "");
  const prepared = preparePaperFromResults({
    strategyId,
    backtestRunId:
      typeof input.backtestRunId === "string" ? input.backtestRunId : null,
    backtestResultId:
      typeof input.backtestResultId === "string"
        ? input.backtestResultId
        : null,
    symbol: typeof input.symbol === "string" ? input.symbol : null,
    timeframe:
      typeof input.timeframe === "string" ? input.timeframe : null,
    sourceResearchJobId:
      typeof input.sourceResearchJobId === "string"
        ? input.sourceResearchJobId
        : null,
    sourceTrialIteration:
      typeof input.sourceTrialIteration === "number"
        ? input.sourceTrialIteration
        : null,
  });

  return {
    strategyId: prepared.strategy.id,
    sessionId: prepared.session.id ?? prepared.session.sessionId,
    status: prepared.session.status,
    exchangeCalled: prepared.session.exchangeCalled ?? false,
    paperApprovalDeepLink: prepared.paperApprovalDeepLink,
    executorStarted: false,
  };
}

function paperControlInput(input: Record<string, unknown>) {
  return {
    sessionId: String(input.sessionId ?? ""),
    strategyId: typeof input.strategyId === "string" ? input.strategyId : undefined,
    idempotencyKey: String(input.idempotencyKey ?? ""),
  };
}

function paperResult(session: Awaited<ReturnType<typeof approveAndStartPaperSession>>) {
  return {
    sessionId: session.id,
    strategyId: session.strategyId,
    status: session.status,
    exchangeCalled: session.exchangeCalled ?? false,
  };
}

export async function handlePaperApproveStart(input: Record<string, unknown>) {
  const session = await approveAndStartPaperSession(paperControlInput(input), {
    manageExecutor: process.env.NODE_ENV !== "test",
  });
  return paperResult(session);
}

export async function handlePaperPause(input: Record<string, unknown>) {
  const session = await pausePaperSessionService(paperControlInput(input), {
    manageExecutor: process.env.NODE_ENV !== "test",
  });
  return paperResult(session);
}

export async function handlePaperResume(input: Record<string, unknown>) {
  const session = await resumePaperSessionService(paperControlInput(input), {
    manageExecutor: process.env.NODE_ENV !== "test",
  });
  return paperResult(session);
}

export async function handlePaperStop(input: Record<string, unknown>) {
  const session = await stopPaperSessionService({
    ...paperControlInput(input),
    stopReason: typeof input.stopReason === "string" ? input.stopReason : "agent_operator_stop",
  }, { manageExecutor: process.env.NODE_ENV !== "test" });
  return paperResult(session);
}

function editableStrategy(strategyId: string) {
  const strategy = getStrategyById(strategyId);
  if (!strategy) throw new Error(`STRATEGY_NOT_FOUND:${strategyId}`);
  if (strategy.locked) throw new Error("PROTECTED_STRATEGY");
  return strategy;
}

export async function handleStrategyRename(input: Record<string, unknown>) {
  const strategyId = String(input.strategyId ?? "");
  const name = String(input.name ?? "").trim();
  if (!name) throw new Error("STRATEGY_NAME_REQUIRED");
  editableStrategy(strategyId);
  const strategy = updateStrategyDisplayMeta(strategyId, { name });
  return { strategyId, name: strategy.name, paramsHash: strategy.paramsHash, status: "renamed" };
}

export async function handleStrategyArchive(input: Record<string, unknown>) {
  const strategyId = String(input.strategyId ?? "");
  const current = editableStrategy(strategyId);
  const strategy = descriptionHasLibraryArchive(current.description)
    ? current
    : updateStrategyDisplayMeta(strategyId, {
        description: applyLibraryArchiveTag(current.description, true),
      });
  return { strategyId, archived: true, paramsHash: strategy.paramsHash, status: "archived" };
}

export async function handleStrategyRestore(input: Record<string, unknown>) {
  const strategyId = String(input.strategyId ?? "");
  const current = editableStrategy(strategyId);
  const strategy = descriptionHasLibraryArchive(current.description)
    ? updateStrategyDisplayMeta(strategyId, {
        description: applyLibraryArchiveTag(current.description, false),
      })
    : current;
  return { strategyId, archived: false, paramsHash: strategy.paramsHash, status: "restored" };
}

export async function handleStrategyDelete(input: Record<string, unknown>) {
  const strategyId = String(input.strategyId ?? "");
  const impact = previewStrategyDeletion(strategyId);
  const detachRefsFirst = input.detachRefsFirst === true;
  if (impact.classification === "absolute_protect" || impact.classification === "archive_only") {
    throw new Error(`STRATEGY_DELETE_BLOCKED:${impact.reasonsKo.join(" ")}`);
  }
  if (impact.classification === "detach_then_delete" && !detachRefsFirst) {
    throw new Error(`STRATEGY_DEPENDENCIES_REQUIRE_DETACH:${impact.protectedItems.join(",")}`);
  }
  const deleted = deleteStrategyWithSafety(strategyId, { detachRefsFirst });
  return { ...deleted, status: "deleted", dependencyClassification: impact.classification };
}

export async function handleResultsPromote(input: Record<string, unknown>) {
  const jobId = String(input.jobId ?? "");
  const mode = input.mode === "top" ? "top" : "single";

  if (mode === "top") {
    const limit = typeof input.limit === "number" ? input.limit : 10;
    const promoted = promoteTopResearchResults(jobId, { limit });
    return {
      mode,
      jobId,
      promotedCount: promoted.promoted.length,
      promoted: promoted.promoted.map((p) => ({
        strategyId: p.strategyId,
        strategyName: p.strategyName,
        paramsHash: p.paramsHash,
        strategyHash: p.strategyHash,
        alreadyExists: p.alreadyExists,
      })),
    };
  }

  const iteration =
    typeof input.iteration === "number" ? input.iteration : undefined;
  if (iteration === undefined) {
    throw new Error("ITERATION_REQUIRED");
  }
  const registered = registerTrialForBacktest(jobId, iteration);
  return {
    mode,
    jobId,
    iteration,
    strategyId: registered.result.strategyId,
    strategyName: registered.result.strategyName,
    paramsHash: registered.result.paramsHash,
    strategyHash: registered.result.strategyHash,
    backtestHref: registered.backtestHref,
    alreadyExists: registered.result.alreadyExists,
  };
}
