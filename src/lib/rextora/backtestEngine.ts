import { BACKTEST_SNAPSHOT_WARNING, backtestValidationSeed, dashboardDataSeed } from "./seedData";
import { getStrategyById, getPreservedSafeStrategy } from "./strategyRepository";

export function getBacktestValidation(strategyId = "SAFE_v44_i4060") {
  return (getStrategyById(strategyId) ?? getPreservedSafeStrategy()).validation;
}

export function getCostStressResults(strategyId = "SAFE_v44_i4060") {
  return getBacktestValidation(strategyId).costStress;
}

export function getJitterResults(strategyId = "SAFE_v44_i4060") {
  return getBacktestValidation(strategyId).jitter;
}

export function getPeriodSplitResults(strategyId = "SAFE_v44_i4060") {
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

export async function runBacktest(strategyId = "SAFE_v44_i4060") {
  const strategy = getStrategyById(strategyId) ?? getPreservedSafeStrategy();

  return {
    ok: true,
    mode: "BACKTEST" as const,
    serviceState: "simulated" as const,
    message: BACKTEST_SNAPSHOT_WARNING,
    data_source: backtestValidationSeed.dataSource,
    strategy,
    validation: strategy.validation,
    equityCurve: getEquityCurve()
  };
}
