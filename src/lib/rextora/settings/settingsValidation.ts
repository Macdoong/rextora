import { hasBinanceCredentials } from "../env";
import type { RextoraSettings, SettingsValidationError, SettingsValidationResult } from "./settingsTypes";

const MIN_SCAN_INTERVAL_MS = 5_000;

function push(errors: SettingsValidationError[], field: string, message: string): void {
  errors.push({ field, message });
}

function isLiveAllowed(settings: RextoraSettings): boolean {
  return settings.trading.allowLiveTrading || settings.trading.liveTradingEnabled;
}

export function validateSettings(settings: RextoraSettings): SettingsValidationResult {
  const errors: SettingsValidationError[] = [];
  const { trading, market, signal, cost, risk, execution, tpSl } = settings;

  if (trading.defaultLeverage <= 0) push(errors, "trading.defaultLeverage", "기본 레버리지는 0보다 커야 합니다.");
  if (trading.maxLeverage <= 0) push(errors, "trading.maxLeverage", "최대 레버리지는 0보다 커야 합니다.");
  if (trading.defaultLeverage > trading.maxLeverage) {
    push(errors, "trading.defaultLeverage", "기본 레버리지는 최대 레버리지를 초과할 수 없습니다.");
  }

  if (market.scanIntervalMs < MIN_SCAN_INTERVAL_MS) {
    push(errors, "market.scanIntervalMs", `스캔 간격은 최소 ${MIN_SCAN_INTERVAL_MS}ms 이상이어야 합니다.`);
  }
  if (market.watchedSymbolCount < 1 || market.watchedSymbolCount > 50) {
    push(errors, "market.watchedSymbolCount", "감시 코인 수는 1~50 사이여야 합니다.");
  }

  if (signal.rsiPeriod < 2) push(errors, "signal.rsiPeriod", "RSI 기간이 너무 짧습니다.");
  if (signal.emaFast >= signal.emaSlow) push(errors, "signal.emaFast", "빠른 EMA는 느린 EMA보다 작아야 합니다.");

  if (cost.minExpectedEdgePct <= 0) push(errors, "cost.minExpectedEdgePct", "최소 기대 엣지는 0보다 커야 합니다.");
  if (cost.safetyMarginPct < 0) push(errors, "cost.safetyMarginPct", "안전마진은 음수일 수 없습니다.");

  if (risk.maxDailyLossPct >= 0) push(errors, "risk.maxDailyLossPct", "일 손실 한도는 음수여야 합니다.");
  if (risk.maxTotalLossPct >= 0) push(errors, "risk.maxTotalLossPct", "총 손실 한도는 음수여야 합니다.");
  if (risk.maxPositions < 1) push(errors, "risk.maxPositions", "최대 포지션 수는 1 이상이어야 합니다.");

  if (execution.fixedOrderUsdt <= 0) push(errors, "execution.fixedOrderUsdt", "고정 주문 USDT는 0보다 커야 합니다.");
  if (execution.balancePositionPct <= 0 || execution.balancePositionPct > risk.maxPositionSizePct) {
    push(errors, "execution.balancePositionPct", "잔고 비율이 허용 범위를 벗어났습니다.");
  }
  if (execution.maxConcurrentPositions < 1) {
    push(errors, "execution.maxConcurrentPositions", "최대 동시 포지션 수는 1 이상이어야 합니다.");
  }

  if (tpSl.takeProfitPct <= 0) push(errors, "tpSl.takeProfitPct", "익절 비율은 0보다 커야 합니다.");
  if (tpSl.stopLossPct <= 0) push(errors, "tpSl.stopLossPct", "손절 비율은 0보다 커야 합니다.");

  if (isLiveAllowed(settings) && !hasBinanceCredentials()) {
    push(errors, "trading.allowLiveTrading", "LIVE 허용 시 Binance API 자격증명이 필요합니다.");
  }

  return { ok: errors.length === 0, errors };
}

export function sanitizeSettingsInput(partial: Partial<RextoraSettings>, base: RextoraSettings): RextoraSettings {
  const merged = {
    ...base,
    ...partial,
    trading: { ...base.trading, ...partial.trading },
    market: { ...base.market, ...partial.market },
    signal: { ...base.signal, ...partial.signal },
    cost: { ...base.cost, ...partial.cost },
    risk: { ...base.risk, ...partial.risk },
    execution: { ...base.execution, ...partial.execution },
    learning: { ...base.learning, ...partial.learning },
    tpSl: { ...base.tpSl, ...partial.tpSl },
    telegram: { ...base.telegram, ...partial.telegram },
    ui: { ...base.ui, ...partial.ui },
    version: base.version,
    updatedAt: new Date().toISOString()
  };

  if (merged.trading.allowLiveTrading !== merged.trading.liveTradingEnabled) {
    if (partial.trading?.allowLiveTrading !== undefined) {
      merged.trading.liveTradingEnabled = merged.trading.allowLiveTrading;
    } else if (partial.trading?.liveTradingEnabled !== undefined) {
      merged.trading.allowLiveTrading = merged.trading.liveTradingEnabled;
    }
  }

  if (merged.tpSl.closePositionIfTpSlFails !== merged.tpSl.fallbackCloseIfTpSlFails) {
    merged.tpSl.fallbackCloseIfTpSlFails = merged.tpSl.closePositionIfTpSlFails;
  }

  return merged;
}
