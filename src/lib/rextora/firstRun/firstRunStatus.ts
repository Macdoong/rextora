/**
 * First-run readiness classification.
 * Aggregates multiple stores — never infers from a single file.
 */

import fs from "node:fs";
import path from "node:path";
import { rextoraDataRoot } from "../storage/runtimePaths";
import { listSearchJobs } from "../strategySearch/jobStore";
import { getSearchPlan } from "../strategySearch/searchPlan";
import {
  ensureStrategyStore,
  listStrategies,
} from "../strategy/strategyStore";
import { isRetiredSafeId } from "../strategy/retiredSafeBaseline";
import { listSavedBacktests } from "../backtest/backtestStore";
import { listPaperSessions } from "../paper/paperSessionStore";
import {
  DEMO_JOB_ID,
  isDemoBacktestRecord,
  isDemoJobId,
  isDemoSearchName,
  isDemoStrategyRecord,
} from "./demoIdentity";
import { loadFirstRunState } from "./firstRunStateStore";

export type FirstRunMode =
  | "EMPTY"
  | "DEMO_AVAILABLE"
  | "DEMO_ACTIVE"
  | "REAL_DATA_PRESENT"
  | "MIXED"
  | "SETUP_COMPLETE";

export interface FirstRunStatus {
  mode: FirstRunMode;
  runtimeRootExists: boolean;
  hasRealSearchJobs: boolean;
  hasDemoSearchJobs: boolean;
  hasRealStrategies: boolean;
  hasDemoStrategies: boolean;
  hasRealBacktests: boolean;
  hasDemoBacktests: boolean;
  hasPaperSessions: boolean;
  demoInitialized: boolean;
  setupDismissed: boolean;
  setupCompleted: boolean;
  demoJobId: string | null;
  demoStrategyId: string | null;
  demoRunId: string | null;
  counts: {
    searchJobs: number;
    strategies: number;
    backtests: number;
    paperSessions: number;
  };
  /** Relative labels only — never absolute private paths. */
  recommendedAction:
    | "show_onboarding"
    | "continue_demo"
    | "continue_research"
    | "none";
  messagesKo: string[];
}

function dirExists(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function getFirstRunStatus(): FirstRunStateResult {
  return classifyFirstRunStatus();
}

export type FirstRunStateResult = FirstRunStatus;

export function classifyFirstRunStatus(): FirstRunStatus {
  const state = loadFirstRunState();
  const root = rextoraDataRoot();
  const runtimeRootExists =
    dirExists(root) ||
    dirExists(path.join(root, "strategy-search")) ||
    dirExists(path.join(root, "strategies")) ||
    dirExists(path.join(root, "backtests"));

  let jobs: ReturnType<typeof listSearchJobs> = [];
  try {
    jobs = listSearchJobs();
  } catch {
    jobs = [];
  }

  let strategies: ReturnType<typeof listStrategies> = [];
  try {
    ensureStrategyStore();
    strategies = listStrategies();
  } catch {
    strategies = [];
  }

  let backtests: ReturnType<typeof listSavedBacktests> = [];
  try {
    backtests = listSavedBacktests(100);
  } catch {
    backtests = [];
  }

  let paperSessions: ReturnType<typeof listPaperSessions> = [];
  try {
    paperSessions = listPaperSessions();
  } catch {
    paperSessions = [];
  }

  const demoJobs = jobs.filter((j) => {
    if (isDemoJobId(j.id)) return true;
    const plan = getSearchPlan(j.id);
    return isDemoSearchName(plan?.searchName ?? j.config.strategyTemplateId);
  });
  const realJobs = jobs.filter((j) => !demoJobs.some((d) => d.id === j.id));

  const demoStrategies = strategies.filter((s) =>
    isDemoStrategyRecord(s),
  );
  const realStrategies = strategies.filter(
    (s) =>
      !isDemoStrategyRecord(s) &&
      !isRetiredSafeId(s.id) &&
      !isRetiredSafeId(String(s.name)),
  );

  const demoBacktests = backtests.filter((b) => isDemoBacktestRecord(b));
  const realBacktests = backtests.filter((b) => !isDemoBacktestRecord(b));

  const hasDemo =
    demoJobs.length > 0 ||
    demoStrategies.length > 0 ||
    demoBacktests.length > 0 ||
    Boolean(state.demoInitializedAt);
  const hasReal =
    realJobs.length > 0 ||
    realStrategies.length > 0 ||
    realBacktests.length > 0 ||
    paperSessions.length > 0;

  const setupDismissed = Boolean(state.setupDismissedAt);
  const setupCompleted = Boolean(state.setupCompletedAt);
  const demoInitialized = Boolean(state.demoInitializedAt) || hasDemo;

  let mode: FirstRunMode;
  if (setupCompleted && hasReal && !hasDemo) {
    mode = "SETUP_COMPLETE";
  } else if (hasDemo && hasReal) {
    mode = "MIXED";
  } else if (hasDemo && !hasReal) {
    mode = "DEMO_ACTIVE";
  } else if (hasReal && !hasDemo) {
    mode = "REAL_DATA_PRESENT";
  } else if (!hasDemo && !hasReal) {
    mode = setupDismissed ? "DEMO_AVAILABLE" : "EMPTY";
  } else {
    mode = "EMPTY";
  }

  // Prefer persisted demo pointers when present
  const demoJobId =
    state.demoJobId ??
    demoJobs[0]?.id ??
    (hasDemo ? DEMO_JOB_ID : null);
  const demoStrategyId =
    state.demoStrategyId ?? demoStrategies[0]?.id ?? null;
  const demoRunId = state.demoRunId ?? demoBacktests[0]?.id ?? null;

  let recommendedAction: FirstRunStatus["recommendedAction"] = "none";
  if (mode === "EMPTY" || mode === "DEMO_AVAILABLE") {
    recommendedAction = "show_onboarding";
  } else if (mode === "DEMO_ACTIVE") {
    recommendedAction = "continue_demo";
  } else if (mode === "REAL_DATA_PRESENT" || mode === "MIXED" || mode === "SETUP_COMPLETE") {
    recommendedAction = "continue_research";
  }

  const messagesKo: string[] = [];
  if (mode === "EMPTY" || mode === "DEMO_AVAILABLE") {
    messagesKo.push(
      "런타임 연구 데이터가 비어 있습니다. 데모로 둘러보거나 실제 전략 탐색을 시작하세요.",
    );
  }
  if (mode === "DEMO_ACTIVE") {
    messagesKo.push(
      "데모 데이터가 활성화되어 있습니다. 데모는 예시이며 실전 증거나 실전 주문이 아닙니다.",
    );
  }
  if (mode === "MIXED") {
    messagesKo.push(
      "데모 데이터와 실제 연구 데이터가 함께 있습니다. 데모 배지를 확인하세요.",
    );
  }

  return {
    mode,
    runtimeRootExists,
    hasRealSearchJobs: realJobs.length > 0,
    hasDemoSearchJobs: demoJobs.length > 0,
    hasRealStrategies: realStrategies.length > 0,
    hasDemoStrategies: demoStrategies.length > 0,
    hasRealBacktests: realBacktests.length > 0,
    hasDemoBacktests: demoBacktests.length > 0,
    hasPaperSessions: paperSessions.length > 0,
    demoInitialized,
    setupDismissed,
    setupCompleted,
    demoJobId,
    demoStrategyId,
    demoRunId,
    counts: {
      searchJobs: jobs.length,
      strategies: strategies.length,
      backtests: backtests.length,
      paperSessions: paperSessions.length,
    },
    recommendedAction,
    messagesKo,
  };
}
