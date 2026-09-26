import { expect, test, type Route } from "@playwright/test";
import { loginAsE2eCeo } from "./e2eAuth";

/**
 * Operator Strategy Search UI checks (intercepted API).
 */

type JobStatus =
  | "queued"
  | "running"
  | "paused"
  | "cancelled"
  | "completed"
  | "failed";

function envelope<T>(data: T) {
  return { ok: true, data, meta: { ts: new Date().toISOString() }, error: null };
}

function jobDetail(input: {
  id: string;
  status: JobStatus;
  completedIterations?: number;
  maxIterations?: number;
  executionActive?: boolean;
  failureMessage?: string | null;
  searchSpaceExhausted?: boolean;
  completionReason?: string | null;
  terminationReason?: string | null;
}) {
  const maxIterations = input.maxIterations ?? 10;
  const completedIterations = input.completedIterations ?? 0;
  const completionReason =
    input.completionReason ??
    (input.searchSpaceExhausted
      ? "SEARCH_SPACE_EXHAUSTED"
      : input.status === "completed"
        ? "DEADLINE_REACHED"
        : input.status === "cancelled"
          ? "USER_CANCELLED"
          : null);
  const terminationReason =
    input.terminationReason ??
    (input.status === "failed" ? "ENGINE_ERROR" : null);
  return {
    id: input.id,
    status: input.status,
    createdAt: "2026-07-22T00:00:00.000Z",
    updatedAt: "2026-07-22T00:00:01.000Z",
    startedAt: input.status === "queued" ? null : "2026-07-22T00:00:01.000Z",
    finishedAt: ["completed", "cancelled", "failed"].includes(input.status)
      ? "2026-07-22T00:00:10.000Z"
      : null,
    maxIterations,
    completedIterations,
    nextIteration: completedIterations,
    progressRatio: maxIterations > 0 ? completedIterations / maxIterations : null,
    statistics: {
      generated: completedIterations,
      evaluated: completedIterations,
      passed: Math.max(0, completedIterations - 1),
      failed: 0,
      stressPassed: completedIterations,
      jitterPassed: 0,
      duplicates: input.searchSpaceExhausted ? 2 : 0,
      errors: 0,
      bestScore: 1.23,
      averageScore: 1.1,
      elapsedMs: 1000,
      remainingEstimateMs: 2000,
    },
    bestScore: 1.23,
    bestCandidateHash: "abc123",
    bestPassedCandidateHash: null,
    failureMessage: input.failureMessage ?? null,
    executionActive: input.executionActive ?? false,
    searchVersion: "1",
    symbols: ["BTCUSDT"],
    timeframe: "15m",
    seed: 42,
    searchName: "전략 탐색",
    searchSpaceExhausted: input.searchSpaceExhausted ?? false,
    completionReason,
    terminationReason,
    config: {
      searchVersion: "1",
      strategyTemplateId: "전략 탐색",
      symbols: ["BTCUSDT"],
      timeframe: "15m",
      dataVersion: "binance-v1",
      seed: 42,
      generatorType: "random",
      maxIterations,
      parameterRangeKeys: ["ema_fast"],
      evaluationWindowIds: ["full"],
    },
    checkpoint: {
      completedIterations,
      nextIteration: completedIterations,
      bestCandidate: {
        iteration: 0,
        candidateId: "c1",
        paramsHash: "abc123",
        score: 1.23,
        passed: false,
      },
      bestPassedCandidate: null,
      updatedAt: "2026-07-22T00:00:01.000Z",
      hasRunnerPayload: true,
    },
  };
}

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function openSearchJob(
  page: import("@playwright/test").Page,
  jobId: string,
) {
  const detailResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes(`/api/rextora/strategy-search/${jobId}`) &&
      resp.request().method() === "GET" &&
      resp.ok(),
    { timeout: 15_000 },
  );
  await page.goto(`/strategy-search?jobId=${encodeURIComponent(jobId)}`);
  await expect(page.getByTestId("strategy-search-workbench")).toBeVisible();
  await detailResponse;
}

