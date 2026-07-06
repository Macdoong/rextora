import { REXTORA_DISCLAIMER, aiBriefingSeed } from "./seedData";
import type { AiBriefing, AlertHistoryItem } from "./types";

export function generateAiBriefing(alert?: AlertHistoryItem): AiBriefing {
  if (!alert) return aiBriefingSeed;

  return {
    asset: alert.asset,
    timeframe: "1H",
    detectedCondition: alert.type,
    currentPrice: aiBriefingSeed.currentPrice,
    volumeContext: "mock 알림 조건 기반 거래량 컨텍스트",
    indicatorContext: alert.message,
    riskLevel: alert.riskLevel,
    explanation: "알림 조건을 요약한 mock AI 브리핑입니다. 실거래 판단이나 투자 조언으로 사용하지 않습니다.",
    disclaimer: REXTORA_DISCLAIMER,
    serviceState: "mock"
  };
}
