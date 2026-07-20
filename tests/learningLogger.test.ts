import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
  appendLearningEntry,
  buildCandidateLogDedupeKey,
  getCoinWinRates,
  getLearningLogs,
  getOperatorLearningLogs,
  getLearningLogViewModel,
  getUserFacingLearningLogs,
  isLearningCandidateLog,
  isLearningReflectionLog,
  isLearningSystemLog,
  isLearningTradeLog,
  logCandidateSnapshot,
  logLearningReflection,
  logSystemEvent,
  logTradeOutcome,
  resetCandidateLogDedupeForTests,
  shouldDisplayDebugCandidateLog,
  shouldDisplayOperatorLog,
  shouldStoreCandidateLearningLog
} from "../src/lib/rextora/learningLogger";
import { loadLearningProfile, resetLearningProfileForTests } from "../src/lib/rextora/learningStore";
import { resetTradeLogsForTests } from "../src/lib/rextora/storage/tradeStore";
import { aiCandidatesSeed, learningLogsSeed } from "../src/lib/rextora/seedData";

describe("learningLogger semantics", () => {
  beforeEach(() => {
    resetLearningProfileForTests();
    resetTradeLogsForTests(learningLogsSeed);
    resetCandidateLogDedupeForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T00:00:00Z"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("logs candidate snapshots as pending, not success", () => {
    const item = logCandidateSnapshot({
      ...aiCandidatesSeed[0],
      status: "진입 가능",
      blockReason: undefined
    });
    expect(item).not.toBeNull();
    expect(item?.result).toBe("대기");
    expect(item?.pnlPct).toBeNull();
    expect(item?.exitReason).toBe("");
    expect(item?.eventCategory).toBe("후보 기록");
    expect(isLearningCandidateLog(item!)).toBe(true);
    expect(isLearningTradeLog(item!)).toBe(false);
  });

  it("does not count candidate-only logs in win rates", () => {
    logCandidateSnapshot({
      ...aiCandidatesSeed[0],
      symbol: "WINRATE_TEST_USDT",
      status: "진입 가능"
    });
    appendLearningEntry({
      symbol: "WINRATE_TEST_USDT",
      direction: "롱",
      entryReason: "돌파 신호",
      exitReason: "익절",
      result: "성공",
      pnlPct: 1.2,
      signalType: "breakout",
      mode: "PAPER",
      eventCategory: "거래 기록"
    });

    const rates = getCoinWinRates().find((row) => row.symbol === "WINRATE_TEST_USDT");
    expect(rates?.trades).toBe(1);
    expect(rates?.winRate).toBe(100);
  });

  it("candidate logs do not update learning profile stats", () => {
    const before = loadLearningProfile().global.trades;
    logCandidateSnapshot({
      ...aiCandidatesSeed[0],
      status: "진입 가능"
    });
    expect(loadLearningProfile().global.trades).toBe(before);
  });

  it("filters test symbols from user-facing logs in production mode", () => {
    appendLearningEntry({
      symbol: "TESTUSDT",
      direction: "롱",
      entryReason: "breakout",
      exitReason: "",
      result: "대기",
      pnlPct: null,
      signalType: "breakout",
      eventCategory: "후보 기록",
      candidateStatus: "대기"
    });
    appendLearningEntry({
      symbol: "BTCUSDT",
      direction: "롱",
      entryReason: "breakout",
      exitReason: "take_profit",
      result: "성공",
      pnlPct: 1.1,
      signalType: "breakout",
      eventCategory: "거래 기록"
    });

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("REXTORA_SHOW_TEST_DATA", "");
    const logs = getUserFacingLearningLogs();
    expect(logs.some((log) => log.symbol === "TESTUSDT")).toBe(false);
    expect(logs.some((log) => log.symbol === "WINRATE_TEST_USDT")).toBe(false);
    expect(logs.some((log) => log.symbol === "BTCUSDT")).toBe(true);
  });

  it("separates candidate, trade, and reflection categories", () => {
    logCandidateSnapshot({ ...aiCandidatesSeed[0], status: "진입 가능" });
    appendLearningEntry({
      symbol: "ETHUSDT",
      direction: "롱",
      entryReason: "breakout",
      exitReason: "take_profit",
      result: "성공",
      pnlPct: 0.8,
      signalType: "breakout",
      eventCategory: "거래 기록"
    });
    logLearningReflection({
      symbol: "ETHUSDT",
      direction: "롱",
      summary: "학습 보정 반영",
      scoreDelta: 1.2,
      reason: "승률 상승"
    });

    const logs = getUserFacingLearningLogs();
    expect(logs.some(isLearningCandidateLog)).toBe(true);
    expect(logs.some(isLearningTradeLog)).toBe(true);
    expect(logs.some(isLearningReflectionLog)).toBe(true);
  });

  it("stores duplicate candidate learning logs only once within 10 minutes", () => {
    const before = getLearningLogs().filter(isLearningCandidateLog).length;
    const first = logCandidateSnapshot({
      ...aiCandidatesSeed[0],
      symbol: "SOLUSDT",
      status: "진입 가능"
    }, { candidateStatus: "제외", holdReason: "비용 초과", mode: "PAPER" });
    const second = logCandidateSnapshot({
      ...aiCandidatesSeed[0],
      symbol: "SOLUSDT",
      status: "진입 가능"
    }, { candidateStatus: "제외", holdReason: "비용 초과", mode: "PAPER" });

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(getLearningLogs().filter(isLearningCandidateLog).length).toBe(before + 1);
  });

  it("allows candidate learning log again after TTL", () => {
    const input = {
      ...aiCandidatesSeed[0],
      symbol: "ETHUSDT",
      status: "진입 가능" as const
    };
    expect(logCandidateSnapshot(input, { candidateStatus: "대기", holdReason: "큐 대기", mode: "PAPER" })).not.toBeNull();
    expect(logCandidateSnapshot(input, { candidateStatus: "대기", holdReason: "큐 대기", mode: "PAPER" })).toBeNull();

    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(logCandidateSnapshot(input, { candidateStatus: "대기", holdReason: "큐 대기", mode: "PAPER" })).not.toBeNull();
  });

  it("always stores trade and learning reflection records", () => {
    const before = getLearningLogs().length;
    const tradeA = logTradeOutcome({
      symbol: "BTCUSDT",
      direction: "롱",
      entryReason: "돌파 신호",
      exitReason: "take_profit",
      pnlPct: 1.2,
      signalType: "breakout",
      leverage: 2
    });
    const tradeB = logTradeOutcome({
      symbol: "BTCUSDT",
      direction: "롱",
      entryReason: "돌파 신호",
      exitReason: "take_profit",
      pnlPct: 1.2,
      signalType: "breakout",
      leverage: 2
    });
    const reflectionA = logLearningReflection({
      symbol: "BTCUSDT",
      direction: "롱",
      summary: "학습 보정 반영",
      scoreDelta: 1,
      reason: "승률 상승"
    });
    const reflectionB = logLearningReflection({
      symbol: "BTCUSDT",
      direction: "롱",
      summary: "학습 보정 반영",
      scoreDelta: 1,
      reason: "승률 상승"
    });

    expect(tradeA.eventCategory).toBe("거래 기록");
    expect(tradeB.eventCategory).toBe("거래 기록");
    expect(reflectionA.eventCategory).toBe("학습 반영");
    expect(reflectionB.eventCategory).toBe("학습 반영");
    expect(getLearningLogs().length).toBe(before + 4);
  });

  it("hides candidate logs from operator view unless debug flag is enabled", () => {
    const candidate = logCandidateSnapshot({ ...aiCandidatesSeed[0], status: "진입 가능" });
    expect(candidate).not.toBeNull();

    vi.stubEnv("REXTORA_SHOW_DEBUG_CANDIDATES", "");
    const operatorLogs = getOperatorLearningLogs();
    expect(operatorLogs.some(isLearningCandidateLog)).toBe(false);
    expect(shouldDisplayOperatorLog(candidate!)).toBe(false);
    expect(shouldDisplayDebugCandidateLog(candidate!)).toBe(false);

    vi.stubEnv("REXTORA_SHOW_DEBUG_CANDIDATES", "true");
    const debugLogs = getOperatorLearningLogs();
    expect(debugLogs.some(isLearningCandidateLog)).toBe(true);
    expect(shouldDisplayDebugCandidateLog(candidate!)).toBe(true);
  });

  it("records system events and shows them to operators", () => {
    const event = logSystemEvent({ eventType: "긴급 중지", message: "리스크 한도 위반", mode: "PAPER" });
    expect(event.eventCategory).toBe("시스템 이벤트");
    expect(isLearningSystemLog(event)).toBe(true);
    expect(shouldDisplayOperatorLog(event)).toBe(true);

    vi.stubEnv("REXTORA_SHOW_DEBUG_CANDIDATES", "");
    const viewModel = getLearningLogViewModel();
    expect(viewModel.showDebugCandidates).toBe(false);
    expect(viewModel.logs.some(isLearningSystemLog)).toBe(true);
    expect(viewModel.logs.some(isLearningCandidateLog)).toBe(false);
  });

  it("trade records update learning-facing stats while candidates do not", () => {
    const before = getCoinWinRates().find((row) => row.symbol === "ADAUSDT");
    expect(before).toBeUndefined();

    logCandidateSnapshot({ ...aiCandidatesSeed[0], symbol: "ADAUSDT", status: "진입 가능" });
    expect(getCoinWinRates().find((row) => row.symbol === "ADAUSDT")).toBeUndefined();

    logTradeOutcome({
      symbol: "ADAUSDT",
      direction: "롱",
      entryReason: "돌파 신호",
      exitReason: "익절",
      pnlPct: 0.9,
      signalType: "breakout",
      entryPrice: 1.0,
      exitPrice: 1.009
    });
    const after = getCoinWinRates().find((row) => row.symbol === "ADAUSDT");
    expect(after?.trades).toBe(1);
    expect(after?.winRate).toBe(100);
  });

  it("builds candidate dedupe key and helper", () => {
    const key = buildCandidateLogDedupeKey({
      symbol: "SOLUSDT",
      signalType: "breakout",
      candidateStatus: "제외",
      holdReason: "비용 초과",
      mode: "PAPER"
    });
    expect(key).toBe("SOLUSDT|breakout|제외|비용 초과|PAPER");
    expect(
      shouldStoreCandidateLearningLog({
        symbol: "SOLUSDT",
        signalType: "breakout",
        candidateStatus: "제외",
        holdReason: "비용 초과",
        mode: "PAPER"
      })
    ).toBe(true);
    expect(
      shouldStoreCandidateLearningLog({
        symbol: "SOLUSDT",
        signalType: "breakout",
        candidateStatus: "제외",
        holdReason: "비용 초과",
        mode: "PAPER"
      })
    ).toBe(false);
  });
});
