import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";
import { loginAsE2eCeo } from "./e2eAuth";

const OUT = path.join(process.cwd(), "live-qa-screenshots");

function envelope<T>(data: T) {
  return { ok: true, data, meta: { ts: new Date().toISOString() }, error: null };
}

async function fulfill(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(envelope(data)),
  });
}

async function stubEmptySearch(page: Page) {
  await page.route("**/api/rextora/strategy-search**", async (route) => {
    const url = route.request().url().replace(/\?.*$/, "");
    if (route.request().method() === "GET" && /\/strategy-search$/.test(url)) {
      await fulfill(route, []);
      return;
    }
    if (route.request().method() === "GET" && url.endsWith("/recover")) {
      await fulfill(route, {
        scanned: 0,
        resumed: [],
        skipped: [],
        recordRecovered: [],
        errors: [],
        audits: [],
      });
      return;
    }
    if (route.request().method() === "GET" && url.endsWith("/configs")) {
      await fulfill(route, []);
      return;
    }
    await route.fulfill({ status: 404, body: "{}" });
  });
}

test.describe("strategy search live QA screenshots", () => {
  test("capture step 3 notice, step 5 review, and running sparkline", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    fs.mkdirSync(OUT, { recursive: true });
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await loginAsE2eCeo(page);
    await stubEmptySearch(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/strategy-search");
    await expect(page.getByTestId("ss-guided-setup")).toBeVisible();

    await page.getByTestId("ss-guided-next").click();
    const step2Deep = page.getByTestId("ss-guided-step2-deep");
    await step2Deep.locator("summary").click();
    await page.getByTestId("ss-config-level-basic").click();
    await page.getByTestId("ss-guided-next").click();
    const pattern = page.getByTestId("ss-guided-step3-deep");
    await pattern.locator("summary").click();
    const notice = page.getByTestId("ss-pattern-matrix-system-managed");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("패턴 포함 선택은 시스템 관리입니다");
    const noticeStyle = await notice.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        color: style.color,
        background: style.backgroundColor,
        border: style.borderTopColor,
      };
    });
    expect(noticeStyle.color).not.toBe(noticeStyle.background);
    await notice.screenshot({
      path: path.join(OUT, "step3-pattern-system-notice-after.png"),
    });

    await page.getByTestId("ss-guided-next").click();
    await page.getByTestId("ss-guided-next").click();
    await expect(page.getByTestId("ss-guided-final-review")).toBeVisible();
    await expect(page.getByTestId("ss-guided-launch-compact")).toContainText(
      "시간 기준 자동 탐색",
    );
    await page.getByText("상세 보기").click();
    await expect(
      page.locator(".ss-guided-launch-summary__detail-list"),
    ).toContainText("표준 탐색");
    await page.getByTestId("ss-guided-final-review").screenshot({
      path: path.join(OUT, "step5-final-review-after.png"),
    });
    expect(consoleErrors.join("\n")).not.toMatch(/same key/i);

    await page.unroute("**/api/rextora/strategy-search**");
    const jobId = "search_live_qa_running";
    const returns = [0.012, 0.048, -0.006, 0.021];
    await page.route("**/api/rextora/strategy-search**", async (route) => {
      const url = route.request().url().replace(/\?.*$/, "");
      const method = route.request().method();
      if (method === "GET" && /\/strategy-search$/.test(url)) {
        await fulfill(route, [
          {
            id: jobId,
            status: "running",
            searchName: "실시간 점검",
            symbols: ["BTCUSDT"],
            timeframe: "15m",
            createdAt: "2026-09-24T08:00:00.000Z",
            updatedAt: "2026-09-24T08:10:00.000Z",
          },
        ]);
        return;
      }
      if (method === "GET" && url.endsWith(`/${jobId}`)) {
        await fulfill(route, {
          id: jobId,
          status: "running",
          executionActive: true,
          createdAt: "2026-09-24T08:00:00.000Z",
          updatedAt: "2026-09-24T08:10:00.000Z",
          startedAt: "2026-09-24T08:00:00.000Z",
          finishedAt: null,
          symbols: ["BTCUSDT"],
          timeframe: "15m",
          searchName: "실시간 점검",
          elapsedMs: 180_000,
          maxRuntimeMs: 10_800_000,
          overallProgressPct: 2,
          evaluatedCount: 4,
          gatePassedCount: 2,
          rejectedCount: 2,
          qualifiedCount: 0,
          uniqueEvaluatedCount: 4,
          currentSearchFamily: "ema_core",
          searchProgression: [
            { id: "ema_core", labelKo: "EMA", status: "active" },
            { id: "rsi_pullback", labelKo: "RSI", status: "pending" },
          ],
          recentActivityEvents: returns.map((netReturn, index) => ({
            type: index % 2 === 0 ? "candidate_gate_passed" : "candidate_rejected",
            at: `2026-09-24T08:0${index}:00.000Z`,
            evaluatedCount: index + 1,
            familyLabel: "EMA",
            metrics: { netReturn, mdd: -0.04 - index * 0.01 },
          })),
          statistics: {
            generated: 4,
            evaluated: 4,
            passed: 2,
            failed: 2,
            errors: 0,
            elapsedMs: 180_000,
          },
          config: {
            symbols: ["BTCUSDT"],
            timeframe: "15m",
            maxIterations: 40,
          },
          checkpoint: { completedIterations: 4, nextIteration: 4 },
          liveTop10: { entries: [] },
        });
        return;
      }
      if (method === "GET" && url.endsWith("/trials")) {
        await fulfill(route, { jobId, total: 0, limit: 200, offset: 0, trials: [] });
        return;
      }
      if (method === "GET" && url.endsWith("/generations")) {
        await fulfill(route, { generationCount: 0, latestWeakness: null, latest: null });
        return;
      }
      if (method === "GET" && url.endsWith("/best")) {
        await fulfill(route, {
          bestCandidate: null,
          bestPassedCandidate: null,
          bestTrial: null,
          bestPassedTrial: null,
          gateNotes: {},
        });
        return;
      }
      if (method === "GET" && url.endsWith("/results-summary")) {
        await fulfill(route, {
          jobId,
          status: "running",
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
        });
        return;
      }
      if (method === "GET" && (url.endsWith("/recover") || url.endsWith("/configs"))) {
        await fulfill(route, url.endsWith("/configs") ? [] : {
          scanned: 0,
          resumed: [],
          skipped: [],
          recordRecovered: [],
          errors: [],
          audits: [],
        });
        return;
      }
      await route.fulfill({ status: 404, body: "{}" });
    });

    await page.goto(`/strategy-search?jobId=${jobId}`);
    await expect(page.getByTestId("ss-running-visual")).toBeVisible();
    await expect(page.getByTestId("ss-running-spark-return")).toBeVisible();
    await expect(page.getByTestId("ss-running-spark-return-zero-line")).toHaveCount(0);
    await expect(page.locator(".ss-spark__line")).toHaveCount(2);
    await expect(page.getByTestId("ss-action-pause")).toBeVisible();
    await expect(page.getByTestId("ss-action-cancel")).toBeVisible();
    await page.getByTestId("ss-running-visual").screenshot({
      path: path.join(OUT, "running-page-top-after.png"),
    });
    await page.getByTestId("ss-running-sparks").screenshot({
      path: path.join(OUT, "running-page-metrics-after.png"),
    });
    await page.screenshot({
      path: path.join(OUT, "running-page-full-after.png"),
      fullPage: true,
    });
    expect(consoleErrors.join("\n")).not.toMatch(/same key/i);
  });
});
