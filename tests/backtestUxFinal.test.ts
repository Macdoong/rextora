import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  CHART_EVIDENCE_SCHEMA_VERSION,
  computeDrawdownCurve,
  saveChartEvidence,
  loadChartEvidence,
  chartEvidencePath,
} from "../src/lib/rextora/backtest/chartEvidenceStore";
import {
  ACCOUNT_EQUITY_IMPACT_LABEL_KO,
  LEVERAGED_POSITION_PNL_LABEL_KO,
  MAX_TRADE_LOSS_LABEL_KO,
  computeMaxTradeLossStats,
} from "../src/lib/rextora/backtest/tradeLossSemantics";
import { classifyPatternOverlays } from "../src/lib/rextora/backtest/patternOverlayAvailability";
import { computeCostRatios } from "../src/lib/rextora/backtest/costRatios";

const ROOT = path.resolve(__dirname, "..");

describe("backtest UX final completion", () => {
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

  it("decision summary appears before next actions", () => {
    const src = wb();
    const d = src.indexOf('data-testid="backtest-decision-summary"');
    const a = src.indexOf('data-testid="backtest-review-actions"');
    expect(d).toBeGreaterThan(0);
    expect(a).toBeGreaterThan(d);
  });

  it("decision summary omits full metric duplication set", () => {
    const src = wb();
    const block = src.slice(
      src.indexOf('data-testid="backtest-decision-summary"'),
      src.indexOf('data-testid="backtest-review-actions"'),
    );
    expect(block).toContain("최종 판정");
    expect(block).toContain("부적격 이유");
    expect(block).toContain("다음 권장 행동");
    expect(block).not.toContain('label="승률"');
    expect(block).not.toContain('label="손익비"');
    expect(block).not.toContain('label="순수익률"');
  });

  it("disabled Paper/Live reasons are prominent panels", () => {
    const src = wb();
    expect(src).toContain("모의매매 등록 불가");
    expect(src).toContain("실전 후보 등록 불가");
    expect(src).toContain("승격 불가");
    expect(src).toContain("border-2 border-rose-500/60");
    expect(src).toContain("backtest-handoff-block-reason");
  });

  it("uses beginner-friendly Korean labels", () => {
    const src = wb() + av();
    expect(src).toContain("저장된 백테스트");
    expect(src).toContain("실행 ID");
    expect(src).toContain("실행 방식");
    expect(src).toContain("백테스트 엔진 버전");
    expect(src).toContain("거래 수 신뢰도");
    expect(src).toContain("차트 근거 데이터");
    expect(MAX_TRADE_LOSS_LABEL_KO).toBe("최대 단일 거래 손실");
    expect(LEVERAGED_POSITION_PNL_LABEL_KO).toContain("레버리지");
    expect(ACCOUNT_EQUITY_IMPACT_LABEL_KO).toBe("계좌 자산 영향");
  });

  it("overlay controls are grouped Basic / Pattern / Event", () => {
    const src = av();
    expect(src).toContain("기본 표시");
    expect(src).toContain("기술 패턴");
    expect(src).toContain("이벤트");
    expect(src).toContain("재접촉");
    expect(src).toContain("무효화");
  });

  it("unsupported overlays stay disabled without fake geometry", () => {
    const rows = classifyPatternOverlays({
      strategyType: "safe_params",
      traces: [],
    });
    expect(rows.every((r) => r.status === "strategy_unused")).toBe(true);
    expect(rows.every((r) => r.defaultOn === false)).toBe(true);
    expect(rows.find((r) => r.kind === "order_block")?.reasonKo).toContain(
      "오더블럭",
    );
  });

  it("trade list is immediately below the price chart", () => {
    const src = av();
    const price = src.indexOf('id="price"');
    const trades = src.indexOf('id="trades"');
    const monthly = src.indexOf('id="monthly"');
    expect(price).toBeGreaterThan(0);
    expect(trades).toBeGreaterThan(price);
    expect(monthly).toBeGreaterThan(trades);
  });

  it("chart↔trade navigation status messages and selectTrade sources exist", () => {
    const src = av();
    expect(src).toContain('selectTrade(id, "chart")');
    expect(src).toContain('selectTrade(t.id, "list")');
    expect(src).toContain("차트에서 선택한 거래");
    expect(src).toContain("구간을 차트에 표시했습니다");
    expect(src).toContain("chart-trade-link-status");
  });

  it("trade list is compact preview by default and keeps selected trade", () => {
    const src = av();
    expect(src).toContain("TRADE_PREVIEW_SIZE");
    expect(src).toContain("tradeListExpanded");
    expect(src).toContain("전체 ");
    expect(src).toContain("거래 보기");
    expect(src).toContain("worstLossTrade");
  });

  it("advanced analysis and validation details collapse by default", () => {
    const src = av();
    expect(src).toContain("useState(false)");
    expect(src).toContain("advancedExpanded");
    expect(src).toContain("validationDetailsOpen");
    expect(src).toContain("상세 분석 펼치기");
    expect(src).toContain("상세 검증 보기");
  });

  it("critical warnings remain outside collapsed advanced content", () => {
    const src = av() + wb();
    expect(src).toContain("cost-critical-warning");
    expect(src).toContain("거래비용이 총수익의");
    expect(src).toContain("backtest-handoff-block-reason");
  });

  it("validation summary shows pass/fail/warning counts", () => {
    const src = av();
    expect(src).toContain("validation-summary");
    expect(src).toContain("통과 {counts.pass}");
    expect(src).toContain("주요 실패");
  });

  it("empty sections use compact one-line states", () => {
    const src = av();
    expect(src).toContain("이 실행에는 자산곡선 데이터가 없습니다.");
    expect(src).toContain("거부된 셋업 없음");
  });

  it("max loss and account equity impact are separate", () => {
    const stats = computeMaxTradeLossStats(
      [
        { pnlPct: -1.7446, netPnlUsdt: -5682, leverage: 13.54 },
        { pnlPct: 0.2, netPnlUsdt: 100, leverage: 10 },
      ],
      10000,
    );
    expect(stats.labelKo).toBe("최대 단일 거래 손실");
    expect(stats.leveragedPnlPct).toBeCloseTo(-1.7446, 4);
    expect(stats.accountEquityImpactPct).toBeCloseTo(-0.5682, 4);
    expect(av()).toContain("LEVERAGED_POSITION_PNL_LABEL_KO");
    expect(av()).toContain("ACCOUNT_EQUITY_IMPACT_LABEL_KO");
  });

  it("simplified cost warning arithmetic stays consistent", () => {
    const r = computeCostRatios({
      grossPnLBeforeCosts: 1006.04,
      netPnLAfterCosts: 257.73,
      totalCostUsdt: 748.31,
      feeCostUsdt: 704.66,
      slippageCostUsdt: 43.65,
    });
    expect(r.identityHolds).toBe(true);
    expect(r.totalCostPctOfGrossProfit).toBeCloseTo(0.744, 2);
    expect(av()).toContain("수익 대부분이 수수료와 슬리피지로 줄어들었습니다");
  });

  it("sticky section navigation order matches hierarchy", () => {
    const src = wb();
    const order = [
      "실행",
      "판정",
      "차트",
      "거래 목록",
      "월별",
      "비용",
      "자산·낙폭",
      "타임라인",
      "상세 분석",
      "검증",
    ];
    let prev = -1;
    for (const label of order) {
      const i = src.indexOf(`label: "${label}"`);
      expect(i).toBeGreaterThan(prev);
      prev = i;
    }
  });
});

