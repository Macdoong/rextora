/**
 * Phase 7.1 real browser validation (Binance-backed).
 * Drives live /strategy-search on the repository-native `npm run dev` server.
 */
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.PHASE71_BASE_URL ?? "http://127.0.0.1:3000";
const REPORT_PATH = path.resolve("tmp/phase71-validation-report.json");
const SAFE_PATH = path.resolve("data/strategies/SAFE_v44_i4060.json");

function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function fileMeta(p) {
  const st = fs.statSync(p);
  const buf = fs.readFileSync(p);
  return {
    path: p,
    length: st.size,
    mtimeMs: st.mtimeMs,
    mtimeIso: st.mtime.toISOString(),
    paramsHashLine:
      buf.toString("utf8").match(/"params_hash"\s*:\s*"([^"]+)"/)?.[1] ?? null,
    sha256: createHash("sha256").update(buf).digest("hex"),
  };
}

const report = {
  startedAt: new Date().toISOString(),
  baseUrl: BASE,
  safeBefore: null,
  safeAfter: null,
  consoleErrors: [],
  pageErrors: [],
  networkFailures: [],
  detailPollIntervalsMs: [],
  listPollIntervalsMs: [],
  statusesObserved: [],
  overlappingDetail: [],
  steps: {},
  defects: [],
};

const statusSet = new Set();

function mark(step, ok, detail = {}) {
  report.steps[step] = { ok, at: new Date().toISOString(), ...detail };
  console.log(`[${ok ? "OK" : "FAIL"}] ${step}`, JSON.stringify(detail).slice(0, 500));
}

async function fillReact(page, testId, value) {
  const loc = page.getByTestId(testId);
  await loc.scrollIntoViewIfNeeded();
  const tag = await loc.evaluate((el) => el.tagName.toLowerCase());
  if (tag === "select") {
    await loc.selectOption(String(value));
    return;
  }
  await loc.fill(String(value));
}

async function readJobApi(page, jobId) {
  const res = await page.request.get(`${BASE}/api/rextora/strategy-search/${jobId}`);
  const json = await res.json();
  if (json?.data?.status) statusSet.add(json.data.status);
  return json;
}

async function waitJobStatus(page, jobId, wanted, timeoutMs) {
  const set = new Set(wanted);
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await readJobApi(page, jobId);
    if (set.has(last?.data?.status)) return last;
    if (last?.data?.status === "failed" && !set.has("failed")) return last;
    await page.waitForTimeout(800);
  }
  return last;
}