/** Advance guided setup from the current step using the primary footer control. */
async function clickGuidedNext(
  page: import("@playwright/test").Page,
  times = 1,
) {
  for (let i = 0; i < times; i++) {
    await page.getByTestId("ss-guided-next").click();
  }
}

/** Reach the final review step (5단계) with default valid form values. */
async function advanceToReviewStep(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("ss-guided-setup")).toBeVisible();
  await clickGuidedNext(page, 4);
  await expect(page.getByTestId("ss-guided-final-review")).toBeVisible();
}

async function goToValidationStep(page: import("@playwright/test").Page) {
  await expect(page.getByTestId("ss-guided-setup")).toBeVisible();
  await clickGuidedNext(page, 3);
  await expect(page.getByTestId("ss-guided-step-surface")).toHaveAttribute(
    "data-guided-step-id",
    "validation",
  );
  await expect(page.locator("#ss-advanced-body")).toHaveClass(/is-open/);
}

async function openGuidedStep3Workspace(
  page: import("@playwright/test").Page,
) {
  const workspace = page.getByTestId("ss-guided-step3-workspace-deep");
  if (!(await workspace.getAttribute("open"))) {
    await workspace.locator("summary").click();
  }
  await expect(workspace).toHaveAttribute("open", "");
}

async function openGuidedStep3PatternDeep(
  page: import("@playwright/test").Page,
) {
  const step3Deep = page.getByTestId("ss-guided-step3-deep");
  if (!(await step3Deep.getAttribute("open"))) {
    await step3Deep.locator("summary").click();
  }
  await expect(step3Deep).toHaveAttribute("open", "");
}

async function expandValidationAdvancedPanel(
  page: import("@playwright/test").Page,
) {
  const trigger = page.getByTestId("ss-validation-advanced-trigger");
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("ss-validation-advanced-body")).toBeVisible();
}

async function candidateBudgetInput(page: import("@playwright/test").Page) {
  const advancedBody = page.getByTestId("ss-validation-advanced-body");
  const engineSection = advancedBody.getByTestId("ss-section-engine");
  await engineSection.evaluate((node) => {
    (node as HTMLDetailsElement).open = true;
  });
  return advancedBody.getByTestId("ss-max-search");
}

async function setCandidateBudgetOverride(
  page: import("@playwright/test").Page,
  value: string,
) {
  const input = await candidateBudgetInput(page);
  await fillControlledNumberInput(input, value);
}