describe("chart evidence persistence", () => {
  let tmpRoot = "";
  let prevCwd = "";

  beforeEach(() => {
    prevCwd = process.cwd();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-chart-ev-"));
    fs.mkdirSync(path.join(tmpRoot, "data", "rextora", "backtests"), {
      recursive: true,
    });
    process.chdir(tmpRoot);
  });

  afterEach(() => {
    process.chdir(prevCwd);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("persists candles, equity, drawdown with schema version", () => {
    const equity = [10000, 9800, 10200, 10100];
    const saved = saveChartEvidence({
      runId: "bt_test_persist_1",
      symbol: "BTCUSDT",
      timeframe: "15m",
      dataVersion: "binance",
      actualFirstCandleTime: "2026-01-01T00:00:00.000Z",
      actualLastCandleTime: "2026-01-01T01:00:00.000Z",
      processedCandleCount: 2,
      candles: [
        {
          openTime: 1,
          open: 1,
          high: 2,
          low: 0.5,
          close: 1.5,
          volume: 10,
        },
        {
          openTime: 2,
          open: 1.5,
          high: 2.5,
          low: 1,
          close: 2,
          volume: 12,
        },
      ],
      equityCurve: equity,
      chartSamplingApplied: false,
    });
    expect(saved.schemaVersion).toBe(CHART_EVIDENCE_SCHEMA_VERSION);
    expect(fs.existsSync(chartEvidencePath("bt_test_persist_1"))).toBe(true);
    const loaded = loadChartEvidence("bt_test_persist_1");
    expect(loaded?.candles).toHaveLength(2);
    expect(loaded?.equityCurve).toEqual(equity);
    expect(loaded?.drawdownCurve).toEqual(computeDrawdownCurve(equity));
    expect(loaded?.dataVersion).toBe("binance");
  });

  it("reload reproduces persisted chart evidence without remote API", () => {
    saveChartEvidence({
      runId: "bt_test_reload",
      symbol: "BTCUSDT",
      timeframe: "15m",
      dataVersion: "binance",
      actualFirstCandleTime: null,
      actualLastCandleTime: null,
      processedCandleCount: 1,
      candles: [
        { openTime: 10, open: 1, high: 1, low: 1, close: 1, volume: 1 },
      ],
      equityCurve: [100, 110],
      chartSamplingApplied: false,
    });
    // Simulate process restart by reloading from disk.
    const again = loadChartEvidence("bt_test_reload");
    expect(again?.candles[0]?.openTime).toBe(10);
    expect(again?.equityCurve).toEqual([100, 110]);
  });

  it("legacy runs without sidecar remain readable as null evidence", () => {
    expect(loadChartEvidence("bt_missing_legacy")).toBeNull();
  });

  it("does not write into production storage during these unit checks", () => {
    expect(process.cwd()).toContain("rextora-chart-ev-");
    expect(process.cwd()).not.toBe(ROOT);
  });
});

describe("SAFE immutability fingerprint", () => {
  it("SAFE update path fingerprint unchanged in fixture", () => {
    const p = path.join(ROOT, "data/strategies/SAFE_v44_i4060.json");
    const raw = fs.readFileSync(p, "utf8");
    expect(raw).toContain('"params_hash": "7893ca3f0e30"');
    expect(raw).toContain("SAFE_v44_i4060");
  });
});