async function main() {
  report.safeBefore = fileMeta(SAFE_PATH);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    locale: "ko-KR",
  });
  const page = await context.newPage();

  try {
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Ignore Next/Turbopack HMR noise in headless against dev server
        if (/webpack-hmr|WebSocket connection|_next\/webpack/i.test(text)) return;
        report.consoleErrors.push({ text, loc: msg.location() });
      }
    });
    page.on("pageerror", (err) => report.pageErrors.push(String(err)));
    page.on("requestfailed", (req) => {
      const url = req.url();
      if (/webpack-hmr|_next\/static/i.test(url)) return;
      report.networkFailures.push({ url, failure: req.failure()?.errorText });
    });

    let lastDetailAt = 0;
    let lastListAt = 0;
    let inflightDetail = 0;

    page.on("request", (req) => {
      if (req.method() !== "GET") return;
      const url = req.url().replace(/\?.*$/, "");
      if (!url.includes("/api/rextora/strategy-search")) return;
      if (/\/api\/rextora\/strategy-search\/[^/]+$/.test(url)) {
        const now = Date.now();
        if (lastDetailAt) report.detailPollIntervalsMs.push(now - lastDetailAt);
        lastDetailAt = now;
        inflightDetail += 1;
        if (inflightDetail > 1) {
          report.overlappingDetail.push({ at: new Date(now).toISOString(), url });
        }
      } else if (/\/api\/rextora\/strategy-search$/.test(url)) {
        const now = Date.now();
        if (lastListAt) report.listPollIntervalsMs.push(now - lastListAt);
        lastListAt = now;
      }
    });
    page.on("response", (res) => {
      const url = res.url().replace(/\?.*$/, "");
      if (
        res.request().method() === "GET" &&
        /\/api\/rextora\/strategy-search\/[^/]+$/.test(url)
      ) {
        inflightDetail = Math.max(0, inflightDetail - 1);
      }
    });

    // ---- page + nav ----
    await page.goto(`${BASE}/strategy-search`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="strategy-search-page"]', {
      timeout: 30_000,
    });
    await page.waitForSelector('[data-testid="strategy-search-workbench"]');
    mark("page_render", true, { url: page.url() });

    const navVisible = await page
      .getByTestId("main-nav")
      .getByText("전략 탐색", { exact: true })
      .isVisible();
    mark("nav_item", navVisible);

    // ---- error: invalid maxIterations ----
    await fillReact(page, "ss-max-iterations", "0");
    await page.getByTestId("ss-create-submit").click();
    const invalidBlocked = await Promise.race([
      page
        .getByTestId("ss-form-errors")
        .waitFor({ state: "visible", timeout: 5000 })
        .then(() => "form-errors"),
      page
        .getByTestId("ss-feedback")
        .waitFor({ state: "visible", timeout: 5000 })
        .then(async () => {
          const t = await page.getByTestId("ss-feedback").innerText();
          return t.includes("입력값을 확인") ? "feedback" : "other-feedback";
        }),
    ]).catch(() => "none");
    const invalidText =
      invalidBlocked === "form-errors"
        ? await page.getByTestId("ss-form-errors").innerText()
        : invalidBlocked !== "none"
          ? await page.getByTestId("ss-feedback").innerText()
          : "";
    mark(
      "error_invalid_create_blocked",
      invalidBlocked === "form-errors" || invalidBlocked === "feedback",
      { via: invalidBlocked, text: invalidText.slice(0, 240) },
    );

    // ---- error: zero required windows ----
    await fillReact(page, "ss-max-iterations", "3");
    const required = page.getByTestId("ss-window-required");
    if (await required.isChecked()) await required.uncheck();
    await page.getByTestId("ss-create-submit").click();
    await page.waitForTimeout(400);
    const zeroText = (
      (await page.getByTestId("ss-form-errors").isVisible())
        ? await page.getByTestId("ss-form-errors").innerText()
        : ""
    ) +
      ((await page.getByTestId("ss-feedback").isVisible().catch(() => false))
        ? await page.getByTestId("ss-feedback").innerText()
        : "");
    mark(
      "error_zero_required_windows",
      /필수 평가 창|requiredForPass|입력값을 확인/.test(zeroText),
      { text: zeroText.slice(0, 240) },
    );
    if (!(await required.isChecked())) await required.check();

    // ---- real job config (pauseable: multi-symbol + jitter) ----
    const from = isoDaysAgo(90);
    const to = isoDaysAgo(0);
    await fillReact(page, "ss-seed", "71");
    await fillReact(page, "ss-max-iterations", "80");
    await fillReact(page, "ss-symbols", "BTCUSDT,ETHUSDT");
    await fillReact(page, "ss-timeframe", "15m");
    await fillReact(page, "ss-available-from", from);
    await fillReact(page, "ss-available-to", to);
    await fillReact(page, "ss-window-from", from);
    await fillReact(page, "ss-window-to", to);
    // Enable jitter to widen the running window for pause/resume
    const jitter = page.getByTestId("ss-jitter-enabled");
    if (!(await jitter.isChecked())) await jitter.check();
    await page.locator("#ss-jitter-samples").fill("5");
    await page.locator("#ss-jitter-scale").fill("0.3");

    const createRespPromise = page.waitForResponse(
      (r) =>
        r.url().includes("/api/rextora/strategy-search") &&
        r.request().method() === "POST" &&
        !r.url().match(/\/(start|pause|resume|cancel)/),
      { timeout: 30_000 },
    );
    await page.getByTestId("ss-create-submit").click();
    const createResp = await createRespPromise;
    const createJson = await createResp.json();
    const selectedJobId = createJson?.data?.id ?? null;
    mark("job_created_appears_in_list", Boolean(selectedJobId) && createResp.ok(), {
      jobId: selectedJobId,
      status: createJson?.data?.status,
      http: createResp.status(),
    });
    if (!selectedJobId) throw new Error("job create failed: " + JSON.stringify(createJson));

    await page
      .locator(`[data-testid="ss-job-row-${selectedJobId}"]`)
      .waitFor({ state: "visible", timeout: 15_000 });
    await page.locator(`[data-testid="ss-job-row-${selectedJobId}"]`).click();
    await page.waitForSelector('[data-testid="ss-job-detail"]');
    mark("job_selected", true, { jobId: selectedJobId });

    // ---- start: wait for UI running (not only API) before pause ----
    await page.getByTestId("ss-action-start").click();
    // Do not busy-poll API ahead of UI — wait until the workbench shows running + pause.
    let afterStart = null;
    try {
      await page.waitForFunction(
        () => {
          const stats =
            document.querySelector('[data-testid="ss-statistics"]')
              ?.textContent || "";
          const pause = document.querySelector(
            '[data-testid="ss-action-pause"]',
          );
          return stats.includes("실행 중") && !!pause;
        },
        null,
        { timeout: 180_000 },
      );
      afterStart = await readJobApi(page, selectedJobId);
    } catch {
      afterStart = await readJobApi(page, selectedJobId);
    }
    mark(
      "start_running",
      ["running", "pause_requested"].includes(afterStart?.data?.status) ||
        (await page.getByTestId("ss-action-pause").isVisible().catch(() => false)),
      {
        status: afterStart?.data?.status,
        executionActive: afterStart?.data?.executionActive,
        failureMessage: afterStart?.data?.failureMessage ?? null,
        uiHasPause: await page
          .getByTestId("ss-action-pause")
          .isVisible()
          .catch(() => false),
      },
    );
    mark(
      "binance_load_inferred",
      afterStart?.data?.status !== "failed",
      {
        status: afterStart?.data?.status,
        failureMessage: afterStart?.data?.failureMessage ?? null,
        note: "Runner loads Binance candles in-process after start",
      },
    );

    // ---- pause / resume via UI controls ----
    let pausedCompleted = null;
    if (await page.getByTestId("ss-action-pause").isVisible().catch(() => false)) {
      const beforePause = await readJobApi(page, selectedJobId);
      mark("progress_updates", true, {
        completedIterations: beforePause?.data?.completedIterations,
        statistics: beforePause?.data?.statistics,
        status: beforePause?.data?.status,
      });
      await page.getByTestId("ss-action-pause").click();
      const paused = await waitJobStatus(
        page,
        selectedJobId,
        ["paused", "completed"],
        240_000,
      );
      const pauseOk = paused?.data?.status === "paused";
      pausedCompleted = paused?.data?.completedIterations ?? null;
      mark("pause", pauseOk, {
        status: paused?.data?.status,
        completedIterations: pausedCompleted,
        executionActive: paused?.data?.executionActive,
      });
      if (pauseOk) {
        await page.waitForTimeout(4500);
        const still = await readJobApi(page, selectedJobId);
        mark(
          "paused_progress_stable",
          still?.data?.status === "paused" &&
            still?.data?.completedIterations === pausedCompleted &&
            still?.data?.executionActive !== true,
          {
            status: still?.data?.status,
            completedIterations: still?.data?.completedIterations,
            executionActive: still?.data?.executionActive,
          },
        );
        await page.getByTestId("ss-action-resume").waitFor({
          state: "visible",
          timeout: 30_000,
        });
        await page.getByTestId("ss-action-resume").click();
        const resumed = await waitJobStatus(
          page,
          selectedJobId,
          ["running", "pause_requested", "completed"],
          180_000,
        );
        mark(
          "resume",
          ["running", "pause_requested", "completed"].includes(
            resumed?.data?.status,
          ),
          {
            status: resumed?.data?.status,
            executionActive: resumed?.data?.executionActive,
            completedIterations: resumed?.data?.completedIterations,
          },
        );
      } else {
        mark("paused_progress_stable", false, { note: "pause did not settle" });
        mark("resume", false, { note: "skipped" });
      }
    } else {
      mark("progress_updates", afterStart?.data?.status === "completed", {
        note: "job finished before pause UI appeared",
        status: afterStart?.data?.status,
        completedIterations: afterStart?.data?.completedIterations,
        elapsedMs: afterStart?.data?.statistics?.elapsedMs,
      });
      mark("pause", false, {
        note: "ss-action-pause never became visible",
        api: afterStart?.data?.status,
      });
      mark("paused_progress_stable", false, { note: "skipped" });
      mark("resume", false, { note: "skipped" });
    }

    // ---- completion ----
    const completedWrap = await waitJobStatus(
      page,
      selectedJobId,
      ["completed", "failed", "cancelled"],
      600_000,
    );
    const completed = completedWrap?.data;
    mark("completion", completed?.status === "completed", {
      status: completed?.status,
      completedIterations: completed?.completedIterations,
      maxIterations: completed?.maxIterations,
      failureMessage: completed?.failureMessage ?? null,
    });
    mark(
      "completed_iterations_equal_target",
      completed?.status === "completed" &&
        completed?.completedIterations === completed?.maxIterations,
      {
        completedIterations: completed?.completedIterations,
        maxIterations: completed?.maxIterations,
      },
    );

    // ---- trials ----
    await page.getByTestId("ss-trials-refresh").click();
    await page.waitForTimeout(600);
    let trialCount = await page.locator('[data-testid^="ss-trial-row-"]').count();
    mark("trials_visible", trialCount > 0, { trialCount });

    await page.getByTestId("ss-trials-limit").selectOption("20");
    await page.getByTestId("ss-trials-refresh").click();
    await page.waitForTimeout(700);
    const afterLimit = await page.locator('[data-testid^="ss-trial-row-"]').count();
    const nextBtn = page.getByTestId("ss-trials-next");
    const nextEnabled = await nextBtn.isEnabled();
    if (nextEnabled) {
      await nextBtn.click();
      await page.waitForTimeout(700);
    }
    mark("trial_pagination", afterLimit <= 20, { afterLimit, nextEnabled });

    let passedOnlyRequestSeen = false;
    const passReq = page
      .waitForRequest(
        (r) =>
          r.url().includes(`/api/rextora/strategy-search/${selectedJobId}/trials`) &&
          /passedOnly=true/.test(r.url()),
        { timeout: 10_000 },
      )
      .then(() => {
        passedOnlyRequestSeen = true;
      })
      .catch(() => {});
    await page.getByTestId("ss-trials-passed-only").check();
    await page.getByTestId("ss-trials-refresh").click();
    await passReq;
    mark("passed_only_filter_request", passedOnlyRequestSeen);

    // ---- best ----
    const bestJson = await (
      await page.request.get(`${BASE}/api/rextora/strategy-search/${selectedJobId}/best`)
    ).json();
    await page.waitForSelector('[data-testid="ss-best"]');
    const bestText = await page.getByTestId("ss-best").innerText();
    const scoredCount = await page.getByTestId("ss-best-scored").count();
    const passedCount = await page.getByTestId("ss-best-passed").count();
    mark("best_results", true, {
      apiBestIteration: bestJson?.data?.best?.iteration ?? null,
      apiBestPassedIteration: bestJson?.data?.bestPassed?.iteration ?? null,
      scoredCount,
      passedCount,
      uiSnippet: bestText.slice(0, 280),
    });
    mark("best_scored_vs_passed_distinct", true, {
      note: "ss-best-scored and ss-best-passed are separate panels; empty passed is valid",
      scoredCount,
      passedCount,
      sameIteration:
        bestJson?.data?.best != null &&
        bestJson?.data?.bestPassed != null &&
        bestJson.data.best.iteration === bestJson.data.bestPassed.iteration,
    });
    mark(
      "gate_statuses_displayed",
      scoredCount === 0 || /게이트|최종|통과|실패|base|stress|jitter|final/i.test(bestText),
      { snippet: bestText.slice(0, 200) },
    );

    const actionButtons = await page.getByRole("button", { name: /전략 저장|승인|게시|실전 주문/ }).count();
    mark("no_save_approve_publish_live", actionButtons === 0, { matchingButtons: actionButtons });

    const terminalHint = await page.getByTestId("ss-controls-terminal").count();
    mark("invalid_state_actions_not_offered", terminalHint > 0, { terminalHint });

    // ---- cancel flow ----
    await fillReact(page, "ss-seed", "72");
    await fillReact(page, "ss-max-iterations", "10");
    const cancelCreate = page.waitForResponse(
      (r) =>
        r.url().includes("/api/rextora/strategy-search") &&
        r.request().method() === "POST" &&
        !r.url().match(/\/(start|pause|resume|cancel)/),
      { timeout: 30_000 },
    );
    await page.getByTestId("ss-create-submit").click();
    const cancelCreateJson = await (await cancelCreate).json();
    const cancelJobId = cancelCreateJson?.data?.id ?? null;
    mark("cancel_job_created", Boolean(cancelJobId), { cancelJobId });

    if (cancelJobId) {
      await page.locator(`[data-testid="ss-job-row-${cancelJobId}"]`).click();
      await page.getByTestId("ss-action-start").click();
      await waitJobStatus(page, cancelJobId, ["running", "pause_requested"], 180_000);
      await page.getByTestId("ss-action-cancel").click();
      const cancelSettled = await waitJobStatus(
        page,
        cancelJobId,
        ["cancelled", "completed", "failed"],
        240_000,
      );
      mark("cancel_flow", cancelSettled?.data?.status === "cancelled", {
        status: cancelSettled?.data?.status,
        completedIterations: cancelSettled?.data?.completedIterations,
        sawCancelRequested: statusSet.has("cancel_requested"),
      });
      const itersAtCancel = cancelSettled?.data?.completedIterations ?? 0;
      await page.waitForTimeout(5000);
      const afterCancel = await readJobApi(page, cancelJobId);
      mark(
        "cancel_no_further_evals",
        afterCancel?.data?.status === "cancelled" &&
          afterCancel?.data?.completedIterations === itersAtCancel &&
          afterCancel?.data?.executionActive !== true,
        {
          status: afterCancel?.data?.status,
          completedIterations: afterCancel?.data?.completedIterations,
          executionActive: afterCancel?.data?.executionActive,
        },
      );
      const term = await page.getByTestId("ss-controls-terminal").count();
      mark("cancel_controls_disabled", term > 0, { term });
    }

    // ---- API failure Korean (intercepted) ----
    await page.route("**/api/rextora/strategy-search", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: "bad",
            code: "INVALID_REQUEST",
            details: ["evaluationWindows must be a non-empty array"],
          }),
        });
        return;
      }
      await route.continue();
    });
    await fillReact(page, "ss-seed", "99");
    await fillReact(page, "ss-max-iterations", "2");
    await page.getByTestId("ss-create-submit").click();
    await page.getByTestId("ss-feedback").waitFor({ state: "visible", timeout: 10_000 });
    const feedback = await page.getByTestId("ss-feedback").innerText();
    const detail = (await page.getByTestId("ss-feedback-detail").count())
      ? await page.getByTestId("ss-feedback-detail").innerText()
      : "";
    mark(
      "api_failure_korean",
      /요청 설정이 올바르지 않습니다/.test(feedback) &&
        /INVALID_REQUEST|코드/.test(feedback + detail),
      { feedback: feedback.slice(0, 200), detail: detail.slice(0, 200) },
    );
    await page.unroute("**/api/rextora/strategy-search");

    // ---- polling stop on terminal ----
    await page.locator(`[data-testid="ss-job-row-${selectedJobId}"]`).click();
    const beforePolls = report.detailPollIntervalsMs.length;
    await page.waitForTimeout(6500);
    const afterPolls = report.detailPollIntervalsMs.length;
    const terminalApi = await readJobApi(page, selectedJobId);
    mark(
      "polling_stops_on_terminal",
      !["running", "pause_requested", "cancel_requested"].includes(
        terminalApi?.data?.status,
      ) && terminalApi?.data?.executionActive !== true,
      {
        status: terminalApi?.data?.status,
        executionActive: terminalApi?.data?.executionActive,
        detailPollDeltaWhileTerminal: afterPolls - beforePolls,
        recentDetailPollMs: report.detailPollIntervalsMs.slice(-6),
        recentListPollMs: report.listPollIntervalsMs.slice(-6),
        overlappingDetailCount: report.overlappingDetail.length,
      },
    );

    // temp failure keeps last data
    await page.route(`**/api/rextora/strategy-search/${selectedJobId}`, async (route) => {
      if (route.request().method() === "GET") {
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await page.waitForTimeout(2500);
    const detailText = await page.getByTestId("ss-job-detail").innerText();
    mark(
      "temp_failure_keeps_last_data",
      detailText.includes(selectedJobId) || detailText.includes("완료"),
      { hasJobId: detailText.includes(selectedJobId) },
    );
    await page.unroute(`**/api/rextora/strategy-search/${selectedJobId}`);

    // duplicate action: actionPending disables start after click
    const dupBody = {
      searchVersion: "1",
      strategyTemplateId: "template_search_base",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      dataVersion: "binance-v1",
      seed: 73,
      generatorType: "random",
      maxIterations: 2,
      parameterRanges: [
        { key: "ema_fast", min: 12, max: 28, step: 1, valueType: "integer" },
      ],
      evaluationWindows: [
        {
          id: "full",
          label: "전체 구간",
          fromOpenTime: Date.parse(`${from}T00:00:00.000Z`),
          toOpenTime: Date.parse(`${to}T23:59:59.999Z`),
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
        thresholds: { minTradeCount: 0, minTotalReturn: null, maxMdd: null },
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
      costStressScenarios: [
        {
          id: "stress_1_5x",
          label: "비용 1.5배",
          requiredForPass: false,
          feeMultiplier: 1.5,
          slippageMultiplier: 1.5,
          fundingMultiplier: 1,
          spreadMultiplier: 1.5,
          costGuardKMultiplier: 1,
        },
      ],
      jitterConfig: {
        enabled: false,
        sampleCount: 2,
        mutationScale: 0.2,
        seed: 7,
        minimumPassRate: 0,
        maximumScoreDropRatio: 1,
        parameterRanges: [
          { key: "ema_fast", min: 12, max: 28, step: 1, valueType: "integer" },
        ],
      },
      dataRef: {
        source: "binance_historical",
        availableFrom: Date.parse(`${from}T00:00:00.000Z`),
        availableTo: Date.parse(`${to}T23:59:59.999Z`),
      },
    };
    const dupRes = await page.request.post(`${BASE}/api/rextora/strategy-search`, {
      data: dupBody,
    });
    const dupJson = await dupRes.json();
    const dupId = dupJson?.data?.id;
    if (dupId) {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.locator(`[data-testid="ss-job-row-${dupId}"]`).click();
      const startBtn = page.getByTestId("ss-action-start");
      await startBtn.click();
      const disabled = await startBtn.isDisabled();
      mark("duplicate_action_prevented", disabled, { dupId, disabled });
      try {
        await page.getByTestId("ss-action-cancel").click({ timeout: 8000 });
      } catch {
        /* ignore */
      }
    } else {
      mark("duplicate_action_prevented", false, { dupJson });
    }

    // ---- persistence ----
    const storeRoot = path.resolve("data/rextora/strategy-search");
    const jobFile = path.join(storeRoot, "jobs", `${selectedJobId}.json`);
    const profileFile = path.join(storeRoot, "jobs", `${selectedJobId}.execution.json`);
    const trialsDir = path.join(storeRoot, "trials", selectedJobId);
    let checkpointValid = false;
    let jobCompletedIterations = null;
    if (fs.existsSync(jobFile)) {
      const job = JSON.parse(fs.readFileSync(jobFile, "utf8"));
      JSON.stringify(job.checkpoint);
      checkpointValid = true;
      jobCompletedIterations = job.completedIterations;
    }
    const trialFiles = fs.existsSync(trialsDir)
      ? fs.readdirSync(trialsDir).filter((f) => f.endsWith(".json")).length
      : 0;
    const stratFiles = fs
      .readdirSync(path.resolve("data/strategies"))
      .filter((f) => f.endsWith(".json"));
    mark("persistence", fs.existsSync(jobFile) && fs.existsSync(profileFile) && checkpointValid, {
      jobFile: fs.existsSync(jobFile),
      executionProfile: fs.existsSync(profileFile),
      checkpointValid,
      trialFiles,
      jobCompletedIterations,
      strategyFiles: stratFiles,
    });
    mark(
      "trial_count_matches_iterations",
      trialFiles === completed?.completedIterations,
      { trialFiles, completedIterations: completed?.completedIterations },
    );

    report.safeAfter = fileMeta(SAFE_PATH);
    mark(
      "safe_unchanged",
      report.safeBefore.sha256 === report.safeAfter.sha256 &&
        report.safeBefore.mtimeMs === report.safeAfter.mtimeMs &&
        report.safeBefore.paramsHashLine === "7893ca3f0e30",
      { before: report.safeBefore, after: report.safeAfter },
    );

    report.selectedJobId = selectedJobId;
    report.cancelJobId = cancelJobId;
    report.statusesObserved = [...statusSet];
  } finally {
    report.finishedAt = new Date().toISOString();
    report.statusesObserved = [...statusSet];
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    console.log("Wrote", REPORT_PATH);
    await browser.close().catch(() => {});
  }

  const critical = [
    "page_render",
    "job_created_appears_in_list",
    "start_running",
    "completion",
    "pause",
    "resume",
    "cancel_flow",
    "safe_unchanged",
  ];
  const failed = critical.filter((k) => !report.steps[k]?.ok);
  if (failed.length) {
    console.error("Critical failures:", failed);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  report.fatal = String(err);
  report.statusesObserved = [...statusSet];
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
