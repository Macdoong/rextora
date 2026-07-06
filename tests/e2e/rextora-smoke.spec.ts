import { expect, test } from "@playwright/test";

const routes = [
  "/dashboard",
  "/market-watch",
  "/ai-candidates",
  "/cost-analysis",
  "/trading",
  "/risk",
  "/alerts",
  "/learning-log",
  "/system-status",
  "/settings"
];

const navLabels = [
  "대시보드",
  "멀티코인 감시",
  "AI 후보 랭킹",
  "비용 분석",
  "자동매매",
  "리스크 관리",
  "알림 / 텔레그램",
  "학습 기록",
  "시스템 상태",
  "설정"
];

test.describe("Rextora scalping smoke", () => {
  for (const route of routes) {
    test(`renders ${route} with pre-live safety state`, async ({ page }) => {
      await page.goto(route);

      await expect(page.getByText("Rextora").first()).toBeVisible();
      await expect(page.getByText("PAPER").first()).toBeVisible();
      await expect(page.getByText(/LIVE|실거래|차단/).first()).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Application error");
      await expect(page.locator("body")).not.toContainText("Unhandled Runtime Error");
      await expect(page.locator("body")).not.toContainText(/guaranteed profit|profit guarantee|수익 보장됩니다|수익을 보장합니다/i);
    });
  }

  test("sidebar has exactly 10 nav items", async ({ page }) => {
    await page.goto("/dashboard");
    for (const label of navLabels) {
      await expect(page.getByTestId("main-nav").getByText(label)).toBeVisible();
    }
  });

  test("dashboard has 6 primary sections", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator('[data-section="bot-status"]')).toBeVisible();
    await expect(page.locator('[data-section="today-pnl-risk"]')).toBeVisible();
    await expect(page.locator('[data-section="ai-candidates-top5"]')).toBeVisible();
    await expect(page.locator('[data-section="current-positions"]')).toBeVisible();
    await expect(page.locator('[data-section="market-watcher-summary"]')).toBeVisible();
    await expect(page.locator('[data-section="quick-emergency-controls"]')).toBeVisible();
    await expect(page.locator("body")).not.toContainText("SAFE_v44_i4060");
    await expect(page.locator("body")).not.toContainText("recent_3m");
  });

  test("dashboard AI candidates TOP 5 table visible", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("candidate-row-1")).toBeVisible();
    await expect(page.getByText("진입 가능").first()).toBeVisible();
  });

  test("dashboard emergency controls visible above fold on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard");
    const emergency = page.locator('[data-section="quick-emergency-controls"]');
    await expect(emergency).toBeVisible();
    const box = await emergency.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThan(900);
  });

  test("Auto Trading page does not show BACKTEST mode", async ({ page }) => {
    await page.goto("/trading");
    await expect(page.locator("body")).not.toContainText("BACKTEST");
    await expect(page.getByTestId("mode-paper")).toBeVisible();
    await expect(page.getByTestId("mode-live")).toBeVisible();
  });

  test("AI candidates page shows single detail panel", async ({ page }) => {
    await page.goto("/ai-candidates");
    await expect(page.getByTestId("candidate-row-1")).toBeVisible();
    await expect(page.getByTestId("candidate-detail-panel")).toHaveCount(1);
    await page.getByTestId("candidate-row-2").click();
    await expect(page.getByTestId("candidate-detail-panel")).toContainText("#2");
    await expect(page.getByTestId("candidate-detail-panel")).toHaveCount(1);
  });

  test("risk page has editable mock controls", async ({ page }) => {
    await page.goto("/risk");
    await expect(page.getByText("설정 저장")).toBeVisible();
    await expect(page.getByText("기본값 복원")).toBeVisible();
  });

  test("PAPER bot starts, stops, restarts, and keeps LIVE blocked", async ({ page }) => {
    await page.goto("/trading");

    await expect(page.getByTestId("mode-paper")).toContainText("PAPER");
    await expect(page.getByTestId("mode-live")).toContainText("실전 거래 차단됨");
    await expect(page.getByTestId("live-start-blocked-reason").first()).toContainText(/LIVE|차단|비활성화|충족/);

    await page.getByTestId("bot-start").click();
    await expect(page.getByTestId("bot-action-status")).toContainText("PAPER 모의 감시가 시작");
    await expect(page.getByTestId("bot-action-log")).toContainText("실제 주문은 전송되지 않습니다");

    await page.getByTestId("bot-stop").click();
    await expect(page.getByTestId("bot-action-status")).toContainText("PAPER 모의 감시가 중지");

    await page.getByTestId("bot-restart").click();
    await expect(page.getByTestId("bot-action-status")).toContainText("PAPER 모의 감시가 시작");
    await expect(page.getByTestId("live-start-blocked-reason").first()).toContainText(/LIVE|차단|비활성화/);
  });

  test("emergency actions are simulated and logged in PAPER", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByTestId("emergency-stop-all").first().click();
    await expect(page.getByTestId("emergency-action-log").first()).toContainText("긴급 전체 중단");
    await expect(page.getByTestId("emergency-action-log").first()).toContainText(/PAPER|모의/);

    await page.getByTestId("close-all-positions").first().click();
    await expect(page.getByTestId("emergency-action-log").first()).toContainText("포지션 청산");

    await page.getByTestId("cancel-all-orders").first().click();
    await expect(page.getByTestId("emergency-action-log").first()).toContainText("주문 취소");
  });

  test("read-only integration APIs do not expose live execution", async ({ request }) => {
    const status = await request.get("/api/binance/status");
    expect(status.ok()).toBeTruthy();
    const statusBody = await status.json();
    expect(statusBody.orderPermissionBlocked).toBe(true);
    expect(statusBody.realOrderEngineConnected).toBe(false);

    const market = await request.get("/api/binance/market?symbol=BTCUSDT");
    expect(market.ok()).toBeTruthy();

    const klines = await request.get("/api/binance/klines?symbol=BTCUSDT&interval=1h&limit=100");
    expect(klines.ok()).toBeTruthy();

    const telegram = await request.post("/api/telegram/test");
    expect(telegram.ok()).toBeTruthy();
    const telegramBody = await telegram.json();
    expect(JSON.stringify(telegramBody)).not.toContain("TG_TOKEN");
    expect(JSON.stringify(telegramBody)).not.toContain("TG_CHAT_ID");
  });

  test("rextora APIs return ok/data/meta envelope", async ({ request }) => {
    const market = await request.get("/api/rextora/market");
    expect(market.ok()).toBeTruthy();
    const marketBody = await market.json();
    expect(marketBody.ok).toBe(true);
    expect(marketBody.data).toBeDefined();
    expect(marketBody.meta?.durationMs).toBeGreaterThanOrEqual(0);

    const botStatus = await request.get("/api/rextora/bot/status");
    const botBody = await botStatus.json();
    expect(botBody.ok).toBe(true);
    expect(botBody.data.runtime).toBeDefined();
    expect(botBody.data.runtime.scanInProgress).toBeDefined();
  });

  test("dashboard shows skeleton then panels", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator('[data-layout="dashboard-compact"]')).toBeVisible();
    await expect(page.locator('[data-section="bot-status"]')).toBeVisible();
    await expect(page.getByTestId("candidate-row-1")).toBeVisible({ timeout: 15_000 });
  });

  test("market-watch and candidates have refresh controls", async ({ page }) => {
    await page.goto("/market-watch");
    await expect(page.getByTestId("market-refresh")).toBeVisible();
    await expect(page.getByTestId("market-source-badge")).toBeVisible();

    await page.goto("/ai-candidates");
    await expect(page.getByTestId("candidates-refresh")).toBeVisible();
    await expect(page.getByTestId("candidate-row-1")).toBeVisible({ timeout: 15_000 });
  });

  test("system-status exposes runtime metadata in Korean", async ({ page }) => {
    await page.goto("/system-status");
    await expect(page.getByTestId("runtime-meta")).toBeVisible();
    await expect(page.getByTestId("system-status-panel")).toBeVisible();
    await expect(page.getByText("실전 거래 준비 상태")).toBeVisible();
    await expect(page.getByText("차단 이유")).toBeVisible();
    await expect(page.getByText("다음 조치", { exact: true }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("scan=in-progress");
    await expect(page.locator("body")).not.toContainText("lastScan=");
    await expect(page.locator("body")).not.toContainText("cached=true");
  });

  test("settings page has editable tabs and operator guide", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByTestId("settings-tabs")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "운영 모드" })).toBeVisible();
    await expect(page.getByRole("button", { name: "시장 감시" })).toBeVisible();
    await expect(page.getByRole("button", { name: "저장" })).toBeVisible();
    await expect(page.getByText("설정 사용 안내")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("defaultMode");
    await expect(page.locator("body")).not.toContainText("liveTradingEnabled");
  });

  test("dashboard does not show raw debug metadata", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("body")).not.toContainText("source=bot-runtime");
    await expect(page.locator("body")).not.toContainText("cached=true");
    await expect(page.locator("body")).not.toContainText("heartbeat");
    await expect(page.getByText("AI 후보는 바로 진입하라는 뜻이 아니라").first()).toBeVisible({ timeout: 15_000 });
  });

  test("learning log does not show raw English signal values", async ({ page }) => {
    await page.goto("/learning-log");
    await expect(page.locator("body")).not.toContainText("overheated_zone");
    await expect(page.locator("body")).not.toContainText("volume_spike");
    await expect(page.getByText("돌파").first()).toBeVisible();
  });

  test("alerts page uses Korean ON/OFF labels", async ({ page }) => {
    await page.goto("/alerts");
    await expect(page.getByText("켜짐").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/\bON\b/);
    await expect(page.locator("body")).not.toContainText(/\bOFF\b/);
  });

  test("trading page shows Korean mode explanations", async ({ page }) => {
    await page.goto("/trading");
    await expect(page.getByText("PAPER 모의 거래").first()).toBeVisible();
    await expect(page.getByText("LIVE 실전 거래").first()).toBeVisible();
    await expect(page.getByText("서버 TP/SL 필요").first()).toBeVisible();
  });

  test("trading LIVE readiness shows simplified execution status", async ({ page }) => {
    await page.goto("/trading");
    await expect(page.locator("body")).not.toContainText("REXTORA_LIVE_APPROVED=false");
    await expect(page.locator("body")).not.toContainText("REXTORA_LIVE_APPROVED");
    await expect(page.locator("body")).not.toContainText("REXTORA_LIVE_CONFIRMATION_TEXT");
    await expect(page.locator("body")).not.toContainText("read-only/mock");
    await expect(page.locator("body")).not.toContainText("LIVE 안전 체크list");
    await expect(page.locator("body")).not.toContainText("LIVE 안전 체크리스트");
    await expect(page.getByTestId("live-readiness-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("live-execution-status-card")).toBeVisible();
    await expect(page.getByTestId("live-trading-panel")).toBeVisible();
    await expect(page.getByTestId("live-start")).toBeVisible();
    await expect(page.locator("body")).not.toContainText("전략 실전 승인");
    await expect(page.locator("body")).not.toContainText("실전 확인 문구");
    await expect(page.getByText("실전 거래 차단됨").first()).toBeVisible();
  });

  test("settings shows connection prep guide and system status shows readiness", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("실전 연결 준비 순서")).toBeVisible();

    await page.goto("/system-status");
    await expect(page.getByTestId("binance-diagnostics-card")).toBeVisible();
    await expect(page.getByText("실전 거래 가능 여부")).toBeVisible();
    await expect(page.getByText("Binance 연결").first()).toBeVisible();
  });

  test("system status shows binance diagnostics with refresh and no secrets", async ({ page }) => {
    await page.goto("/system-status");
    await expect(page.getByTestId("binance-diagnostics-card")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("binance-diagnostics-refresh")).toBeVisible();
    await expect(page.getByTestId("binance-status-summary")).toBeVisible();
    await expect(page.getByText("사유:").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("다음 조치:").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("BINANCE_API_SECRET");
    await expect(page.locator("body")).not.toContainText("BINANCE_API_KEY=");
  });

  test("system status user stream shows readiness when listenKey diagnostic succeeds", async ({ page }) => {
    await page.goto("/system-status");
    await expect(page.getByTestId("user-stream-status")).toBeVisible({ timeout: 15_000 });
    const readiness = page.getByText("연결 준비 완료");
    if (await readiness.isVisible().catch(() => false)) {
      await expect(page.getByText("listenKey 발급 테스트가 정상입니다").first()).toBeVisible();
    }
  });

  test("settings and system status show simplified LIVE execution status", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByTestId("live-readiness-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("live-execution-status-card")).toBeVisible();
    await expect(page.getByText("실전 실행 상태").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("REXTORA_LIVE_CONFIRMATION_TEXT");
    await expect(page.locator("body")).not.toContainText("REXTORA_LIVE_APPROVED");
    await expect(page.locator("body")).not.toContainText("전략 실전 승인");

    await page.goto("/system-status");
    await expect(page.getByTestId("live-readiness-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("live-execution-status-card")).toBeVisible();
  });

  test("system status shows server TP/SL manager readiness detail", async ({ page }) => {
    await page.goto("/system-status");
    await expect(page.getByTestId("tpsl-readiness-detail")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("매니저 상태").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("REXTORA_LIVE_APPROVED");
    await expect(page.locator("body")).not.toContainText("REXTORA_LIVE_CONFIRMATION_TEXT");
  });

  test("trading LIVE readiness clears TP/SL block when manager is ready", async ({ page, request }) => {
    const readiness = await request.get("/api/rextora/live/readiness?fresh=1");
    expect(readiness.ok()).toBeTruthy();
    const body = await readiness.json();
    expect(body.ok).toBeTruthy();

    await page.goto("/trading");
    await expect(page.getByTestId("live-readiness-panel")).toBeVisible({ timeout: 15_000 });
    const tpSlRow = page.getByTestId("live-readiness-server_tpsl");
    if (body.data?.checklist?.find((item: { id: string; statusLabel: string }) => item.id === "server_tpsl")?.statusLabel === "통과") {
      await expect(tpSlRow.getByText("통과", { exact: true })).toBeVisible();
      await expect(page.locator("body")).not.toContainText("서버 TP/SL 보호가 아직 준비되지 않았습니다.");
    }
  });
});
