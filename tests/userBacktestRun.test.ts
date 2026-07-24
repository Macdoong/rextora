import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  listSavedBacktestsForStrategy,
  saveBacktestResult,
} from "../src/lib/rextora/backtest/backtestStore";
import type {
  BacktestConfig,
  BacktestReport,
  BacktestTrade,
} from "../src/lib/rextora/backtest/backtestTypes";
import { evaluateLiveCandidateRegistration } from "../src/lib/rextora/results/liveCandidateEligibility";
import { operatorFormToCreateBody } from "../components/rextora/strategySearch/formDefaults";
import { createDefaultOperatorFormState } from "../components/rextora/strategySearch/formDefaults";

const ROOT = path.resolve(__dirname, "..");

function stubReport(
  strategyId: string,
  from: string,
  to: string,
  ret: number,
): BacktestReport {
  return {
    strategyId,
    strategyHash: "hash_test_abc",
    strategyName: "test",
    symbol: "BTCUSDT",
    timeframe: "15m",
    fromDate: from,
    toDate: to,
    totalReturn: ret,
    mdd: -0.05,
    tradeCount: 12,
    winRate: 0.5,
    profitFactor: 1.2,
    endingBalance: 11000,
    processedCandleCount: 100,
    candleCount: 100,
    dataSource: "binance",
  } as BacktestReport;
}

