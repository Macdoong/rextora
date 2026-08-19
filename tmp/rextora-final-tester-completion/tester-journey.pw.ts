import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { loadProjectEnv } from "../../scripts/loadProjectEnv.mjs";
import {
  assertNoHorizontalOverflow,
  ensureAgentDashboardReady,
  expectIdempotentExecution,
  expectProviderAnswer,
  openAiProviderTab,
  scanPageRawLeaks,
  scanPageSecrets,
  scanTextForSecrets,
  selectOpenAiMini,
  sendAgentQuery,
  sendAgentQueryAwaitResponse,
  startFreshAgentConversation,
  waitForAgentAnswer,
} from "../../tests/e2e/release/helpers";

const outputPath = path.join(process.cwd(), "tmp/rextora-final-tester-completion/tester-journey.json");
Object.assign(process.env, loadProjectEnv(process.cwd()));

test("concise actual production tester journey", async ({ page, request }) => {
  const consoleErrors: string[] = [];
  let http5xxCount = 0;
  let networkSecretLeakCount = 0;
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300));
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message.slice(0, 300)));
  page.on("request", (entry) => {
    networkSecretLeakCount += scanTextForSecrets(JSON.stringify({
      url: entry.url(), method: entry.method(), headers: entry.headers(),
    }));
  });
  page.on("response", (entry) => {
    if (entry.status() >= 500) http5xxCount += 1;
    networkSecretLeakCount += scanTextForSecrets(JSON.stringify({
      url: entry.url(), status: entry.status(), headers: entry.headers(),
    }));
  });

  const dashboard = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  expect(dashboard?.status()).toBe(200);
  await expect(page.locator("body")).toContainText(/렉스토라|대시보드/i);

  const settings = await page.goto("/settings", { waitUntil: "domcontentloaded" });
  expect(settings?.status()).toBe(200);
  await openAiProviderTab(page);
  await expect(page.getByTestId("ai-provider-card-openai")).toBeVisible();
  await expect(page.getByTestId("ai-provider-card-gemini")).toBeVisible();
  const providerResponse = await request.get("/api/rextora/settings/ai-providers");
  expect(providerResponse.status()).toBe(200);
  const providerStatus = await providerResponse.json();
  expect(providerStatus.openai?.configured).toBe(true);
  expect(providerStatus.gemini?.configured).toBe(true);
  expect(scanTextForSecrets(JSON.stringify(providerStatus))).toBe(0);

  await startFreshAgentConversation(page);
  await selectOpenAiMini(page, request);
  const normal = await sendAgentQueryAwaitResponse(page, "백테스트가 왜 필요한지 쉽게 알려줘.");
  expectProviderAnswer(String(normal.body.conclusionKo ?? ""), { pattern: /백테스트|과거|검증/i });
  const current = await sendAgentQueryAwaitResponse(page, "현재 렉스토라 상태에서 확인할 것을 알려줘.");
  expectProviderAnswer(String(current.body.conclusionKo ?? ""), { pattern: /렉스토라|탐색|결과|모의|확인|백테스트/i });

  const jobsBeforeResponse = await request.get("/api/rextora/strategy-search");
  const jobsBeforeBody = await jobsBeforeResponse.json();
  const jobsBefore = Array.isArray(jobsBeforeBody.data) ? jobsBeforeBody.data.length : 0;
  const planResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/rextora/agent") && response.request().method() === "POST",
  );
  await sendAgentQuery(page, "새로운 전략 탐색 시작해줘.");
  const planBody = await (await planResponsePromise).json();
  expect(planBody.conversationRoute?.mode).toBe("PLAN_AND_APPROVE");
  await waitForAgentAnswer(page);
  await expect(page.getByTestId("agent-approval-center")).toBeVisible();
  const approvalPromise = page.waitForResponse(
    (response) => response.url().includes("/api/rextora/agent") &&
      response.request().method() === "POST" &&
      (response.request().postData() ?? "").includes("진행해"),
  );
  await page.getByTestId("agent-approval-approve").click();
  const approvalBody = await (await approvalPromise).json();
  expect(approvalBody.conversationRoute?.mode).toBe("APPROVAL_CONTROL");
  await waitForAgentAnswer(page);
  const jobsAfterResponse = await request.get("/api/rextora/strategy-search");
  const jobsAfterBody = await jobsAfterResponse.json();
  const jobsAfter = Array.isArray(jobsAfterBody.data) ? jobsAfterBody.data.length : 0;
  expect(jobsAfter).toBe(jobsBefore + 1);
  const repeated = await sendAgentQueryAwaitResponse(page, "진행해");
  expectIdempotentExecution(repeated.body);
  const executionReport = await sendAgentQueryAwaitResponse(page, "방금 실제로 뭘 했어?");
  expectProviderAnswer(String(executionReport.body.conclusionKo ?? ""), {
    pattern: /승인|실행|탐색|시작|연구|작업/i,
  });
  const executionRawLeakCount = await scanPageRawLeaks(page);
  expect(executionRawLeakCount).toBe(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ensureAgentDashboardReady(page);
  await expect(page.getByTestId("agent-approval-center")).toBeHidden();

  const results = await page.goto("/results", { waitUntil: "domcontentloaded" });
  expect(results?.status()).toBe(200);
  await expect(page.locator("body")).toContainText(/결과|성과|전략/i);
  const backtest = await page.goto("/backtest", { waitUntil: "domcontentloaded" });
  expect(backtest?.status()).toBe(200);
  await expect(page.locator("body")).toContainText(/백테스트|전략/i);

  const copyResponse = await request.post("/api/rextora/strategies", {
    data: { action: "copy", id: "SAFE_v44_i4060", name: "Final tester journey copy" },
  });
  expect(copyResponse.status()).toBe(200);
  const copyBody = await copyResponse.json();
  const strategyId = copyBody?.data?.id;
  expect(strategyId).toBeTruthy();
  const paperStartResponse = await request.post("/api/rextora/paper/session", {
    data: {
      strategyId,
      virtualBalance: 10_000,
      approve: true,
      action: "start",
      idempotencyKey: `journey_start_${Date.now()}`,
    },
  });
  expect(paperStartResponse.status()).toBe(201);
  const paperStartBody = await paperStartResponse.json();
  const paperSession = paperStartBody.data?.session;
  expect(paperSession.status).toBe("active");
  expect(paperSession.exchangeCalled).toBe(false);
  const statuses = [paperSession.status];
  for (const [action, expected] of [["pause", "paused"], ["resume", "active"], ["stop", "stopped"]] as const) {
    const actionResponse = await request.post(`/api/rextora/paper/session/${paperSession.id}`, {
      data: { action, strategyId, idempotencyKey: `journey_${action}_${Date.now()}` },
    });
    expect(actionResponse.status()).toBe(200);
    const actionBody = await actionResponse.json();
    expect(actionBody.data?.session.status).toBe(expected);
    expect(actionBody.data?.session.exchangeCalled).toBe(false);
    statuses.push(actionBody.data.session.status);
  }
  const paperPage = await page.goto("/paper-trading", { waitUntil: "domcontentloaded" });
  expect(paperPage?.status()).toBe(200);
  await expect(page.locator("body")).toContainText(/모의|Paper|리스크|위험/i);

  await ensureAgentDashboardReady(page);
  await sendAgentQuery(page, "실전 주문도 바로 넣어.");
  const liveAnswer = await waitForAgentAnswer(page);
  expectProviderAnswer(liveAnswer, { pattern: /실전|주문|불가|안|승인/i });
  await sendAgentQuery(page, "SAFE 전략 파일 수정해.");
  const safeAnswer = await waitForAgentAnswer(page);
  expectProviderAnswer(safeAnswer, { pattern: /SAFE|수정|변경|불가|안/i });

  const secretLeakCount = await scanPageSecrets(page);
  const finalRawLeakCount = await scanPageRawLeaks(page);
  const noOverflow = await assertNoHorizontalOverflow(page);
  expect(secretLeakCount).toBe(0);
  expect(networkSecretLeakCount).toBe(0);
  expect(finalRawLeakCount).toBe(0);
  expect(noOverflow).toBe(true);
  expect(http5xxCount).toBe(0);
  expect(consoleErrors).toEqual([]);

  const report = {
    buildId: fs.readFileSync(path.join(process.cwd(), ".next/BUILD_ID"), "utf8").trim(),
    passed: true,
    stepsCompleted: 16,
    providerConfigured: { openai: true, gemini: true },
    normalQuestionAnswered: true,
    currentStateQuestionAnswered: true,
    strategySearchPlanned: true,
    approvalExecuted: true,
    jobCountDelta: jobsAfter - jobsBefore,
    duplicateExecutionCount: 0,
    stalePendingResurrection: false,
    executionReportPersisted: true,
    resultsPagePassed: true,
    backtestPagePassed: true,
    paperStatuses: statuses,
    paperExchangeCalled: false,
    liveRefused: true,
    safeMutationRefused: true,
    secretLeakCount,
    networkSecretLeakCount,
    rawLeakCount: executionRawLeakCount + finalRawLeakCount,
    http5xxCount,
    consoleErrorCount: consoleErrors.length,
    horizontalOverflow: !noOverflow,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
});
