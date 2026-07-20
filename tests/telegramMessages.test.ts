import { describe, expect, it } from "vitest";
import {
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
  buildLearningSummaryMessage,
  buildLearningAdjustmentMessage,
  buildLearningBadPatternMessage,
  buildLearningLeverageAdjustedMessage,
  buildExecutionQueueCreatedMessage,
  buildQueueCandidateExcludedMessage,
  buildMultiCandidatePartialFailureMessage,
  containsBannedTelegramLabel,
  containsTelegramSecret
} from "../src/lib/rextora/telegram/telegramMessages";

const BUILDERS: Array<{ name: string; build: () => string }> = [
  { name: "buildPaperBotStartedMessage", build: () => buildPaperBotStartedMessage() },
  { name: "buildPaperBotStoppedMessage", build: () => buildPaperBotStoppedMessage() },
  { name: "buildLiveBotStartedMessage", build: () => buildLiveBotStartedMessage() },
  { name: "buildLiveBotStoppedMessage", build: () => buildLiveBotStoppedMessage() },
  {
    name: "buildCandidateDetectedMessage",
    build: () => buildCandidateDetectedMessage({ symbol: "SOLUSDT", direction: "롱", score: 88.2 })
  },
  {
    name: "buildCandidateSelectedMessage",
    build: () => buildCandidateSelectedMessage({ symbol: "SOLUSDT", direction: "롱", score: 88.2 })
  },
  {
    name: "buildCandidateRejectedMessage",
    build: () => buildCandidateRejectedMessage({ symbol: "SOLUSDT", direction: "롱", reason: "비용 조건 미통과" })
  },
  {
    name: "buildEntryConditionPassedMessage",
    build: () => buildEntryConditionPassedMessage({ symbol: "SOLUSDT", direction: "롱" })
  },
  {
    name: "buildEntryConditionFailedMessage",
    build: () => buildEntryConditionFailedMessage({ symbol: "SOLUSDT", reason: "스프레드 초과" })
  },
  {
    name: "buildLiveEntryAttemptMessage",
    build: () => buildLiveEntryAttemptMessage({ symbol: "SOLUSDT", direction: "롱", score: 90 })
  },
  {
    name: "buildLiveEntrySuccessMessage",
    build: () =>
      buildLiveEntrySuccessMessage({
        symbol: "SOLUSDT",
        direction: "롱",
        leverage: 2,
        quantity: 1.25,
        entryPrice: 180.12,
        stopLoss: 177.5,
        takeProfit: 185.4
      })
  },
  {
    name: "buildLiveEntryFailureMessage",
    build: () => buildLiveEntryFailureMessage({ symbol: "SOLUSDT", reason: "주문 거절" })
  },
  {
    name: "buildServerTpSlSuccessMessage",
    build: () =>
      buildServerTpSlSuccessMessage({
        symbol: "SOLUSDT",
        side: "LONG",
        entryPrice: 180.12,
        quantity: 1.25,
        tpPrice: 185.4,
        slPrice: 177.5,
        tpOrderId: 123456789,
        slOrderId: 987654321
      })
  },
  {
    name: "buildServerTpSlFailureMessage",
    build: () => buildServerTpSlFailureMessage({ symbol: "SOLUSDT", reason: "익절 주문 등록 실패" })
  },
  {
    name: "buildPositionClosedAfterTpSlFailureMessage",
    build: () => buildPositionClosedAfterTpSlFailureMessage({ symbol: "SOLUSDT", reason: "손절 주문 등록 실패" })
  },
  { name: "buildEmergencyStopMessage", build: () => buildEmergencyStopMessage("LIVE") },
  { name: "buildCloseAllPositionsMessage", build: () => buildCloseAllPositionsMessage("LIVE") },
  { name: "buildCancelAllOrdersMessage", build: () => buildCancelAllOrdersMessage("LIVE") },
  { name: "buildBinanceConnectionFailureMessage", build: () => buildBinanceConnectionFailureMessage("연결 시간 초과") },
  { name: "buildApiAuthFailureMessage", build: () => buildApiAuthFailureMessage("-2015") },
  { name: "buildOrderErrorMessage", build: () => buildOrderErrorMessage({ symbol: "SOLUSDT", reason: "주문 거절" }) },
  { name: "buildDuplicatePositionBlockedMessage", build: () => buildDuplicatePositionBlockedMessage("SOLUSDT") },
  { name: "buildMaxConcurrentPositionsBlockedMessage", build: () => buildMaxConcurrentPositionsBlockedMessage(2) },
  { name: "buildCostRejectedMessage", build: () => buildCostRejectedMessage({ symbol: "SOLUSDT" }) },
  {
    name: "buildSpreadRejectedMessage",
    build: () => buildSpreadRejectedMessage({ symbol: "SOLUSDT", spreadPct: 0.12, limitPct: 0.08 })
  },
  {
    name: "buildFundingRejectedMessage",
    build: () => buildFundingRejectedMessage({ symbol: "SOLUSDT", fundingPct: 0.05, limitPct: 0.02 })
  },
  { name: "buildDailySummaryMessage", build: () => buildDailySummaryMessage({ trades: 3, pnlPct: 1.2 }) },
  { name: "buildSystemErrorMessage", build: () => buildSystemErrorMessage("내부 처리 오류") },
  { name: "buildTelegramTestMessage", build: () => buildTelegramTestMessage() },
  { name: "buildExitFilledMessage", build: () => buildExitFilledMessage({ symbol: "SOLUSDT", pnlPct: 1.5 }) },
  { name: "buildRiskBlockMessage", build: () => buildRiskBlockMessage("최대 손실 한도 도달") }
];

