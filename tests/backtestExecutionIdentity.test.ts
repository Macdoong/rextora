import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  backtestResultHash,
  getSavedBacktest,
  listSavedBacktestsForStrategy,
  saveBacktestResult,
} from "../src/lib/rextora/backtest/backtestStore";
import {
  CHART_EVIDENCE_SCHEMA_VERSION,
  loadChartEvidence,
  resolveChartEvidence,
  saveChartEvidence,
} from "../src/lib/rextora/backtest/chartEvidenceStore";
import {
  formatSavedRunOptionLabel,
  backtestStatusLabelKo,
} from "../src/lib/rextora/backtest/savedRunLabels";
import {
  EQUITY_BASIS,
  EQUITY_BASIS_HELP_KO,
  EQUITY_BASIS_TITLE_KO,
} from "../src/lib/rextora/backtest/equityBasis";
import type {
  BacktestConfig,
  BacktestReport,
  BacktestTrade,
  SavedBacktestResult,
} from "../src/lib/rextora/backtest/backtestTypes";

const ROOT = path.resolve(__dirname, "..");

function stubReport(
  strategyId: string,
  from: string,
  to: string,
  ret: number,
  mdd = -0.05,
): BacktestReport {
  return {
    strategyId,
    strategyHash: "dbd658af74bc",
    strategyName: "test",
    symbol: "BTCUSDT",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    fromDate: from,
    toDate: to,
    requestedFrom: null,
    requestedTo: null,
    actualFirstCandleTime: null,
    actualLastCandleTime: null,
    candleCount: 100,
    processedCandleCount: 100,
    dataSource: "binance",
    totalReturn: ret,
    mdd,
    tradeCount: 12,
    winRate: 0.5,
    averageTrade: 0.01,
    profitFactor: 1.17,
    maxConsecutiveLosses: 2,
    feeImpact: 0,
    feeTotal: 0,
    slippageTotal: 0,
    fundingTotal: 0,
    spreadTotal: 0,
    costs: {
      fees: 0,
      slippage: 0,
      funding: 0,
      spread: 0,
      totalTradingCost: 10,
      totalCostUsdt: 10,
      grossPnLBeforeCosts: 100,
      netPnLAfterCosts: 90,
    },
    monthlyReturns: [],
    negativeMonths: 0,
    startingBalance: 10_000,
    endingBalance: 10_000 * (1 + ret),
    validation: {
      paramsHashVerified: true,
      feesApplied: true,
      slippageApplied: true,
      fundingApplied: true,
      spreadApplied: true,
      noRealOrders: true,
    },
  };
}

function baseConfig(): BacktestConfig {
  return {
    strategyId: "custom_mrxjff7z",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    fromOpenTime: Date.parse("2026-01-25T00:00:00.000Z"),
    toOpenTime: Date.parse("2026-07-24T00:00:00.000Z"),
    balance: 10_000,
    feeRate: 0.0004,
    slippageRate: 0.0002,
    fundingRate: 0.0001,
    applyFunding: false,
    applySpread: false,
    spreadRate: 0.0001,
    costStressMultipliers: [1],
    costGuardK: 3,
  };
}