async function fillControlledNumberInput(
  locator: import("@playwright/test").Locator,
  value: string,
) {
  await locator.evaluate((el, nextValue) => {
    const node = el as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(node, nextValue);
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function openValidationAdvancedEngine(
  page: import("@playwright/test").Page,
) {
  await goToValidationStep(page);
  await expandValidationAdvancedPanel(page);
  await expect(await candidateBudgetInput(page)).toBeAttached();
}

async function installSearchMocks(
  page: import("@playwright/test").Page,
  state: {
    jobId: string;
    status: JobStatus;
    completedIterations: number;
    executionActive: boolean;
    failureMessage?: string | null;
    detailGets: number[];
    searchSpaceExhausted?: boolean;
    rejectCreate?: boolean;
    completionReason?: string | null;
  },
) {
  await page.route("**/api/rextora/strategy-search**", async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    const path = url.replace(/\?.*$/, "");
    const { jobId } = state;

    if (method === "GET" && /\/api\/rextora\/strategy-search$/.test(path)) {
      await fulfillJson(
        route,
        200,
        envelope([
          {
            id: jobId,
            status: state.status,
            createdAt: "2026-07-22T00:00:00.000Z",
            updatedAt: "2026-07-22T00:00:01.000Z",
            startedAt: null,
            finishedAt: null,
            maxIterations: 10,
            completedIterations: state.completedIterations,
            nextIteration: state.completedIterations,
            progressRatio: state.completedIterations / 10,
            statistics: jobDetail({
              id: jobId,
              status: state.status,
              completedIterations: state.completedIterations,
            }).statistics,
            bestScore: 1.23,
            bestCandidateHash: "abc123",
            bestPassedCandidateHash: null,
            failureMessage: state.failureMessage ?? null,
            executionActive: state.executionActive,
            searchVersion: "1",
            symbols: ["BTCUSDT"],
            timeframe: "15m",
            seed: 42,
            searchName: "전략 탐색",
            searchSpaceExhausted: state.searchSpaceExhausted ?? false,
          },
        ]),
      );
      return;
    }

    if (method === "POST" && /\/api\/rextora\/strategy-search$/.test(path)) {
      if (state.rejectCreate) {
        await fulfillJson(route, 400, {
          ok: false,
          error: "bad",
          code: "INVALID_REQUEST",
          details: ["evaluationWindows must be a non-empty array"],
        });
        return;
      }
      state.status = "queued";
      state.completedIterations = 0;
      state.executionActive = false;
      await fulfillJson(
        route,
        201,
        envelope(jobDetail({ id: jobId, status: "queued" })),
      );
      return;
    }

    if (method === "GET" && path.endsWith(`/${jobId}/trials`)) {
      const u = new URL(url);
      const limit = Number(u.searchParams.get("limit") ?? 50);
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const all = Array.from(
        { length: Math.max(1, state.completedIterations) },
        (_, i) => ({
          iteration: i,
          candidateId: `c${i}`,
          paramsHash: `h${i}`,
          score: 1 + i * 0.01,
          passed: i % 2 === 0,
          generatorType: "random",
          durationMs: 10,
          failureReasonCodes: [] as string[],
        }),
      );
      const filtered = all.filter((t) => t.passed);
      await fulfillJson(
        route,
        200,
        envelope({
          jobId,
          total: filtered.length,
          limit,
          offset,
          trials: filtered.slice(offset, offset + limit),
        }),
      );
      return;
    }

    if (method === "POST" && path.endsWith(`/${jobId}/promote`)) {
      await fulfillJson(route, 200, envelope({ promoted: [] }));
      return;
    }

    if (method === "GET" && path.endsWith(`/${jobId}/generations`)) {
      await fulfillJson(
        route,
        200,
        envelope({
          generationCount: 0,
          latestWeakness: null,
          latest: null,
        }),
      );
      return;
    }

    if (method === "GET" && path.endsWith(`/${jobId}/best`)) {
      await fulfillJson(
        route,
        200,
        envelope({
          bestCandidate: null,
          bestPassedCandidate: null,
          bestTrial: null,
          bestPassedTrial: null,
          gateNotes: {},
        }),
      );
      return;
    }

    if (method === "POST" && path.endsWith(`/${jobId}/start`)) {
      state.status = "running";
      state.executionActive = true;
      state.completedIterations = 2;
      await fulfillJson(
        route,
        200,
        envelope(
          jobDetail({
            id: jobId,
            status: "running",
            completedIterations: state.completedIterations,
            executionActive: true,
          }),
        ),
      );
      return;
    }

    if (method === "POST" && path.endsWith(`/${jobId}/pause`)) {
      state.status = "paused";
      state.executionActive = false;
      await fulfillJson(
        route,
        200,
        envelope(
          jobDetail({
            id: jobId,
            status: "paused",
            completedIterations: state.completedIterations,
            executionActive: false,
          }),
        ),
      );
      return;
    }

    if (method === "POST" && path.endsWith(`/${jobId}/resume`)) {
      state.status = "running";
      state.executionActive = true;
      await fulfillJson(
        route,
        200,
        envelope(
          jobDetail({
            id: jobId,
            status: "running",
            completedIterations: state.completedIterations,
            executionActive: true,
          }),
        ),
      );
      return;
    }

    if (method === "POST" && path.endsWith(`/${jobId}/cancel`)) {
      state.status = "cancelled";
      state.executionActive = false;
      await fulfillJson(
        route,
        200,
        envelope(
          jobDetail({
            id: jobId,
            status: "cancelled",
            completedIterations: state.completedIterations,
            executionActive: false,
          }),
        ),
      );
      return;
    }

    if (method === "GET" && path.endsWith(`/${jobId}`)) {
      state.detailGets.push(Date.now());
      await fulfillJson(
        route,
        200,
        envelope(
          jobDetail({
            id: jobId,
            status: state.status,
            completedIterations: state.completedIterations,
            executionActive: state.executionActive,
            failureMessage: state.failureMessage,
            searchSpaceExhausted: state.searchSpaceExhausted,
            completionReason: state.completionReason,
          }),
        ),
      );
      return;
    }

    if (method === "GET" && path.endsWith("/recover")) {
      await fulfillJson(
        route,
        200,
        envelope({
          scanned: 0,
          resumed: [],
          skipped: [],
          recordRecovered: [],
          errors: [],
          audits: [],
        }),
      );
      return;
    }

    if (method === "GET" && path.endsWith("/configs")) {
      await fulfillJson(route, 200, envelope([]));
      return;
    }

    if (method === "GET" && path.includes("/results-summary")) {
      await fulfillJson(
        route,
        200,
        envelope({
          jobId,
          status: state.status,
          counts: {
            qualifiedStrategies: 0,
            uniqueQualifiedStrategies: 0,
            clusters: 0,
            registered: 0,
            recommendable: 0,
            backtestRecommended: 0,
          },
          topProfit: null,
          topStable: null,
          topRecommend: null,
          backtestRecommendations: [],
          clusters: [],
          representatives: [],
          selectionSummary: {
            whyTopSelected: [],
            whyExcluded: [],
            overfittingNote: "",
            costSensitivityNote: "",
            drawdownRiskNote: "",
            tradeConfidenceNote: "",
            nextActions: [],
          },
          provenanceNote: "",
        }),
      );
      return;
    }

    await fulfillJson(route, 404, {
      ok: false,
      error: "unmocked",
      code: "JOB_NOT_FOUND",
    });
  });
}

test.describe("Strategy Search operator UI (intercepted API)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsE2eCeo(page);
  });

  test("unauthenticated access to strategy search redirects to login", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/strategy-search");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
    await context.close();
  });

  test("automatic Step 2 shows time-budget summary and preserves advanced values", async ({
    page,
  }) => {
    await page.route("**/api/rextora/strategy-search**", async (route) => {
      if (
        route.request().method() === "GET" &&
        /\/api\/rextora\/strategy-search$/.test(
          route.request().url().replace(/\?.*$/, ""),
        )
      ) {
        await fulfillJson(route, 200, envelope([]));
        return;
      }
      await fulfillJson(route, 404, { ok: false, error: "unmocked" });
    });

    await page.goto("/strategy-search");
    await expect(page.getByTestId("ss-symbols")).toBeVisible();
    await page.getByTestId("ss-symbols").selectOption("ETHUSDT");
    await page.getByTestId("ss-timeframe").selectOption("5m");
    await page.getByTestId("ss-period").selectOption("long");
    await clickGuidedNext(page, 1);

    await expect(page.getByTestId("ss-guided-auto-time-budget")).toBeVisible();
    const summary = page.getByTestId("ss-auto-analysis-summary-compact");
    await expect(summary).toContainText("ETHUSDT");
    await expect(summary).toContainText("5분봉");
    await expect(summary).toContainText("120");

    await page.getByTestId("ss-duration").selectOption("60");
    await expect(page.getByTestId("ss-duration")).toHaveValue("60");
    await expect(page.getByTestId("ss-max-runtime-primary")).toHaveCount(0);

    const advanced = page.getByTestId("ss-guided-step2-deep");
    await expect(advanced).not.toHaveAttribute("open");
    await advanced.locator("summary").click();
    await expect(page.getByTestId("ss-depth")).toBeVisible();
    await advanced.locator("summary").click();
    await expect(page.getByTestId("ss-duration")).toHaveValue("60");

    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });

  test("automatic target mode requests stopWhenQualifiedTarget", async ({
    page,
  }) => {
    let createBody: {
      operatorPlan?: {
        stopWhenQualifiedTarget?: boolean;
        qualifiedTarget?: number;
        selectedSpaceIds?: unknown;
      };
    } | null = null;
    await page.route("**/api/rextora/strategy-search**", async (route) => {
      const url = route.request().url().replace(/\?.*$/, "");
      if (route.request().method() === "POST" && /\/api\/rextora\/strategy-search$/.test(url)) {
        createBody = route.request().postDataJSON();
        await fulfillJson(
          route,
          200,
          envelope({ id: "search_target_mode", status: "queued" }),
        );
        return;
      }
      if (
        route.request().method() === "GET" &&
        /\/api\/rextora\/strategy-search$/.test(url)
      ) {
        await fulfillJson(route, 200, envelope([]));
        return;
      }
      await fulfillJson(route, 404, { ok: false, error: "unmocked" });
    });

    await page.goto("/strategy-search");
    await clickGuidedNext(page, 1);
    await page.getByTestId("ss-auto-objective-target").click();
    await expect(page.getByTestId("ss-guided-auto-target")).toBeVisible();
    await page.getByTestId("ss-target-return").fill("8");
    await page.getByTestId("ss-min-trades").fill("10");
    await page.getByTestId("ss-duration").selectOption("60");
    await clickGuidedNext(page, 2);
    await expect(page.getByTestId("ss-guided-target-summary")).toBeVisible();
    await expect(page.getByTestId("ss-target-return")).toHaveCount(0);
    await expect(page.getByTestId("ss-guided-target-summary")).toContainText("8");
    await clickGuidedNext(page, 1);
    await expect(page.getByTestId("ss-guided-target-review")).toContainText(
      "목표 기준 자동 탐색",
    );
    await page.getByTestId("ss-create-submit").click();
    await expect.poll(() => createBody).not.toBeNull();
    expect(createBody?.operatorPlan?.stopWhenQualifiedTarget).toBe(true);
    expect(createBody?.operatorPlan?.qualifiedTarget).toBe(1);
    expect(createBody?.operatorPlan?.selectedSpaceIds).toBeNull();
  });

  test("automatic time mode does not force qualifiedTarget to 1", async ({
    page,
  }) => {
    let createBody: {
      operatorPlan?: {
        stopWhenQualifiedTarget?: boolean;
        qualifiedTarget?: number;
      };
    } | null = null;
    await page.route("**/api/rextora/strategy-search**", async (route) => {
      const url = route.request().url().replace(/\?.*$/, "");
      if (route.request().method() === "POST" && /\/api\/rextora\/strategy-search$/.test(url)) {
        createBody = route.request().postDataJSON();
        await fulfillJson(
          route,
          200,
          envelope({ id: "search_time_mode", status: "queued" }),
        );
        return;
      }
      if (
        route.request().method() === "GET" &&
        /\/api\/rextora\/strategy-search$/.test(url)
      ) {
        await fulfillJson(route, 200, envelope([]));
        return;
      }
      await fulfillJson(route, 404, { ok: false, error: "unmocked" });
    });

    await page.goto("/strategy-search");
    await clickGuidedNext(page, 4);
    await expect(page.getByTestId("ss-guided-final-review")).toBeVisible();
    await page.getByTestId("ss-create-submit").click();
    await expect.poll(() => createBody).not.toBeNull();
    expect(createBody?.operatorPlan?.stopWhenQualifiedTarget).toBe(false);
    expect(createBody?.operatorPlan?.qualifiedTarget).toBe(3);
  });

  test("guided setup reaches review with normalized launch CTA", async ({
    page,
  }) => {
    await page.route("**/api/rextora/strategy-search**", async (route) => {
      if (
        route.request().method() === "GET" &&
        /\/api\/rextora\/strategy-search$/.test(
          route.request().url().replace(/\?.*$/, ""),
        )
      ) {
        await fulfillJson(route, 200, envelope([]));
        return;
      }
      await fulfillJson(route, 404, { ok: false, error: "unmocked" });
    });

    await page.goto("/strategy-search");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByTestId("ss-guided-setup")).toBeVisible();
    await expect(page.getByTestId("ss-symbols")).toBeVisible();
    await clickGuidedNext(page, 1);
    await expect(page.getByTestId("ss-search-mode")).toBeVisible();
    await clickGuidedNext(page, 1);
    await expect(page.getByTestId("ss-guided-step-surface")).toHaveAttribute(
      "data-guided-step-id",
      "strategy",
    );
    await expect(page.getByTestId("ss-guided-strategy-essentials")).toBeVisible();
    await openGuidedStep3Workspace(page);
    await expect(page.getByTestId("ss-search-scope-map")).toBeVisible();
    await clickGuidedNext(page, 2);
    await expect(page.getByTestId("ss-guided-final-review")).toBeVisible();
    await expect(page.getByTestId("ss-create-submit")).toHaveText("탐색 시작");
    await expect(page.getByTestId("ss-advanced-settings-link")).toHaveCount(0);
  });

  test("renders simplified page and Korean nav", async ({ page }) => {
    await page.route("**/api/rextora/strategy-search**", async (route) => {
      if (
        route.request().method() === "GET" &&
        /\/api\/rextora\/strategy-search$/.test(
          route.request().url().replace(/\?.*$/, ""),
        )
      ) {
        await fulfillJson(route, 200, envelope([]));
        return;
      }
      await fulfillJson(route, 404, { ok: false, error: "unmocked" });
    });

    await page.goto("/strategy-search");
    await expect(page.getByTestId("strategy-search-page")).toBeVisible();
    await expect(page.getByTestId("strategy-search-create")).toBeVisible();
    await expect(page.getByTestId("ss-guided-setup")).toBeVisible();
    await expect(page.getByTestId("ss-guided-step-nav")).toBeVisible();
    await expect(page.getByTestId("ss-symbols")).toBeVisible();
    await expect(page.getByTestId("ss-search-name")).toBeVisible();
    await expect(page.getByTestId("ss-guided-nav-step-market")).toHaveAttribute(
      "aria-current",
      "step",
    );
    await expect(page.getByTestId("ss-run-until-qualified")).toBeAttached();
    await expect(page.getByTestId("shell-lifecycle-nav-research")).toBeVisible();
    await expect(page.getByTestId("shell-lifecycle-nav-research")).toHaveAttribute(
      "data-active",
      "true",
    );
    await expect(page.getByRole("heading", { name: "전략 탐색" })).toBeVisible();
    await expect(
      page.getByText(/새 탐색, 재개 작업, 후보 비교를 한 화면에서 처리합니다/),
    ).toBeVisible();
  });

  test("create starts search, controls, status, qualified panel, Korean errors", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const state = {
      jobId: "search_e2e_flow_0001",
      status: "queued" as JobStatus,
      completedIterations: 0,
      executionActive: false,
      detailGets: [] as number[],
    };
    await installSearchMocks(page, state);

    await page.goto("/strategy-search");
    await expect(page.getByTestId("strategy-search-workbench")).toBeVisible();

    await page.goto("/strategy-search/advanced");
    await expect(page).toHaveURL(/\/strategy-search#ss-section-engine$/);
    await expect(page.getByTestId("strategy-search-create")).toBeVisible();

    await page.goto("/strategy-search");
    await advanceToReviewStep(page);
    await page.getByTestId("ss-guided-nav-step-validation").click();
    await fillControlledNumberInput(page.getByTestId("ss-min-trades"), "-1");
    await page.getByTestId("ss-guided-nav-step-review").click();
    await expect(page.getByTestId("ss-guided-final-review")).toBeVisible();
    await page.getByTestId("ss-create-submit").click();
    await expect(page.getByTestId("ss-form-errors")).toBeVisible();

    await page.getByTestId("ss-guided-nav-step-validation").click();
    await fillControlledNumberInput(page.getByTestId("ss-min-trades"), "10");
    await page.getByTestId("ss-guided-nav-step-review").click();
    await expect(page.getByTestId("ss-guided-final-review")).toBeVisible();
    await expect(page.getByTestId("ss-create-submit")).toHaveText("탐색 시작");
    await page.getByTestId("ss-create-submit").click();
    await expect(page.getByTestId("ss-job-detail")).toBeVisible();
    await expect(page.getByTestId("ss-statistics")).toContainText("연구");
    await expect(page.getByTestId("ss-recent-job-select")).toHaveValue(
      state.jobId,
    );
    await expect(page.getByTestId("ss-results-handoff")).toBeVisible();

    await page.getByTestId("ss-action-pause").click();
    await expect(page.getByTestId("ss-statistics")).toContainText("일시정지");
    await expect(page.getByTestId("ss-action-resume")).toBeVisible();
    await page.getByTestId("ss-action-resume").click();
    await expect(page.getByTestId("ss-action-pause")).toBeVisible();

    await page.getByTestId("ss-action-cancel").click();
    await expect(page.getByTestId("ss-execution-controls")).toHaveAttribute(
      "data-job-status",
      "cancelled",
    );
    await expect(page.getByTestId("ss-statistics")).toContainText("중지");

    await expect(
      page.getByRole("button", { name: /전략 저장|승인|게시|실전 주문/ }),
    ).toHaveCount(0);

    state.rejectCreate = true;
    await page.goto("/strategy-search");
    await page.getByTestId("ss-guided-nav-step-market").click();
    await clickGuidedNext(page, 3);
    await fillControlledNumberInput(page.getByTestId("ss-min-trades"), "10");
    await page.getByTestId("ss-guided-next").click();
    await expect(page.getByTestId("ss-guided-final-review")).toBeVisible();
    await page.getByTestId("ss-create-submit").click();
    await expect(page.getByTestId("ss-feedback")).toContainText(
      "요청 설정이 올바르지 않습니다",
    );
    await expect(page.getByTestId("ss-feedback-detail")).toContainText(
      "INVALID_REQUEST",
    );
  });

  test("polling stops after terminal and keeps last detail on transient failure", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const state = {
      jobId: "search_e2e_poll_0001",
      status: "running" as JobStatus,
      completedIterations: 1,
      executionActive: true,
      detailGets: [] as number[],
    };
    await installSearchMocks(page, state);

    await openSearchJob(page, state.jobId);
    await expect(page.getByTestId("ss-action-pause")).toBeVisible();

    await expect
      .poll(() => state.detailGets.length, { timeout: 12_000 })
      .toBeGreaterThanOrEqual(2);
    const whileActive = state.detailGets.length;

    state.status = "completed";
    state.executionActive = false;
    state.completedIterations = 10;

    await expect(page.getByTestId("ss-completed-dashboard")).toBeVisible({
      timeout: 15_000,
    });
    // Stay on Search after completion — never auto-navigate to Results.
    await expect(page).toHaveURL(/\/strategy-search/);
    await expect(page).toHaveURL(/\/strategy-search/);
    const atTerminal = state.detailGets.length;
    await page.waitForTimeout(5500);
    expect(state.detailGets.length - atTerminal).toBeLessThanOrEqual(2);
    expect(whileActive).toBeGreaterThanOrEqual(2);

    await page.route(
      `**/api/rextora/strategy-search/${state.jobId}`,
      async (route) => {
        if (route.request().method() === "GET") {
          await route.abort("failed");
          return;
        }
        await route.continue();
      },
    );
    await page.waitForTimeout(2500);
    await expect(page.getByTestId("ss-completed-dashboard")).toBeVisible();
  });

  test("completed job shows primary dashboard until customer starts 새 탐색", async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const state = {
      jobId: "search_e2e_completed_dash_0001",
      status: "completed" as JobStatus,
      completedIterations: 10,
      executionActive: false,
      completionReason: "QUALIFIED_TARGET_REACHED",
      detailGets: [] as number[],
    };
    await installSearchMocks(page, state);
    await openSearchJob(page, state.jobId);

    await expect(page.getByTestId("ss-completed-dashboard")).toBeVisible({
      timeout: 12_000,
    });
    await expect(page.getByTestId("ss-completion-hero-reason")).toContainText(
      "목표 조건",
    );
    await expect(page.getByTestId("ss-guided-nav-step-market")).toHaveCount(0);
    await expect(page.getByTestId("ss-sticky-status-header")).toHaveCount(0);
    await expect(page.getByTestId("ss-config-collapsed")).toHaveCount(0);
    await expect(page.getByTestId("ss-completed-kpi-strip")).toBeVisible();

    await page.getByTestId("ss-completion-new-research").click();
    await expect(page.getByTestId("ss-guided-nav-step-market")).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByTestId("ss-completed-dashboard")).toHaveCount(0);
  });

  test("failed job shows failureMessage; exhausted shows operator label", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const failState = {
      jobId: "search_e2e_fail_0001",
      status: "failed" as JobStatus,
      completedIterations: 1,
      executionActive: false,
      failureMessage: "캔들 로드 실패",
      detailGets: [] as number[],
    };
    await installSearchMocks(page, failState);

    await openSearchJob(page, failState.jobId);
    await expect(
      page.getByTestId("ss-job-detail").getByTestId("ss-failure-detail"),
    ).toContainText("캔들 로드 실패");

    await page.unroute("**/api/rextora/strategy-search**");
    const exhausted = {
      jobId: "search_e2e_exhaust_0001",
      status: "completed" as JobStatus,
      completedIterations: 3,
      executionActive: false,
      detailGets: [] as number[],
      searchSpaceExhausted: true,
    };
    await installSearchMocks(page, exhausted);
    await openSearchJob(page, exhausted.jobId);
    await expect(page.getByTestId("ss-completed-dashboard")).toBeVisible({
      timeout: 12_000,
    });
    await expect(page.getByTestId("ss-stop-reason")).toContainText("연구 범위 소진");
  });

  test("catalog builder controls persist through intercepted create", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const state = {
      jobId: "search_e2e_catalog_0001",
      status: "queued" as JobStatus,
      completedIterations: 0,
      executionActive: false,
      detailGets: [] as number[],
    };
    let createBody: {
      operatorPlan?: {
        stopWhenQualifiedTarget?: boolean;
        qualifiedTarget?: number;
        patternCombinationSpec?: {
          operator?: string;
          failurePolicy?: string;
          weightedThreshold?: number;
          blocks?: Array<Record<string, unknown>>;
        };
      };
    } | null = null;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        /\/api\/rextora\/strategy-search$/.test(
          request.url().replace(/\?.*$/, ""),
        )
      ) {
        createBody = request.postDataJSON() as typeof createBody;
      }
    });
    await installSearchMocks(page, state);
    await page.goto("/strategy-search");
    await clickGuidedNext(page, 1);
    await page.getByTestId("ss-search-mode-direct").click();
    await clickGuidedNext(page, 1);
    await expect(page.getByTestId("ss-guided-step-surface")).toHaveAttribute(
      "data-guided-step-id",
      "strategy",
    );
    await openGuidedStep3Workspace(page);
    await openGuidedStep3PatternDeep(page);
    await expect(page.getByTestId("ss-pattern-combination-builder")).toBeVisible();
    await page.getByTestId("ss-combo-preset-confluence").click();
    await expect(page.getByTestId("ss-pattern-block-editors")).toBeAttached();
    await page.getByTestId("ss-combo-operator").selectOption("weighted_score", {
      force: true,
    });
    await page.getByTestId("ss-combo-failure-policy").selectOption("majority", {
      force: true,
    });
    await page.getByTestId("ss-combo-weighted-threshold").fill("1.5", {
      force: true,
    });
    await clickGuidedNext(page, 2);
    await expect(page.getByTestId("ss-guided-final-review")).toBeVisible();
    const createResponse = page.waitForResponse(
      (resp) =>
        resp.request().method() === "POST" &&
        /\/api\/rextora\/strategy-search$/.test(resp.url().replace(/\?.*$/, "")),
      { timeout: 15_000 },
    );
    await page.getByTestId("ss-create-submit").click();
    await createResponse;
    expect(createBody?.operatorPlan?.stopWhenQualifiedTarget).toBe(false);
    expect(createBody?.operatorPlan?.qualifiedTarget).toBe(3);
    expect(createBody?.operatorPlan?.patternCombinationSpec).toMatchObject({
      operator: "weighted_score",
      failurePolicy: "majority",
      weightedThreshold: 1.5,
    });
    expect(
      createBody?.operatorPlan?.patternCombinationSpec?.blocks?.[0],
    ).toEqual(
      expect.objectContaining({
        family: "order_block",
        role: "entry_zone",
        required: true,
        weight: 1,
        priority: 0,
        params: expect.objectContaining({ stopAtrMult: 1.2 }),
      }),
    );
  });
});
