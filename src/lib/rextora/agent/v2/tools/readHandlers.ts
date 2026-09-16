/**
 * Read-only tool handlers — adapters over existing stores/services.
 */

import {
  getStrategySearchBestApi,
  getStrategySearchJobApi,
  listStrategySearchJobsApi,
} from "@/src/lib/rextora/strategySearch/jobApiService";
import { buildResearchResultsSummary } from "@/src/lib/rextora/strategySearch/researchResultsSummary";
import {
  getStrategyById,
  listStrategies,
} from "@/src/lib/rextora/strategy/strategyStore";
import {
  getSavedBacktest,
  listSavedBacktests,
  listSavedBacktestsForStrategy,
} from "@/src/lib/rextora/backtest/backtestStore";
import {
  getActivePaperSessionService,
  getPaperSessionById,
  listPaperSessionsService,
} from "@/src/lib/rextora/paper/paperSessionService";
import { buildResearchWorkspaceSummary } from "@/src/lib/rextora/agent/researchWorkspace";
import {
  inferLifecycleStage,
  LIFECYCLE_LABEL_KO,
  LIFECYCLE_NEXT_MILESTONE_KO,
} from "@/src/lib/rextora/agent/lifecycleStage";
import { getRextoraSettings } from "@/src/lib/rextora/settings/settingsService";
import { loadSessionRecord } from "../session/sessionPersistence";
import type { ToolContext } from "./toolContext";
import type { FactItem } from "../../types";
import { readTaskLedger } from "../tasks";
import {
  analyzeResearchGaps,
  evidenceFromResearchSummary,
  recommendNextResearch,
  validateResearchRecommendation,
} from "../research";
import { exportVerifiedMemory, searchVerifiedMemory } from "../memory";

export async function handleSearchList(input: Record<string, unknown>) {
  const limit = typeof input.limit === "number" ? input.limit : 50;
  const offset = typeof input.offset === "number" ? input.offset : 0;
  const jobs = listStrategySearchJobsApi({ limit, offset });
  return {
    count: jobs.length,
    jobs: jobs.map((j) => ({
      id: j.id,
      name: j.searchName,
      status: j.status,
      symbol: j.symbols?.[0] ?? null,
      symbols: j.symbols,
      timeframe: j.timeframe,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
    })),
  };
}

export async function handleSearchStatus(input: Record<string, unknown>) {
  const jobId = String(input.jobId ?? "");
  const job = getStrategySearchJobApi(jobId);
  return {
    jobId: job.id,
    status: job.status,
    name: job.searchName,
    symbol: job.symbols?.[0] ?? null,
    symbols: job.symbols,
    timeframe: job.timeframe,
    progressRatio: job.progressRatio ?? null,
    updatedAt: job.updatedAt,
  };
}

export async function handleSearchResult(input: Record<string, unknown>) {
  const jobId = String(input.jobId ?? "");
  const best = getStrategySearchBestApi(jobId);
  const groupAware = best.rankingAuthority === "rankingGroups";
  return {
    jobId,
    rankingAuthority: best.rankingAuthority ?? "legacy_scalar",
    rankingGroups: best.rankingGroups ?? [],
    unknownLegacy: best.unknownLegacy ?? null,
    bestSafeCandidate:
      best.rankingGroups?.find(
        (group) => group.rankingCompatibilityGroup === "safe_execution_price_v1",
      )?.bestPassedCandidate ?? null,
    bestPatternCandidate:
      best.rankingGroups?.find(
        (group) =>
          group.rankingCompatibilityGroup === "event_sequence_ledger_v0",
      )?.bestPassedCandidate ?? null,
    note: groupAware
      ? "SAFE and Pattern scores are not globally comparable. Use rankingGroups."
      : "Legacy scalar best is compatibility-only.",
    bestCandidate: groupAware ? null : (best.bestCandidate ?? null),
    bestPassedCandidate: groupAware ? null : (best.bestPassedCandidate ?? null),
    bestTrial: groupAware ? null : (best.bestTrial ?? null),
    bestPassedTrial: groupAware ? null : (best.bestPassedTrial ?? null),
    gateNotes: best.gateNotes ?? [],
  };
}

