import {
  buildCandidateDetectedMessage,
  buildDailySummaryMessage,
  buildEmergencyStopMessage,
  buildExitFilledMessage,
  buildLiveEntrySuccessMessage,
  buildRiskBlockMessage,
  buildTopCandidateBriefingMessage,
  TELEGRAM_TEST_MESSAGE
} from "./telegram/telegramMessages";

export {
  TELEGRAM_BANNED_LABELS,
  TELEGRAM_TEST_MESSAGE,
  buildApiAuthFailureMessage,
  buildBinanceConnectionFailureMessage,
  buildCancelAllOrdersMessage,
  buildCandidateDetectedMessage,
  buildCandidateRejectedMessage,
  buildCandidateSelectedMessage,
  buildCloseAllPositionsMessage,
  buildCostRejectedMessage,
  buildDailySummaryMessage,
  buildDuplicatePositionBlockedMessage,
  buildEmergencyStopMessage,
  buildEntryConditionFailedMessage,
  buildEntryConditionPassedMessage,
  buildExitFilledMessage,
  buildFundingRejectedMessage,
  buildLiveBotStartedMessage,
  buildLiveBotStoppedMessage,
  buildLiveEntryAttemptMessage,
  buildLiveEntryFailureMessage,
  buildLiveEntrySuccessMessage,
  buildMaxConcurrentPositionsBlockedMessage,
  buildOrderErrorMessage,
  buildPaperBotStartedMessage,
  buildPaperBotStoppedMessage,
  buildPositionClosedAfterTpSlFailureMessage,
  buildRiskBlockMessage,
  buildServerTpSlFailureMessage,
  buildServerTpSlSuccessMessage,
  buildSpreadRejectedMessage,
  buildSystemErrorMessage,
  buildTelegramTestMessage,
  buildTopCandidateBriefingMessage,
  containsBannedTelegramLabel,
  containsTelegramSecret,
  formatTelegramDirection,
  formatTelegramMode,
  formatTelegramTimestamp,
  maskTelegramOrderId,
  translateTelegramErrorReason
} from "./telegram/telegramMessages";

/** @deprecated use buildCandidateDetectedMessage */
export function formatCandidateAlert(symbol: string, direction: string, score: number, mode: "PAPER" | "LIVE" = "PAPER"): string {
  return buildCandidateDetectedMessage({ symbol, direction, score, mode });
}

/** @deprecated use buildLiveEntrySuccessMessage */
export function formatEntryAlert(symbol: string, direction: string, price?: number): string {
  return buildLiveEntrySuccessMessage({
    symbol,
    direction,
    quantity: 0,
    entryPrice: price ?? 0,
    stopLoss: 0,
    takeProfit: 0
  });
}

/** @deprecated use buildExitFilledMessage */
export function formatExitAlert(symbol: string, pnl: number, reason?: string): string {
  return buildExitFilledMessage({ symbol, pnlPct: pnl, reason });
}

/** @deprecated use buildRiskBlockMessage */
export function formatRiskAlert(message: string, _state?: string): string {
  void _state;
  return buildRiskBlockMessage(message);
}

/** @deprecated use buildDailySummaryMessage */
export function formatDailyReport(trades: number, pnl: number, summary?: string): string {
  return buildDailySummaryMessage({ trades, pnlPct: pnl, summary });
}

/** @deprecated use buildTopCandidateBriefingMessage */
export function formatTopCandidateBriefing(symbols: string[]): string {
  return buildTopCandidateBriefingMessage(symbols);
}

/** @deprecated use buildEmergencyStopMessage */
export function formatEmergencyAlert(_action: string, mode: "PAPER" | "LIVE" = "PAPER"): string {
  return buildEmergencyStopMessage(mode);
}
