/**
 * Browser validation: UI + create/start with full operator body + fair-share/handoff poll.
 */
import { chromium } from "playwright";

const BASE = process.env.REXTORA_BASE || "http://127.0.0.1:3013";

const now = Date.now();
const availableFrom = now - 45 * 24 * 60 * 60 * 1000;
const availableTo = now;

function createBody() {
  return {
    searchVersion: "1",
    strategyTemplateId: `browser_handoff_${now}`,
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    dataVersion: "binance-v1",
    seed: 42,
    generatorType: "random",
    maxIterations: 20,
    parameterRanges: [
      {
        key: "ema_fast",
        min: 8,
        max: 40,
        step: 1,
        valueType: "integer",
      },
    ],
    evaluationWindows: [
      {
        id: "full",
        label: "전체 구간",
        fromOpenTime: availableFrom,
        toOpenTime: availableTo,
        requiredForPass: true,
      },
    ],
    balance: 10000,
    baseCostConfig: {
      feeRate: 0.0004,
      slippageRate: 0.0002,
      fundingRate: 0.0001,
      applyFunding: false,
      applySpread: true,
      spreadRate: 0.0001,
    },
    passPolicy: {
      thresholds: {
        minTradeCount: 1,
        minTotalReturn: 0,
        maxMdd: -0.5,
        minWinRate: null,
      },
    },
    scoreWeights: {
      returnWeight: 1,
      mddWeight: 0.5,
      profitFactorWeight: 0.25,
      winRateWeight: 0.25,
      tradeAdequacyWeight: 0.25,
      negativeMonthWeight: 0.1,
      consistencyWeight: 0.1,
    },
    costStressScenarios: [],
    jitterConfig: {
      enabled: false,
      sampleCount: 0,
      mutationScale: 0.2,
      seed: 7,
      minimumPassRate: 0,
      maximumScoreDropRatio: 1,
      parameterRanges: [
        {
          key: "ema_fast",
          min: 8,
          max: 40,
          step: 1,
          valueType: "integer",
        },
      ],
    },
    dataRef: {
      source: "binance_historical",
      availableFrom,
      availableTo,
    },
    operatorPlan: {
      depthProfile: "fast",
      qualificationProfile: "aggressive",
      qualifiedTarget: 1,
      candidateBudget: 100,
      stageBatchSize: 20,
      maxRuntimeMs: 10 * 60 * 1000,
      minScore: null,
      searchName: `browser_handoff_${now}`,
    },
  };
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const promotePosts = [];
page.on("request", (req) => {
  if (req.method() === "POST" && req.url().includes("/promote")) {
    promotePosts.push(req.url());
  }
});

const report = {
  uiOk: false,
  advancedCollapsed: false,
  promoteOnOpen: 0,
  createStatus: null,
  jobId: null,
  fairShareAllocated: false,
  familyHandoffObserved: false,
  progression: null,
  seenFamilies: [],
  status: null,
  errors: [],
};

try {
  await page.goto(`${BASE}/strategy-search`, { waitUntil: "networkidle" });
  await page.getByTestId("strategy-search-page").waitFor();
  const bodyText = await page.locator("body").innerText();
  if (!bodyText.includes("탐색 시작")) throw new Error("missing start CTA");
  if (!bodyText.includes("고급 설정")) throw new Error("missing advanced");
  report.uiOk = true;
  report.advancedCollapsed = !(await page
    .getByTestId("ss-seed")
    .isVisible()
    .catch(() => false));
  if (!report.advancedCollapsed) throw new Error("advanced not collapsed");

  await page.waitForTimeout(1200);
  report.promoteOnOpen = promotePosts.length;
  if (promotePosts.length) throw new Error("promote on open");

  const createRes = await page.request.post(
    `${BASE}/api/rextora/strategy-search`,
    { data: createBody() },
  );
  const createJson = await createRes.json();
  report.createStatus = createRes.status();
  const job = createJson?.data ?? createJson;
  report.jobId = job?.id ?? null;
  if (!report.jobId) {
    report.errors.push(
      `create failed: ${JSON.stringify(createJson).slice(0, 500)}`,
    );
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }

  await page.request.post(
    `${BASE}/api/rextora/strategy-search/${report.jobId}/start`,
  );

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const det = await page.request.get(
      `${BASE}/api/rextora/strategy-search/${report.jobId}`,
    );
    const dj = await det.json();
    const detail = dj?.data ?? dj;
    report.status = detail?.status ?? null;
    const prog = detail?.searchProgression ?? [];
    report.progression = prog.map((s) => ({
      id: s.id,
      labelKo: s.labelKo,
      status: s.status,
      budgetAllocated: s.budgetAllocated ?? null,
      budgetSpent: s.budgetSpent ?? null,
    }));
    report.seenFamilies = prog
      .filter((s) =>
        ["active", "completed", "exhausted"].includes(s.status),
      )
      .map((s) => s.labelKo);

    const budget = detail?.candidateBudget ?? 100;
    const ema = prog.find((s) => s.id === "ema_core");
    const rsi = prog.find((s) => s.id === "rsi_pullback");
    if (
      ema?.budgetAllocated != null &&
      ema.budgetAllocated > 0 &&
      ema.budgetAllocated < budget
    ) {
      report.fairShareAllocated = true;
    }
    if (
      ema &&
      (ema.status === "completed" || ema.status === "exhausted") &&
      rsi &&
      (rsi.status === "active" ||
        rsi.status === "completed" ||
        rsi.status === "exhausted" ||
        (rsi.budgetAllocated != null && rsi.budgetAllocated > 0))
    ) {
      report.familyHandoffObserved = true;
      break;
    }
    if (
      detail?.status === "completed" ||
      detail?.status === "failed" ||
      detail?.status === "cancelled"
    ) {
      break;
    }
    await page.waitForTimeout(4000);
  }

  await page
    .request.post(
      `${BASE}/api/rextora/strategy-search/${report.jobId}/cancel`,
    )
    .catch(() => {});

  report.promoteTotal = promotePosts.length;
  console.log(JSON.stringify(report, null, 2));

  const ok =
    report.uiOk &&
    report.advancedCollapsed &&
    report.promoteOnOpen === 0 &&
    report.promoteTotal === 0 &&
    (report.familyHandoffObserved || report.fairShareAllocated);
  process.exit(ok ? 0 : 2);
} catch (e) {
  report.errors.push(String(e));
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
} finally {
  await browser.close();
}