export async function handleResultsList(input: Record<string, unknown>) {
  const jobId = String(input.jobId ?? "");
  const summary = buildResearchResultsSummary(jobId);
  return {
    jobId: summary.jobId,
    status: summary.status,
    symbol: summary.symbol,
    timeframe: summary.timeframe,
    counts: summary.counts,
    top10: summary.top10,
    outcome: summary.outcome,
  };
}

export async function handleResultsDetail(input: Record<string, unknown>) {
  const jobId = String(input.jobId ?? "");
  return buildResearchResultsSummary(jobId);
}

export async function handleStrategyList(input: Record<string, unknown>) {
  const limit = typeof input.limit === "number" ? input.limit : 100;
  const strategies = listStrategies().slice(0, limit);
  return {
    count: strategies.length,
    strategies: strategies.map((s) => ({
      id: s.id,
      name: s.name,
      paramsHash: s.paramsHash,
      strategyHash: s.strategyHash,
      locked: s.locked,
      paperActive: s.paperActive,
      liveActive: s.liveActive,
      timeframe: s.timeframe,
    })),
  };
}

export async function handleStrategyDetail(input: Record<string, unknown>) {
  const strategyId = String(input.strategyId ?? "");
  const strategy = getStrategyById(strategyId);
  if (!strategy) {
    throw new Error(`STRATEGY_NOT_FOUND:${strategyId}`);
  }
  return {
    id: strategy.id,
    name: strategy.name,
    paramsHash: strategy.paramsHash,
    strategyHash: strategy.strategyHash,
    locked: strategy.locked,
    paperActive: strategy.paperActive,
    liveActive: strategy.liveActive,
    liveEligible: strategy.liveEligible,
    timeframe: strategy.timeframe,
    symbols: "symbols" in strategy ? (strategy as { symbols?: string[] }).symbols ?? ["BTCUSDT"] : ["BTCUSDT"],
  };
}

export async function handleBacktestList(input: Record<string, unknown>) {
  const limit = typeof input.limit === "number" ? input.limit : 50;
  const strategyId =
    typeof input.strategyId === "string" ? input.strategyId : null;
  const runs = strategyId
    ? listSavedBacktestsForStrategy(strategyId, limit)
    : listSavedBacktests(limit);
  return {
    count: runs.length,
    runs: runs.map((r) => ({
      id: r.id,
      strategyId: r.strategyId ?? r.config?.strategyId ?? null,
      createdAt: r.createdAt,
      status: r.status ?? null,
      strategyHash: r.strategyHash ?? null,
      paramsHash: r.sourceParamsHash ?? null,
    })),
  };
}

export async function handleBacktestDetail(input: Record<string, unknown>) {
  const runId = String(input.runId ?? "");
  const run = getSavedBacktest(runId);
  if (!run) {
    throw new Error(`BACKTEST_NOT_FOUND:${runId}`);
  }
  return {
    id: run.id,
    createdAt: run.createdAt,
    status: run.status ?? null,
    strategyId: run.strategyId ?? run.config?.strategyId ?? null,
    strategyHash: run.strategyHash ?? null,
    paramsHash: run.sourceParamsHash ?? null,
    config: {
      strategyId: run.config?.strategyId,
      symbols: run.config?.symbols,
      timeframe: run.config?.timeframe,
    },
    reportSummary: run.report
      ? {
          totalTrades: run.report.tradeCount ?? null,
          winRate: run.report.winRate ?? null,
          totalReturn: run.report.totalReturn ?? null,
        }
      : null,
  };
}

export async function handlePaperStatus(_input: Record<string, unknown>) {
  const active = getActivePaperSessionService();
  const sessions = listPaperSessionsService();
  return {
    activeSessionId: active?.id ?? active?.sessionId ?? null,
    activeStatus: active?.status ?? null,
    exchangeCalled: active?.exchangeCalled ?? false,
    sessionCount: sessions.length,
  };
}

