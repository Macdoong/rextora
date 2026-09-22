import { BACKTEST_SNAPSHOT_WARNING, backtestValidationSeed, dashboardDataSeed } from "./seedData";
import { getStrategyById } from "./strategyRepository";
import { isRetiredSafeId, NO_SELECTED_STRATEGY } from "./strategy/retiredSafeBaseline";

export function getBacktestValidation(strategyId?: string) {
  if (!strategyId || isRetiredSafeId(strategyId)) {
    throw new Error(NO_SELECTED_STRATEGY);
  }
  const strategy = getStrategyById(strategyId);
  if (!strategy) throw new Error(NO_SELECTED_STRATEGY);
  return strategy.validation;
}

export function getCostStressResults(strategyId?: string) {
  return getBacktestValidation(strategyId).costStress;
}

export function getJitterResults(strategyId?: string) {
  return getBacktestValidation(strategyId).jitter;
}

export function getPeriodSplitResults(strategyId?: string) {
  const validation = getBacktestValidation(strategyId);
  return {
    recent_3m: validation.recent3m,
    prev_3m: validation.prev3m,
    full_10m: validation.full10m,
    data_source: validation.dataSource
  };
}

export function getEquityCurve() {
  return dashboardDataSeed.equityCurve;
}

export async function runBacktest(strategyId?: string) {
  if (!strategyId || isRetiredSafeId(strategyId)) {
    return {
      ok: false,
      mode: "BACKTEST" as const,
      serviceState: "simulated" as const,
      message: NO_SELECTED_STRATEGY,
    };
  }
  const strategy = getStrategyById(strategyId);
  if (!strategy) {
    return {
      ok: false,
      mode: "BACKTEST" as const,
      serviceState: "simulated" as const,
      message: NO_SELECTED_STRATEGY,
    };
  }

  return {
    ok: true,
    mode: "BACKTEST" as const,
    serviceState: "simulated" as const,
    message: BACKTEST_SNAPSHOT_WARNING,
    data_source: backtestValidationSeed.dataSource,
    strategy,
    validation: strategy.validation,
  };
}
