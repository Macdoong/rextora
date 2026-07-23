import { expect, test, type Route } from "@playwright/test";

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
}) {
  const maxIterations = input.maxIterations ?? 10;
  const completedIterations = input.completedIterations ?? 0;
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
          }),
        ),
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
    await expect(page.getByTestId("ss-intensity")).toBeVisible();
    await expect(page.getByTestId("ss-goal")).toBeVisible();
    await expect(page.getByTestId("ss-run-until-qualified")).toBeAttached();
    await expect(page.getByTestId("ss-advanced-toggle")).toBeVisible();
    await expect(
      page.getByTestId("main-nav").getByText("전략 탐색", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "전략 탐색" })).toBeVisible();
    await expect(
      page.getByText(/목표만 정하면 AI가 연구합니다/),
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

    await page.getByTestId("ss-advanced-toggle").click();
    await page.getByTestId("ss-max-search").fill("0");
    await page.getByTestId("ss-create-submit").click();
    await expect(page.getByTestId("ss-form-errors")).toBeVisible();

    await page.getByTestId("ss-max-search").fill("50");
    await page.getByTestId("ss-create-submit").click();
    await expect(page.getByTestId(`ss-job-row-${state.jobId}`)).toBeVisible();
    await expect(page.getByTestId("ss-job-detail")).toBeVisible();
    await expect(page.getByTestId("ss-statistics")).toContainText("연구");
    await expect(page.getByTestId("ss-qualified-results")).toBeVisible();

    await page.getByTestId("ss-action-pause").click();
    await expect(page.getByTestId("ss-statistics")).toContainText("일시정지");
    await expect(page.getByTestId("ss-action-resume")).toBeVisible();
    await page.getByTestId("ss-action-resume").click();
    await expect(page.getByTestId("ss-action-pause")).toBeVisible();

    await page.getByTestId("ss-action-cancel").click();
    await expect(page.getByTestId("ss-controls-terminal")).toBeVisible();
    await expect(page.getByTestId("ss-statistics")).toContainText("중지");

    await expect(
      page.getByRole("button", { name: /전략 저장|승인|게시|실전 주문/ }),
    ).toHaveCount(0);

    state.rejectCreate = true;
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

    await page.goto("/strategy-search");
    await page.getByTestId(`ss-job-row-${state.jobId}`).click({ force: true });
    await expect(page.getByTestId("ss-action-pause")).toBeVisible();

    await expect
      .poll(() => state.detailGets.length, { timeout: 12_000 })
      .toBeGreaterThanOrEqual(2);
    const whileActive = state.detailGets.length;

    state.status = "completed";
    state.executionActive = false;
    state.completedIterations = 10;

    await expect(page.getByTestId("ss-controls-terminal")).toBeVisible({
      timeout: 15_000,
    });
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
    await expect(page.getByTestId("ss-statistics")).toContainText("완료");
  });

  test("failed job shows failureMessage; exhausted shows operator label", async ({
    page,
  }) => {
    const failState = {
      jobId: "search_e2e_fail_0001",
      status: "failed" as JobStatus,
      completedIterations: 1,
      executionActive: false,
      failureMessage: "캔들 로드 실패",
      detailGets: [] as number[],
    };
    await installSearchMocks(page, failState);

    await page.goto("/strategy-search");
    await page.getByTestId(`ss-job-row-${failState.jobId}`).click({ force: true });
    await expect(page.getByTestId("ss-failure-message")).toContainText(
      "캔들 로드 실패",
    );

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
    await page.goto("/strategy-search");
    await page.getByTestId(`ss-job-row-${exhausted.jobId}`).click({ force: true });
    await expect(page.getByTestId("ss-statistics")).toContainText(
      "연구 범위 소진",
    );
  });
});