export async function handlePaperSession(input: Record<string, unknown>) {
  const sessionId =
    typeof input.sessionId === "string" ? input.sessionId : null;
  const session = sessionId
    ? getPaperSessionById(sessionId)
    : getActivePaperSessionService();
  if (!session) {
    return { session: null };
  }
  return {
    session: {
      id: session.id ?? session.sessionId,
      status: session.status,
      strategyId: session.strategyId,
      strategyHash: session.strategyHash,
      paramsHash: session.paramsHash,
      symbol: session.symbol,
      timeframe: session.timeframe,
      exchangeCalled: session.exchangeCalled,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
  };
}

export async function handleWorkspaceCurrent(
  _input: Record<string, unknown>,
  ctx: ToolContext,
) {
  if (ctx.sessionId) {
    try {
      const record = loadSessionRecord(ctx.sessionId);
      if (record) {
        return {
          source: "session",
          sessionId: record.sessionId,
          workspace: record.workspace,
          pendingPlan: record.pendingPlan,
          pendingApproval: record.pendingApproval,
          missionTimeline: record.missionTimeline,
          currentLifecycle: record.currentLifecycle,
        };
      }
    } catch {
      // fall through to research workspace
    }
  }
  const summary = await buildResearchWorkspaceSummary({
    context: ctx.lifecycleContext,
    entities: ctx.entityMemory,
  });
  return { source: "research", workspace: summary };
}

export async function handleLifecycleCurrent(
  _input: Record<string, unknown>,
  ctx: ToolContext,
) {
  const employeeTask = ctx.sessionId
    ? readTaskLedger(ctx.sessionId).tasks.at(-1) ?? null
    : null;
  const summary = await buildResearchWorkspaceSummary({
    context: ctx.lifecycleContext,
    entities: ctx.entityMemory,
  });
  const stage = summary.stage;
  return {
    stage,
    stageLabelKo: LIFECYCLE_LABEL_KO[stage] ?? summary.stageLabelKo,
    nextMilestoneKo:
      LIFECYCLE_NEXT_MILESTONE_KO[stage] ?? summary.nextMilestoneKo,
    pinnedObjective: ctx.entityMemory?.pinnedObjectiveKo ?? null,
    fromEntities: ctx.entityMemory?.pipelineStage ?? null,
    employeeTask: employeeTask
      ? {
          taskId: employeeTask.taskId,
          state: employeeTask.state,
          engineRefs: employeeTask.engineRefs,
          updatedAt: employeeTask.updatedAt,
        }
      : null,
  };
}

export async function handleSettingsCurrent() {
  const settings = getRextoraSettings();
  return {
    version: settings.version,
    updatedAt: settings.updatedAt,
    trading: {
      defaultMode: settings.trading.defaultMode,
      liveTradingEnabled: settings.trading.liveTradingEnabled,
      defaultLeverage: settings.trading.defaultLeverage,
      maxLeverage: settings.trading.maxLeverage,
    },
    ui: settings.ui,
  };
}

export async function handleResearchSummary(
  input: Record<string, unknown>,
  ctx: ToolContext,
) {
  const jobId = typeof input.jobId === "string" ? input.jobId : null;
  if (jobId) {
    const summary = buildResearchResultsSummary(jobId);
    const evidence = evidenceFromResearchSummary(summary);
    const gaps = analyzeResearchGaps(evidence);
    const recommendation = recommendNextResearch(evidence);
    return {
      source: "results",
      summary,
      brain: {
        evidence,
        gaps,
        recommendation,
        validation: validateResearchRecommendation(recommendation, evidence),
      },
    };
  }
  const workspace = await buildResearchWorkspaceSummary({
    context: ctx.lifecycleContext,
    entities: ctx.entityMemory,
  });
  return { source: "workspace", summary: workspace };
}

export async function handleMemoryRecall(
  input: Record<string, unknown>,
  ctx: ToolContext,
) {
  if (!ctx.sessionId) return { entries: [], reasonKo: "연결된 직원 세션이 없습니다." };
  const query = typeof input.query === "string" ? input.query.trim() : "";
  const limit = typeof input.limit === "number" ? input.limit : 10;
  return {
    entries: searchVerifiedMemory(ctx.sessionId, query, limit),
    evidenceRequired: true,
  };
}

export async function handleMemoryExport(
  _input: Record<string, unknown>,
  ctx: ToolContext,
) {
  if (!ctx.sessionId) return { version: 1, sessionId: null, records: [] };
  return exportVerifiedMemory(ctx.sessionId);
}

/** Exported for tests that want to verify lifecycle helper wiring. */
export function inferLifecycleFromFacts(facts: FactItem[]) {
  return inferLifecycleStage(facts);
}