describe("user Backtest Run workflow", () => {
  let prevCwd: string;
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-bt-run-"));
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

  it("creates distinct run IDs for different periods without mutating strategy identity", () => {
    const configBase: BacktestConfig = {
      strategyId: "custom_non_safe",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      fromOpenTime: Date.parse("2026-01-01T00:00:00.000Z"),
      toOpenTime: Date.parse("2026-02-01T00:00:00.000Z"),
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
    const trades: BacktestTrade[] = [];
    const a = saveBacktestResult({
      config: configBase,
      report: stubReport("custom_non_safe", "2026-01-01", "2026-02-01", 0.1),
      trades,
      sourceType: "user_backtest_run",
      strategyId: "custom_non_safe",
      strategyHash: "hash_test_abc",
    });
    const b = saveBacktestResult({
      config: {
        ...configBase,
        fromOpenTime: Date.parse("2026-03-01T00:00:00.000Z"),
        toOpenTime: Date.parse("2026-04-01T00:00:00.000Z"),
      },
      report: stubReport("custom_non_safe", "2026-03-01", "2026-04-01", 0.2),
      trades,
      sourceType: "user_backtest_run",
      strategyId: "custom_non_safe",
      strategyHash: "hash_test_abc",
    });
    expect(a.id).not.toBe(b.id);
    expect(a.strategyHash).toBe("hash_test_abc");
    expect(b.strategyHash).toBe("hash_test_abc");
    expect(a.sourceType).toBe("user_backtest_run");
    const listed = listSavedBacktestsForStrategy("custom_non_safe");
    expect(listed.length).toBeGreaterThanOrEqual(2);
    // Must not write under production repo storage
    expect(process.cwd()).toBe(tmp);
    expect(process.cwd()).not.toBe(ROOT);
    expect(
      fs.existsSync(path.join(tmp, "data", "rextora", "backtests", "index.json")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(ROOT, "data", "rextora", "backtests", a.id + ".json")),
    ).toBe(false);
  });

  it("forces stopWhenQualifiedTarget false in standard operator body", () => {
    const form = createDefaultOperatorFormState();
    form.stopWhenQualifiedTarget = true;
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.stopWhenQualifiedTarget).toBe(false);
  });

  it("disables live candidate when paper gate fails", () => {
    const gate = evaluateLiveCandidateRegistration({
      strategyId: "custom_x",
      isSafe: false,
      paperActive: false,
      liveActive: false,
      hasBacktest: true,
      totalReturn: 0.2,
      mdd: -0.05,
      tradeCount: 20,
      passed: true,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.reasonKo).toContain("모의매매");
  });

  it("default backtest workbench exposes Run + date fields and no auto-save false reload", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/rextora/backtest/BacktestReviewWorkbench.tsx"),
      "utf8",
    );
    expect(src).toContain('data-testid="backtest-run"');
    expect(src).toContain('data-testid="backtest-from"');
    expect(src).toContain('data-testid="backtest-to"');
    expect(src).toContain("save: true");
    expect(src).not.toContain("save: false");
    expect(src).toContain("backtest-run-select");
    expect(src).toContain("user_backtest_run");
  });

  it("default workbench restores compact presets, run status under Run, and URL sync", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/rextora/backtest/BacktestReviewWorkbench.tsx"),
      "utf8",
    );
    expect(src).toContain('data-testid="backtest-date-presets"');
    expect(src).toContain('data-testid={`backtest-preset-${preset.id}`}');
    expect(src).toContain("BACKTEST_PERIOD_PRESETS");
    expect(src).toContain("validateBacktestCalendarRange");
    expect(src).toContain('data-testid="backtest-run-status"');
    expect(src).toContain("syncBacktestStrategyUrl");
    expect(src).toContain("selectStrategy");
    expect(src).toContain("history.replaceState");
    expect(src).toContain("dataRange=1");
    // Priority comment must remain URL-first
    expect(src).toContain("Priority: URL → React state → localStorage → fallback");
    // Validation / loading feedback must not live only in review-actions card
    expect(src).toMatch(
      /data-testid="backtest-run-status"[\s\S]*data-testid="backtest-run-history"/,
    );
  });

  it("API route uses shared effective-end validation and dataRange probe", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "app/api/rextora/backtest/run/route.ts"),
      "utf8",
    );
    expect(src).toContain("resolveEffectiveEndFromOpenTime");
    expect(src).toContain("probeAvailableCandleDateRange");
    expect(src).toContain('dataRange === "1"');
    expect(src).not.toContain("Date.now() + 60_000");
  });

  it("research UI does not render bare retention number alone", () => {
    const wb = fs.readFileSync(
      path.join(
        ROOT,
        "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
      ),
      "utf8",
    );
    expect(wb).toContain("최근 탐색 기록");
    expect(wb).toContain("개를 보관합니다");
    expect(wb).not.toMatch(
      /<p className="text-xs text-slate-500">\s*\{STRATEGY_SEARCH_HISTORY_RETENTION_NOTE\}\s*<\/p>/,
    );
  });

  it("results-to-backtest handoff preserves strategyId query only", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "components/rextora/results/ResultsWorkbench.tsx"),
      "utf8",
    );
    expect(src).toContain("/backtest?strategyId=");
    expect(src).toContain("evaluateLiveCandidateRegistration");
    expect(src).toContain("tradeCountOf");
  });

  it("backtest POST route requires strategyId and rejects SAFE silent default", () => {
    const src = fs.readFileSync(
      path.join(ROOT, "app/api/rextora/backtest/run/route.ts"),
      "utf8",
    );
    expect(src).toContain("STRATEGY_ID_REQUIRED");
    expect(src).toContain("SAFE로 자동 대체하지 않습니다");
    expect(src).toContain("resolveEffectiveEndFromOpenTime");
    expect(src).toContain("INVALID_DATE_RANGE");
    const helper = fs.readFileSync(
      path.join(ROOT, "src/lib/rextora/backtest/backtestDateRange.ts"),
      "utf8",
    );
    expect(helper).toContain("FUTURE_DATA_BLOCKED");
  });

  it("search evaluation source stays distinct from user_backtest_run listing", () => {
    const config: BacktestConfig = {
      strategyId: "custom_non_safe",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      fromOpenTime: Date.parse("2026-01-01T00:00:00.000Z"),
      toOpenTime: Date.parse("2026-02-01T00:00:00.000Z"),
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
    saveBacktestResult({
      config,
      report: stubReport("custom_non_safe", "2026-01-01", "2026-02-01", 0.11),
      trades: [],
      sourceType: "research_evaluation",
      strategyId: "custom_non_safe",
      strategyHash: "hash_test_abc",
    });
    const listed = listSavedBacktestsForStrategy("custom_non_safe");
    expect(listed.every((r) => r.sourceType !== "research_evaluation")).toBe(
      true,
    );
  });
});
