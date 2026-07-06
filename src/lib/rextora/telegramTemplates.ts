export function formatCandidateAlert(symbol: string, direction: string, score: number): string {
  return `[Rextora] 진입 후보\n코인: ${symbol}\n방향: ${direction}\nAI 점수: ${score}\n※ PAPER 모드 기준 알림입니다.`;
}

export function formatEntryAlert(symbol: string, mode: string, price?: number): string {
  return `[Rextora] ${mode} 진입\n코인: ${symbol}${price ? `\n가격: ${price}` : ""}\n실제 LIVE 주문은 전송되지 않습니다.`;
}

export function formatExitAlert(symbol: string, pnl: number, reason?: string): string {
  return `[Rextora] 청산 알림\n코인: ${symbol}\n손익: ${pnl}%\n사유: ${reason ?? "청산"}\n투자 조언이 아닙니다.`;
}

export function formatRiskAlert(message: string, state?: string): string {
  return `[Rextora] ⚠️ 위험 알림\n상태: ${state ?? "주의"}\n${message}`;
}

export function formatDailyReport(trades: number, pnl: number): string {
  return `[Rextora] 일일 리포트\n거래: ${trades}건\n손익: ${pnl}%\n투자 조언이 아닙니다.`;
}

export function formatTopCandidateBriefing(symbols: string[]): string {
  return `[Rextora] TOP 후보\n${symbols.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
}

export function formatEmergencyAlert(action: string): string {
  return `[Rextora] 🚨 긴급 알림\n${action}\n즉시 확인이 필요합니다.`;
}

export const TELEGRAM_TEST_MESSAGE =
  "Rextora Telegram test message. This is only a connectivity test. No trading action was executed.";
