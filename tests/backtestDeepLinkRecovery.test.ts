import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const WORKBENCH = fs.readFileSync(
  path.join(ROOT, "components/rextora/backtest/BacktestReviewWorkbench.tsx"),
  "utf8",
);
const ANALYSIS = fs.readFileSync(
  path.join(ROOT, "components/rextora/charts/BacktestAnalysisView.tsx"),
  "utf8",
);
const VALIDATION_PANEL = fs.readFileSync(
  path.join(ROOT, "components/rextora/backtest/operator/BacktestValidationPanel.tsx"),
  "utf8",
);
const KPI_GRID = fs.readFileSync(
  path.join(ROOT, "components/rextora/backtest/operator/BacktestKpiGrid.tsx"),
  "utf8",
);
const OPERATOR_PRESENTATION = fs.readFileSync(
  path.join(ROOT, "src/lib/rextora/backtest/backtestOperatorPresentation.ts"),
  "utf8",
);
const ELIGIBILITY = fs.readFileSync(
  path.join(ROOT, "src/lib/rextora/backtest/backtestEligibility.ts"),
  "utf8",
);

describe("Backtest deep-link recovery", () => {
  it("keeps an explicit missing strategy identity instead of falling back", () => {
    const requestedSelection = WORKBENCH.slice(
      WORKBENCH.indexOf("if (initialStrategyId)"),
      WORKBENCH.indexOf("if (prev && list.some", WORKBENCH.indexOf("if (initialStrategyId)")),
    );
    expect(requestedSelection).toContain('setHydrationState("missing_strategy")');
    expect(requestedSelection).toContain("return initialStrategyId");
    expect(requestedSelection).not.toContain("localStorage");
  });

  it("does not load saved runs or allow execution without a resolved strategy", () => {
    expect(WORKBENCH).toContain("if (!strategyId || !strategy || !symbol) return;");
    expect(WORKBENCH).toContain(
      "disabled={!strategy || unresolvedStrategyOwner || loading || runInFlight}",
    );
    expect(WORKBENCH).toContain('missingStrategy: hydrationState === "missing_strategy"');
    expect(WORKBENCH).toContain('missingRun: hydrationState === "missing_run"');
  });

  it("keeps other saved runs selectable when one run deep link is missing", () => {
    expect(WORKBENCH).toContain('data-testid="backtest-missing-run-notice"');
    expect(WORKBENCH).toContain("savedRuns.length === 0");
    expect(WORKBENCH).toContain('data-testid="backtest-run-select"');
    expect(WORKBENCH).toContain('<option value="">저장된 실행 선택</option>');
  });

  it("does not restore a stale session run for an explicit strategy URL", () => {
    expect(WORKBENCH).toContain(
      'const initialRunId = urlRunId || (!urlStrategyId ? sessionBoot?.runId : null) || null;',
    );
    expect(WORKBENCH).toContain(
      'const initialTradeId = urlTradeId || (!urlStrategyId ? sessionBoot?.tradeId : null) || null;',
    );
    expect(WORKBENCH).toContain("clearRunId: true");
  });

  it("keeps raw strategy identity out of default customer-facing labels", () => {
    const customerFacingOverview = WORKBENCH.slice(
      0,
      WORKBENCH.indexOf('id="bt-technical"'),
    );
    expect(customerFacingOverview).not.toContain(
      'Metric label="전략 ID" value={strategy?.id',
    );
    expect(customerFacingOverview).not.toContain(
      'label={displayStrategyHashLabel()}',
    );
    expect(customerFacingOverview).not.toContain(
      '실행 ID {selectedRunId.slice(0, 18)}',
    );
    expect(WORKBENCH).toContain("<summary className=\"cursor-pointer\">개발자 정보</summary>");
    const validationGrid = ANALYSIS.slice(ANALYSIS.indexOf("function ValidationGrid"));
    expect(validationGrid).not.toContain("value: `${report.strategyId}");
    expect(validationGrid).not.toContain("value: backtestRunId ??");
    expect(validationGrid).toContain('title: "저장 실행 연결"');
    expect(validationGrid).toContain('value: report.validation.paramsHashVerified ? "검증됨" : "확인 필요"');
    expect(VALIDATION_PANEL).toContain("<details className=\"bt-op-check-tech\">");
    expect(OPERATOR_PRESENTATION).not.toContain("SAFE로 자동 대체하지 않습니다");
    expect(OPERATOR_PRESENTATION).not.toContain("paramsHash 검증이 통과하지 않았습니다");
    expect(ELIGIBILITY).not.toContain("execution_price_v1 슬리피지 모델로 재백테스트");
    expect(ELIGIBILITY).not.toContain("Paper/Live로 진행하세요");
    expect(KPI_GRID).toContain('label="평균 거래 수익률"');
    expect(KPI_GRID).toContain("backtestOperatorFormatPct(averageTrade)");
  });

  it("shows and submits the exact Backtest fee and slippage assumptions", () => {
    expect(WORKBENCH).toContain("DEFAULT_FEE_RATE");
    expect(WORKBENCH).toContain("DEFAULT_SLIPPAGE_RATE");
    expect(WORKBENCH).toContain("백테스트 가정 · 수수료");
    expect(WORKBENCH).toContain("feeRate: backtestFeeRate");
    expect(WORKBENCH).toContain("slippageRate: backtestSlippageRate");
    expect(WORKBENCH).not.toContain("(시스템 설정)`");
  });

  it("fails closed for a legacy strategy with no resolved owner", () => {
    expect(WORKBENCH).toContain("strategy.locked !== true && !strategy.ownerUserId?.trim()");
    expect(WORKBENCH).toContain('data-testid="backtest-owner-unresolved"');
    expect(WORKBENCH).toContain("disabled={!strategy || unresolvedStrategyOwner || loading || runInFlight}");
    const runHandler = WORKBENCH.slice(
      WORKBENCH.indexOf("async function runUserBacktest()"),
      WORKBENCH.indexOf("const eligibility = useMemo", WORKBENCH.indexOf("async function runUserBacktest()")),
    );
    expect(runHandler).toContain("if (unresolvedStrategyOwner)");
    expect(runHandler).toContain("return;");
  });

  it("returns a saved result to Ready without executing or deleting history", () => {
    const prepareNewRun = WORKBENCH.slice(
      WORKBENCH.indexOf("function prepareNewBacktest()"),
      WORKBENCH.indexOf("useEffect(() =>", WORKBENCH.indexOf("function prepareNewBacktest()")),
    );
    const runButton = WORKBENCH.slice(
      WORKBENCH.indexOf('data-testid="backtest-run"') - 700,
      WORKBENCH.indexOf('data-testid="backtest-run"') + 450,
    );

    expect(prepareNewRun).toContain("clearResultState();");
    expect(prepareNewRun).toContain('setRunStatus("idle")');
    expect(prepareNewRun).toContain("setRunJustCompleted(false)");
    expect(prepareNewRun).toContain("setActiveNavSection(\"overview\")");
    expect(prepareNewRun).toContain("clearRunId: true");
    expect(prepareNewRun).toContain("clearTradeId: true");
    expect(prepareNewRun).toContain("router.replace(");
    expect(prepareNewRun).toContain("fromDate,");
    expect(prepareNewRun).toContain("toDate,");
    expect(prepareNewRun).not.toContain("runUserBacktest");
    expect(prepareNewRun).not.toContain("fetch(");
    expect(prepareNewRun).not.toContain("setStrategyId(");
    expect(prepareNewRun).not.toContain("setFromDate(");
    expect(prepareNewRun).not.toContain("setToDate(");
    expect(prepareNewRun).not.toContain("setSavedRuns(");

    expect(runButton).toContain("historicalReview");
    expect(runButton).toContain("executeBacktestPrimaryAction");
    expect(runButton).toContain("returnToReady: prepareNewBacktest");
    expect(runButton).toContain("runExplicitly: runUserBacktest");
    expect(WORKBENCH).toMatch(/: historicalReview\s+\? "새 백테스트 실행"\s+: "백테스트 실행"/);
    expect(WORKBENCH).toMatch(/initialSelectedTradeId=\{\s*selectedRunId && selectedRunId === initialRunId\s*\? initialTradeId\s*: null\s*\}/);

    const runHandler = WORKBENCH.slice(
      WORKBENCH.indexOf("async function runUserBacktest()"),
      WORKBENCH.indexOf("async function registerPaper()"),
    );
    expect(runHandler.match(/fetch\("\/api\/rextora\/backtest\/run"/g)).toHaveLength(1);
    expect(runHandler).toContain('method: "POST"');
  });
});