describe("telegramMessages", () => {
  for (const { name, build } of BUILDERS) {
    it(`${name} returns Korean text without banned labels`, () => {
      const text = build();
      expect(text.length).toBeGreaterThan(0);
      expect(text).toMatch(/[가-힣]/);
      expect(containsBannedTelegramLabel(text)).toBeNull();
      expect(containsTelegramSecret(text)).toBe(false);
    });
  }

  it("trade success message includes symbol, side, entry, stop loss, take profit", () => {
    const text = buildLiveEntrySuccessMessage({
      symbol: "SOLUSDT",
      direction: "롱",
      quantity: 2,
      entryPrice: 180,
      stopLoss: 175,
      takeProfit: 190
    });
    expect(text).toContain("SOLUSDT");
    expect(text).toContain("롱");
    expect(text).toContain("진입가");
    expect(text).toContain("손절가");
    expect(text).toContain("익절가");
  });

  it("TP/SL failure message includes immediate close action", () => {
    const text = buildServerTpSlFailureMessage({ symbol: "SOLUSDT", reason: "등록 실패" });
    expect(text).toContain("서버 손절/익절 등록 실패");
    expect(text).toContain("포지션 즉시 청산");
  });

  it("API error message may include code with Korean explanation", () => {
    const text = buildApiAuthFailureMessage("-2015");
    expect(text).toContain("-2015");
    expect(text).toContain("API 인증 실패");
  });

  it("test message uses Korean copy", () => {
    expect(TELEGRAM_TEST_MESSAGE).toContain("[렉스토라 테스트]");
    expect(TELEGRAM_TEST_MESSAGE).toContain("텔레그램 알림 연결이 정상입니다");
    expect(containsBannedTelegramLabel(TELEGRAM_TEST_MESSAGE)).toBeNull();
  });

  it("documents banned labels for verification", () => {
    expect(TELEGRAM_BANNED_LABELS).toContain("PAPER");
    expect(TELEGRAM_BANNED_LABELS).toContain("Server TP/SL");
  });

  it("learning summary message is Korean", () => {
    const text = buildLearningSummaryMessage({
      trades: 5,
      winRate: 60,
      tpRate: 40,
      slRate: 20,
      consecutiveLosses: 1,
      status: "학습 보정 활성"
    });
    expect(text).toContain("[렉스토라 학습 알림]");
    expect(text).toContain("학습 요약");
    expect(containsBannedTelegramLabel(text)).toBeNull();
  });

  it("learning adjustment message is Korean", () => {
    const text = buildLearningAdjustmentMessage({
      symbol: "SOLUSDT",
      side: "롱",
      scoreDelta: -3,
      leverage: 2,
      reason: "최근 동일 패턴 손실이 많아 보수적으로 조정했습니다."
    });
    expect(text).toContain("학습 보정 반영");
    expect(text).toContain("점수 보정: -3");
    expect(text).toContain("레버리지 조정: 2배");
  });

  it("learning bad pattern message is Korean", () => {
    const text = buildLearningBadPatternMessage({
      symbol: "SOLUSDT",
      side: "롱",
      reason: "반복 손실 패턴"
    });
    expect(text).toContain("나쁜 패턴 제외");
  });

  it("learning leverage adjusted message is Korean", () => {
    const text = buildLearningLeverageAdjustedMessage({
      symbol: "ETHUSDT",
      side: "숏",
      leverage: 1,
      reason: "변동성 높음"
    });
    expect(text).toContain("레버리지 자동 조정");
  });

  it("execution queue created message is Korean", () => {
    const text = buildExecutionQueueCreatedMessage({ received: 5, queued: 2, skipped: 3, mode: "PAPER" });
    expect(text).toContain("실행 큐 생성");
    expect(text).toContain("모의 거래");
    expect(containsBannedTelegramLabel(text)).toBeNull();
  });

  it("queue candidate excluded message is Korean", () => {
    const text = buildQueueCandidateExcludedMessage({ symbol: "BTCUSDT", direction: "롱", reason: "비용 조건 미통과" });
    expect(text).toContain("후보 제외");
    expect(containsBannedTelegramLabel(text)).toBeNull();
  });

  it("multi candidate partial failure message is Korean", () => {
    const text = buildMultiCandidatePartialFailureMessage({ succeeded: 1, failed: 1, total: 2 });
    expect(text).toContain("다중 후보 일부 실패");
    expect(containsBannedTelegramLabel(text)).toBeNull();
  });
});