describe("backtest execution identity and UX polish", () => {
  let prevCwd: string;
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-bt-exec-"));
    prevCwd = process.cwd();
    process.chdir(tmp);
    fs.mkdirSync(path.join(tmp, "data", "rextora", "backtests"), {
      recursive: true,
    });
  });

  afterEach(() => {
    process.chdir(prevCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("creates unique backtestRunId for identical executions while sharing resultHash", () => {
    const config = baseConfig();
    const report = stubReport("custom_mrxjff7z", "2026-01-25", "2026-07-24", 0.0258, -0.5967);
    const trades: BacktestTrade[] = [];
    const a = saveBacktestResult({
      config,
      report,
      trades,
      sourceType: "user_backtest_run",
      strategyId: "custom_mrxjff7z",
      strategyHash: "dbd658af74bc",
      requestedAt: "2026-07-24T01:00:00.000Z",
      startedAt: "2026-07-24T01:00:01.000Z",
      completedAt: "2026-07-24T01:00:02.000Z",
      hasChartEvidence: true,
    });
    // Own chart sidecar for A
    saveChartEvidence({
      runId: a.id,
      symbol: "BTCUSDT",
      timeframe: "15m",
      dataVersion: "binance",
      actualFirstCandleTime: null,
      actualLastCandleTime: null,
      processedCandleCount: 2,
      candles: [
        { openTime: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 },
        { openTime: 2, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      ] as never,
      equityCurve: [10000, 10258],
      chartSamplingApplied: false,
    });

    const b = saveBacktestResult({
      config,
      report,
      trades,
      sourceType: "user_backtest_run",
      strategyId: "custom_mrxjff7z",
      strategyHash: "dbd658af74bc",
      requestedAt: "2026-07-24T02:00:00.000Z",
      startedAt: "2026-07-24T02:00:01.000Z",
      completedAt: "2026-07-24T02:00:02.000Z",
      hasChartEvidence: true,
    });

    expect(a.id).not.toBe(b.id);
    expect(a.backtestRunId).not.toBe(b.backtestRunId);
    expect(a.resultHash).toBe(b.resultHash);
    expect(a.resultHash).toBe(backtestResultHash(a));
    expect(b.deduplicatedResult).toBe(true);
    expect(b.reusedResultFromRunId).toBe(a.id);
    expect(b.chartEvidenceRef).toBe(a.id);
    expect(a.requestedAt).not.toBe(b.requestedAt);
    expect(a.completedAt).not.toBe(b.completedAt);

    const listed = listSavedBacktestsForStrategy("custom_mrxjff7z");
    expect(listed.map((r) => r.id).sort()).toEqual([a.id, b.id].sort());

    const resolved = resolveChartEvidence({
      runId: b.id,
      chartEvidenceRef: b.chartEvidenceRef,
    });
    expect(resolved?.runId).toBe(a.id);
    expect(resolved?.equityBasis).toBe(EQUITY_BASIS);
    expect(resolved?.schemaVersion).toBe(CHART_EVIDENCE_SCHEMA_VERSION);
    expect(process.cwd()).not.toBe(ROOT);
  });

  it("keeps legacy combined run/result records readable", () => {
    const legacy: SavedBacktestResult = {
      id: "bt_legacy_abc",
      createdAt: "2026-07-01T00:00:00.000Z",
      config: baseConfig(),
      report: stubReport("custom_mrxjff7z", "2026-01-01", "2026-02-01", 0.1),
      trades: [],
    };
    fs.writeFileSync(
      path.join(tmp, "data", "rextora", "backtests", "bt_legacy_abc.json"),
      JSON.stringify(legacy, null, 2),
      "utf8",
    );
    fs.writeFileSync(
      path.join(tmp, "data", "rextora", "backtests", "index.json"),
      JSON.stringify([
        {
          id: "bt_legacy_abc",
          strategyId: "custom_mrxjff7z",
          createdAt: legacy.createdAt,
          totalReturn: 0.1,
          mdd: -0.05,
        },
      ]),
      "utf8",
    );
    const loaded = getSavedBacktest("bt_legacy_abc");
    expect(loaded?.id).toBe("bt_legacy_abc");
    expect(loaded?.report.totalReturn).toBe(0.1);
    expect(loadChartEvidence("bt_legacy_abc")).toBeNull();
  });

  it("formats compact localized saved-run labels without raw ISO primary text", () => {
    const peers = [
      {
        id: "a",
        createdAt: "2026-07-24T05:25:00.000Z",
        status: "completed" as const,
        report: {
          symbol: "BTCUSDT",
          fromDate: "2026-01-25",
          toDate: "2026-07-24",
        },
      },
      {
        id: "b",
        createdAt: "2026-07-24T06:40:00.000Z",
        status: "completed" as const,
        report: {
          symbol: "BTCUSDT",
          fromDate: "2026-01-25",
          toDate: "2026-07-24",
        },
      },
    ];
    const labelA = formatSavedRunOptionLabel(peers[0]!, peers);
    const labelSolo = formatSavedRunOptionLabel(peers[0]!, [peers[0]!]);
    expect(labelSolo).toBe("BTCUSDT · 2026-01-25 ~ 2026-07-24 · 완료");
    expect(labelA).toMatch(/BTCUSDT · 2026-01-25 ~ 2026-07-24 · \d{2}:\d{2}/);
    expect(labelA).not.toContain("T05:25");
    expect(labelA).not.toContain("bt_");
    expect(backtestStatusLabelKo("failed")).toBe("실패");
    expect(backtestStatusLabelKo("running")).toBe("실행 중");
  });

  it("documents trade-exit equity basis and never fabricates candle MTM", () => {
    expect(EQUITY_BASIS).toBe("trade_exit_realized");
    expect(EQUITY_BASIS_TITLE_KO).toBe("실현 자산곡선");
    expect(EQUITY_BASIS_HELP_KO).toContain("청산 시점");
    const engine = fs.readFileSync(
      path.join(ROOT, "src/lib/rextora/backtest/backtestEngine.ts"),
      "utf8",
    );
    // Equity is pushed at trade close, not every candle iteration unconditionally
    expect(engine).toContain("equityCurve.push(equity)");
    expect(engine).not.toMatch(/markToMarket|mtmEquity|candleEquity/i);
  });
});

describe("backtest polish UI source contracts", () => {
  const wb = () =>
    fs.readFileSync(
      path.join(ROOT, "components/rextora/backtest/BacktestReviewWorkbench.tsx"),
      "utf8",
    );
  const av = () =>
    fs.readFileSync(
      path.join(ROOT, "components/rextora/charts/BacktestAnalysisView.tsx"),
      "utf8",
    );

  it("uses beginner-friendly completion messaging and reuse note", () => {
    const src = wb();
    expect(src).toContain("백테스트가 완료되고 저장되었습니다.");
    expect(src).toContain("백테스트 실행 중입니다.");
    expect(src).toContain("백테스트를 준비하고 있습니다.");
    expect(src).toContain("백테스트 실행에 실패했습니다.");
    expect(src).toContain("동일한 조건의 기존 계산 결과를 사용했습니다.");
    expect(src).toContain("이번 실행 기록은 새로 저장되었습니다.");
    expect(src).toContain("formatSavedRunOptionLabel");
  });

  it("shows shared Paper/Live block once when codes match", () => {
    const src = wb();
    expect(src).toContain("승격 불가");
    expect(src).toContain("sharedPromotionBlock");
    expect(src).toContain("모의매매 등록 불가");
    expect(src).toContain("실전 후보 등록 불가");
    expect(src).toContain("backtest-paper-block-reason");
    expect(src).toContain("backtest-live-block-reason");
  });

  it("defaults Key Performance to six primary metrics with collapsed extras", () => {
    const src = av();
    expect(src).toContain('data-testid="backtest-primary-metrics"');
    expect(src).toContain('data-testid="backtest-extra-metrics"');
    expect(src).toContain("extraMetricsOpen");
    expect(src).toContain('label: "순수익률"');
    expect(src).toContain('label: "최대 낙폭"');
    expect(src).toContain('label: "순손익"');
    expect(src).toContain('label: "거래 수"');
    expect(src).toContain('label: "승률"');
    expect(src).toContain('label: "총거래비용"');
    expect(src).toContain("추가 성과 지표");
    expect(src).toContain("summary-mdd-warning");
    expect(src).toContain("summary-cost-warning");
  });

  it("sticky nav order and viewport observer are present", () => {
    const src = wb();
    const nav = src.slice(
      src.indexOf("workbenchSections"),
      src.indexOf("scrollWorkbenchSection"),
    );
    expect(nav.indexOf('"실행"')).toBeLessThan(nav.indexOf('"판정"'));
    expect(nav.indexOf('"판정"')).toBeLessThan(nav.indexOf('"차트"'));
    expect(nav.indexOf('"차트"')).toBeLessThan(nav.indexOf('"거래 목록"'));
    expect(nav.indexOf('"월별"')).toBeGreaterThan(0);
    expect(src).toContain("IntersectionObserver");
    expect(src).toContain("activeNavSection");
    expect(src).toContain("bt-force-expand");
    expect(src).toContain("backtest-nav-scroll-spacer");
    expect(src).toContain("navClickLocked");
    expect(src).toContain("scrollBottomGap");
  });

  it("overlay controls keep three groups with accessible disabled reasons", () => {
    const src = av();
    expect(src).toContain("기본 표시");
    expect(src).toContain("기술 패턴");
    expect(src).toContain("이벤트");
    expect(src).toContain("pattern-group-status");
    expect(src).toContain("aria-describedby");
    expect(src).toContain("EQUITY_BASIS_TITLE_KO");
    expect(src).toContain("equity-basis-note");
  });
});
