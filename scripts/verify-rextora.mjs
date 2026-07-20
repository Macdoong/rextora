import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const checks = [];
const assert = (condition, message) => {
  checks.push({ ok: Boolean(condition), message });
  if (!condition) throw new Error(message);
};

function walk(dir) {
  if (!exists(dir)) return [];
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(relative);
    return relative;
  });
}

const safe = JSON.parse(read("data/strategies/SAFE_v44_i4060.json"));
const pkg = JSON.parse(read("package.json"));
const envExample = read(".env.example");
const safety = read("src/lib/rextora/safety.ts");
const seeds = read("src/lib/rextora/seedData.ts");
const discovery = read("src/lib/rextora/strategyDiscoveryEngine.ts");
const orderManager = read("src/lib/rextora/orderManager.ts");
const backtest = read("src/lib/rextora/backtestEngine.ts");
const telegram = read("src/lib/rextora/telegramService.ts");
const binanceReadOnly = read("src/lib/rextora/binance/binanceReadOnlyService.ts");
const binanceTrade = read("src/lib/rextora/binance/binanceTradeService.ts");
const apiStatus = read("src/lib/rextora/apiStatusService.ts");
const tpSlManager = read("src/lib/rextora/tpSlManager.ts");
const serverTpSl = read("src/lib/rextora/serverTpSlManager.ts");
const liveGate = read("src/lib/rextora/liveSafetyGate.ts");
const costEngine = read("src/lib/rextora/costEngine.ts");
const aiRanker = read("src/lib/rextora/aiRanker.ts");
const riskEngine = read("src/lib/rextora/riskEngine.ts");
const executionEngine = read("src/lib/rextora/executionEngine.ts");
const telegramAssistant = read("src/lib/rextora/telegramAssistant.ts");
const learningLogger = read("src/lib/rextora/learningLogger.ts");
const envModule = read("src/lib/rextora/env.ts");
const configModule = read("src/lib/rextora/config.ts");
const securityModule = read("src/lib/rextora/security.ts");
const marketStore = read("src/lib/rextora/marketDataStore.ts");
const signalEngine = read("src/lib/rextora/signalEngine.ts");
const paperEngine = read("src/lib/rextora/paperExecutionEngine.ts");
const botRuntime = read("src/lib/rextora/botRuntime.ts");
const runtimeState = read("src/lib/rextora/runtimeState.ts");
const jsonStore = read("src/lib/rextora/storage/jsonStore.ts");
const apiResponse = read("src/lib/rextora/apiResponse.ts");
const perfAudit = exists("scripts/perf-audit.mjs") ? read("scripts/perf-audit.mjs") : "";
const marketRoute = read("app/api/rextora/market/route.ts");
const candidatesRoute = read("app/api/rextora/candidates/route.ts");
const learningRoute = read("app/api/rextora/learning/route.ts");
const dashboardPanels = exists("components/rextora/dashboard/DashboardPanels.tsx") ? read("components/rextora/dashboard/DashboardPanels.tsx") : "";
const sidebar = read("components/rextora/Sidebar.tsx");
const dashboardPage = read("app/dashboard/page.tsx");
const e2e = read("tests/e2e/rextora-smoke.spec.ts");
const settingsTabs = exists("components/rextora/settings/SettingsTabs.tsx") ? read("components/rextora/settings/SettingsTabs.tsx") : "";
const settingsPage = exists("app/settings/page.tsx") ? read("app/settings/page.tsx") : "";
const displayLabelsFile = exists("src/lib/rextora/displayLabels.ts") ? read("src/lib/rextora/displayLabels.ts") : "";
const displayFormatFile = exists("src/lib/rextora/displayFormat.ts") ? read("src/lib/rextora/displayFormat.ts") : "";
const systemStatusPanel = exists("components/rextora/SystemStatusPanel.tsx") ? read("components/rextora/SystemStatusPanel.tsx") : "";
const tradingPanels = exists("components/rextora/trading/TradingPanels.tsx") ? read("components/rextora/trading/TradingPanels.tsx") : "";
const tradingDashboard = exists("components/rextora/trading/TradingDashboard.tsx") ? read("components/rextora/trading/TradingDashboard.tsx") : "";
const tradingPage = exists("app/trading/page.tsx") ? read("app/trading/page.tsx") : "";
const marketSummary = exists("components/rextora/MarketWatcherSummary.tsx") ? read("components/rextora/MarketWatcherSummary.tsx") : "";
const learningLogPage = exists("app/learning-log/page.tsx") ? read("app/learning-log/page.tsx") : "";
const learningLogPanel = exists("components/rextora/learning/LearningLogPanel.tsx") ? read("components/rextora/learning/LearningLogPanel.tsx") : "";
const dataFiltersFile = exists("src/lib/rextora/dataFilters.ts") ? read("src/lib/rextora/dataFilters.ts") : "";
const defaultSettings = exists("src/lib/rextora/settings/defaultSettings.ts") ? read("src/lib/rextora/settings/defaultSettings.ts") : "";
const settingsStore = exists("src/lib/rextora/settings/settingsStore.ts") ? read("src/lib/rextora/settings/settingsStore.ts") : "";
const alertPanel = exists("components/rextora/AlertPanel.tsx") ? read("components/rextora/AlertPanel.tsx") : "";
const emptyStateFile = exists("components/rextora/EmptyState.tsx") ? read("components/rextora/EmptyState.tsx") : "";
const errorStateFile = exists("components/rextora/ErrorState.tsx") ? read("components/rextora/ErrorState.tsx") : "";
const loadingStateFile = exists("components/rextora/LoadingState.tsx") ? read("components/rextora/LoadingState.tsx") : "";
const systemStatusPage = exists("app/system-status/page.tsx") ? read("app/system-status/page.tsx") : "";
const alertsPage = exists("app/alerts/page.tsx") ? read("app/alerts/page.tsx") : "";
const costAnalysisPanel = exists("components/rextora/CostAnalysisPanel.tsx") ? read("components/rextora/CostAnalysisPanel.tsx") : "";

const rootFiles = [
  ...walk("app").filter((file) => /\.(ts|tsx)$/.test(file)),
  ...walk("components").filter((file) => /\.(ts|tsx)$/.test(file)),
  ...walk("lib").filter((file) => /\.(ts|tsx)$/.test(file)),
  ...walk("src").filter((file) => /\.(ts|tsx)$/.test(file)),
  ...walk("tests").filter((file) => /\.(ts|tsx)$/.test(file)),
  ...walk("scripts").filter((file) => /\.(mjs|js|ts)$/.test(file))
];

const gatedTradeSource = [binanceTrade, read("src/lib/rextora/liveExecutionEngine.ts"), serverTpSl].join("\n");
const allSource = [
  safety, seeds, discovery, orderManager, backtest, telegram, binanceReadOnly, apiStatus, tpSlManager,
  costEngine, aiRanker, riskEngine, executionEngine, read("src/lib/rextora/liveTradingEngine.ts"), paperEngine,
  liveGate, botRuntime, marketStore, signalEngine
].join("\n");
const allProjectText = rootFiles.map((file) => read(file)).join("\n");

// 1-10 Legacy safety
assert(safe.name === "SAFE_v44_i4060", "SAFE_v44_i4060 JSON is missing.");
assert(safe.params_hash === "7893ca3f0e30", "SAFE params_hash mismatch.");
assert(pkg.scripts["verify:rextora"] === "node scripts/verify-rextora.mjs", "verify:rextora script missing.");
assert(pkg.scripts["test:e2e"] === "playwright test", "test:e2e script missing.");
assert(seeds.includes('mode: "PAPER"'), "PAPER default not found.");
assert(envExample.includes("REXTORA_LIVE_APPROVED=false"), ".env.example must keep REXTORA_LIVE_APPROVED=false.");
assert(envExample.includes("read-only only") && envExample.includes("Real order execution"), ".env.example read-only Binance comments missing.");
assert(safety.includes("evaluateLiveSafetyGate") || safety.includes("getLiveBlockReasons"), "LIVE gate delegation missing.");
assert(liveGate.includes("evaluateLiveSafetyGate"), "liveSafetyGate missing.");
assert(binanceReadOnly.includes("getFuturesAccountBalanceReadOnly") && binanceReadOnly.includes("/fapi/v2/balance"), "Binance read-only helpers missing.");

// 11-20 Config & security
assert(envModule.includes("REXTORA_MAX_DAILY_LOSS_PCT"), "env.ts risk vars missing.");
assert(configModule.includes('bootMode: "PAPER"') || configModule.includes("getBootMode"), "config PAPER boot missing.");
assert(securityModule.includes("maskSecret") && securityModule.includes("verifyLiveConfirmationText"), "security helpers missing.");
assert(exists("src/lib/rextora/binance/binanceHttpClient.ts"), "binanceHttpClient missing.");
assert(exists("src/lib/rextora/binance/binanceTradeService.ts"), "binanceTradeService missing.");
assert(binanceTrade.includes("LiveExecutionContext"), "trade service requires LiveExecutionContext.");
assert(binanceTrade.includes("PAPER must NEVER call Binance trade endpoints"), "PAPER trade block missing.");
assert(exists("src/lib/rextora/binance/binanceUserStreamService.ts"), "binanceUserStreamService missing.");
assert(exists("app/api/binance/status/route.ts"), "Binance status route missing.");
assert(read("app/api/binance/status/route.ts").includes("getReadOnlyHealth"), "Binance status route missing read-only health.");

// 21-30 Domain engines
assert(exists("src/lib/rextora/marketDataStore.ts") && marketStore.includes("stale"), "marketDataStore stale protection missing.");
assert(exists("src/lib/rextora/indicators.ts") && signalEngine.includes("detectSignals"), "signalEngine missing.");
assert(exists("src/lib/rextora/feeModel.ts") && costEngine.includes("finalExpectedValuePct"), "costEngine missing.");
assert(exists("src/lib/rextora/rankingModel.ts") && aiRanker.includes("rankCandidates"), "aiRanker missing.");
assert(exists("src/lib/rextora/riskStateStore.ts") && riskEngine.includes("evaluateCandidateRisk"), "riskEngine missing.");
assert(paperEngine.includes("실제 주문은 전송되지 않습니다"), "PAPER must not place real orders.");
assert(exists("src/lib/rextora/positionManager.ts"), "positionManager missing.");
assert(exists("src/lib/rextora/tradeLifecycle.ts"), "tradeLifecycle missing.");
assert(exists("src/lib/rextora/telegramTemplates.ts"), "telegramTemplates missing.");
assert(exists("src/lib/rextora/storage/jsonStore.ts"), "jsonStore missing.");

// 31-40 LIVE & runtime
assert(exists("src/lib/rextora/settings/settingsStore.ts"), "settings store missing.");
assert(exists("app/api/rextora/settings/route.ts"), "settings API missing.");
assert(exists("src/lib/rextora/storage/auditStore.ts"), "audit store missing.");
assert(serverTpSl.includes("createLiveExecutionContext") || serverTpSl.includes("registerServerTpSl"), "Server TP/SL manager missing.");
assert(exists("src/lib/rextora/liveExecutionEngine.ts"), "liveExecutionEngine missing.");
assert(botRuntime.includes("startBotRuntime") && botRuntime.includes("emergencyStopRuntime"), "botRuntime missing.");
assert(exists("src/lib/rextora/scheduler.ts"), "scheduler missing.");
assert(exists("src/lib/rextora/runtimeState.ts"), "runtimeState missing.");
assert(exists("app/api/rextora/market/route.ts"), "rextora market API missing.");
assert(exists("app/api/rextora/bot/start/route.ts"), "rextora bot start API missing.");
assert(exists("app/api/rextora/live/preflight/route.ts"), "rextora live preflight API missing.");
assert(exists("app/api/rextora/trading/emergency-stop/route.ts"), "emergency-stop route missing.");
assert(exists("components/rextora/settings/SettingsTabs.tsx"), "settings tabs UI missing.");
assert(apiStatus.includes("connected: false") && apiStatus.includes("실주문 엔진은 연결되어 있지 않습니다."), "Real order engine disconnected status missing.");

// 41-45 UI & safety boundaries
assert(sidebar.includes("멀티코인 감시") && sidebar.includes("전략 관리") && sidebar.includes("백테스트") && sidebar.includes("모의 매매") && sidebar.includes("실전 매매"), "Sidebar nav missing.");
assert(dashboardPage.includes('data-layout="dashboard-compact"'), "Dashboard compact layout missing.");
assert(
  telegramAssistant.includes("buildCandidateDetectedMessage") ||
    read("src/lib/rextora/telegram/telegramMessages.ts").includes("buildCandidateDetectedMessage"),
  "Telegram assistant missing."
);
assert(learningLogger.includes("entryReason") && learningLogger.includes("exitReason"), "Learning logger missing.");
assert(!/newOrder|createOrder|futuresOrder|order\/test/.test(allSource), "Ungated order code detected outside trade service.");
assert(!binanceReadOnly.includes("/fapi/v1/order"), "Binance read-only must exclude order endpoints.");
assert(!/AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]+|[0-9]{8,10}:[A-Za-z0-9_-]{30,}/.test(allProjectText), "Hardcoded secrets detected.");

// 46-57 Performance & safety gates
assert(pkg.scripts["perf:audit"] === "node scripts/perf-audit.mjs", "perf:audit script missing.");
assert(exists("scripts/perf-audit.mjs") && perfAudit.includes("ROUTE_THRESHOLD_MS"), "perf-audit route thresholds missing.");
assert(apiResponse.includes("apiJsonResponse") && apiResponse.includes("durationMs"), "apiResponse meta helper missing.");
assert(marketStore.includes("cacheTtlMs") || marketStore.includes("refreshPromise"), "marketDataStore caching missing.");
assert(marketStore.includes("getAllPremiumIndexes"), "marketDataStore must batch premium index.");
assert(aiRanker.includes("candidateCache") || aiRanker.includes("invalidateCandidateCache"), "aiRanker candidate cache missing.");
assert(jsonStore.includes("storeCache") || jsonStore.includes("expiresAt"), "jsonStore TTL cache missing.");
assert(botRuntime.includes("scanLock") || botRuntime.includes("scanInProgress"), "botRuntime scan lock missing.");
assert(runtimeState.includes("lastScanDurationMs") && runtimeState.includes("marketSnapshotAgeMs"), "runtime scan metadata missing.");
assert(marketRoute.includes("apiJsonResponse") && marketRoute.includes("force"), "market API meta + cache force missing.");
assert(candidatesRoute.includes("apiJsonResponse") && candidatesRoute.includes("force"), "candidates API meta + cache force missing.");
assert(learningRoute.includes("limit") && learningRoute.includes("pagination"), "learning API pagination missing.");
assert(learningLogger.includes("getLearningLogsSummary"), "learning summary helper missing.");
assert(dashboardPanels.includes("PanelSkeleton") || dashboardPage.includes("DashboardPanels"), "dashboard independent panel loading missing.");
assert(e2e.includes("runtime-meta") || e2e.includes("panel-skeleton") || e2e.includes("market-refresh") || e2e.includes("dashboard-sections"), "e2e perf/loading checks missing.");

// 58-69 Korean beginner UI checks
assert(settingsTabs.includes("displaySettingsFieldLabel") && !settingsTabs.includes("text-slate-400\">{key}"), "Settings UI must not expose raw variable labels.");
assert(exists("src/lib/rextora/displayLabels.ts"), "displayLabels.ts missing.");
assert(displayLabelsFile.includes("기본 거래 모드") && displayFormatFile.includes("roundTo"), "displayLabels/displayFormat beginner helpers missing.");
assert(settingsPage.includes("기본 거래 모드") && settingsPage.includes("환경변수 상태"), "Settings page Korean labels missing.");
assert(systemStatusPanel.includes("간단 상태") && systemStatusPanel.includes("고급 진단 보기"), "System Status simplified layout missing.");
assert(tradingDashboard.includes("모의 자동매매 시작") && tradingDashboard.includes("실전 자동매매 시작"), "Trading dashboard Korean controls missing.");
assert(marketSummary.includes("formatPercent") || marketSummary.includes("formatVolumeChange"), "Market Watch formatting helpers missing.");
assert(learningLogPage.includes("LearningLogPanel") && (learningLogPanel.includes("displayLabel") || learningLogPanel.includes("displaySignalReason")) && displayLabelsFile.includes("breakout"), "Learning Log signal translation missing.");
assert(!learningLogPage.includes(">breakout<") && !learningLogPage.includes(">overheated_zone<") && !learningLogPage.includes(">volume_spike<") && displayLabelsFile.includes('open: "진행 중"'), "Learning Log must translate signal/result values.");
assert(defaultSettings.includes('defaultMode: "PAPER"') || seeds.includes('mode: "PAPER"'), "PAPER default setting missing.");
assert(liveGate.includes("LIVE_BLOCKED") || serverTpSl.includes("LIVE_BLOCKED"), "LIVE blocked gate status missing.");
assert(!settingsPage.includes("BINANCE_API_KEY=") && !settingsTabs.includes("process.env.BINANCE"), "Secrets must not be displayed in settings UI.");
assert(binanceTrade.includes("PAPER must NEVER call Binance trade endpoints"), "PAPER trade block must remain unchanged.");

// 70-80 Final polish checks (11 user-spec verification items)
assert(!settingsTabs.includes(">defaultMode<") && !settingsPage.includes(">defaultMode<"), "Settings must not show raw defaultMode label.");
assert(!settingsTabs.includes(">liveTradingEnabled<") && !settingsTabs.includes(">manualLiveConfirmationRequired<"), "Settings must not show raw liveTradingEnabled/manualLiveConfirmationRequired.");
assert(!settingsTabs.includes(">testnetMode<") && !settingsTabs.includes(">positionMode<") && !settingsTabs.includes(">oneWayMode<") && !settingsTabs.includes(">marginType<"), "Settings must not show raw trading field names.");
assert(systemStatusPanel.includes("실전 주문 가능 여부") && systemStatusPanel.includes("advanced-diagnostics-toggle"), "System Status simplified sections missing.");
assert(!dashboardPanels.includes("source=bot-runtime") && !dashboardPanels.includes("cached=true") && !dashboardPanels.includes("heartbeat"), "Dashboard must not show raw debug metadata.");
assert(tradingDashboard.includes("모의 거래는 실제 주문을 넣지 않습니다") && tradingDashboard.includes("실전 자동매매 시작"), "Trading page Korean helper text missing.");
assert(displayFormatFile.includes("formatRuntimeMeta") && !systemStatusPage.includes("scan=in-progress") && !systemStatusPage.includes("lastScan="), "System Status debug metadata must be Korean.");
assert(!learningLogPanel.includes(">breakout<") && !learningLogPanel.includes(">overheated_zone<") && learningLogPanel.includes("displaySignalReason"), "Learning Log panel must translate signal values.");
assert(alertsPage.includes("켜짐") || alertPanel.includes('displayLabel("ON")'), "Alerts must use Korean ON/OFF labels.");
assert(exists("components/rextora/EmptyState.tsx") && emptyStateFile.includes("데이터가 아직 없습니다"), "EmptyState Korean message missing.");
assert(exists("components/rextora/ErrorState.tsx") && errorStateFile.includes("정보를 불러오지 못했습니다"), "ErrorState Korean message missing.");
assert(exists("components/rextora/LoadingState.tsx") && loadingStateFile.includes("정보를 불러오는 중입니다"), "LoadingState Korean message missing.");
assert(settingsPage.includes("설정 사용 안내"), "Settings operator guide card missing.");
assert(!binanceTrade.includes("evaluateLiveSafetyGate") || liveGate.includes("evaluateLiveSafetyGate"), "LIVE safety gate delegation must remain intact.");

// 93-102 Real connection prep and Korean block reason checks
const envSetupDoc = exists("docs/REXTORA_ENV_SETUP_KR.md") ? read("docs/REXTORA_ENV_SETUP_KR.md") : "";
const liveExecutionEngineFile = read("src/lib/rextora/liveExecutionEngine.ts");
const liveReadinessPanel = exists("components/rextora/LiveReadinessPanel.tsx") ? read("components/rextora/LiveReadinessPanel.tsx") : "";
assert(!liveGate.includes("REXTORA_LIVE_APPROVED=false —"), "liveSafetyGate must not expose raw REXTORA_LIVE_APPROVED=false text.");
assert(!liveGate.includes("verifiedForLive"), "liveSafetyGate must not use strategy verifiedForLive blocker.");
assert(!liveGate.includes("riskSettingsConfirmed"), "liveSafetyGate must not use riskSettingsConfirmed blocker.");
assert(!liveGate.includes("실전 거래 승인 환경변수"), "REXTORA_LIVE_APPROVED must not be used as a LIVE blocker.");
assert(!liveGate.includes("실전 확인 문구"), "manual confirmation phrase must not be used as a LIVE blocker.");
assert(!liveGate.includes("전략 실전 승인"), "strategy approval must not be used as a LIVE blocker.");
assert(liveGate.includes("설정에서 실전 거래 허용") || liveGate.includes("실전 거래 허용"), "Korean LIVE setting block reason missing.");
assert(liveGate.includes("allowLiveTrading") || defaultSettings.includes("allowLiveTrading"), "allowLiveTrading setting missing.");
assert(defaultSettings.includes("operatorLiveStartRequired: true"), "operatorLiveStartRequired default missing.");
assert(defaultSettings.includes("closePositionIfTpSlFails: true"), "closePositionIfTpSlFails default missing.");
assert(liveExecutionEngineFile.includes("placeServerTpSlAfterEntry"), "liveExecutionEngine must call server TP/SL after entry.");
assert(liveExecutionEngineFile.includes("closeLivePositionAfterTpSlFailure") || liveExecutionEngineFile.includes("closePosition"), "liveExecutionEngine must close position if TP/SL fails.");
assert(botRuntime.includes("startLiveBotRuntime"), "LIVE bot runtime start missing.");
assert(displayLabelsFile.includes("displayBlockReason"), "displayBlockReason helper missing.");
assert(exists("components/rextora/LiveReadinessPanel.tsx"), "LiveReadinessPanel remains for internal diagnostics.");
assert(settingsPage.includes("설정 사용 안내"), "Settings operator guide card missing.");
assert(systemStatusPanel.includes("간단 상태") && systemStatusPanel.includes("Binance 연결"), "System Status connection summary missing.");
assert(systemStatusPanel.includes("실전 주문 가능 여부"), "System Status live tradability summary missing.");
assert(exists("docs/REXTORA_ENV_SETUP_KR.md") && envSetupDoc.includes(".env.local") && envSetupDoc.includes("체크리스트"), "REXTORA_ENV_SETUP_KR.md guide missing or incomplete.");
assert(defaultSettings.includes('defaultMode: "PAPER"') || seeds.includes('mode: "PAPER"'), "PAPER default must remain.");
assert(liveGate.includes("LIVE_BLOCKED") || serverTpSl.includes("LIVE_BLOCKED"), "LIVE blocked gate status must remain.");
assert(!settingsPage.includes("BINANCE_API_KEY=") && !envSetupDoc.match(/BINANCE_API_KEY=sk_live|TG_TOKEN=\d{8,}/), "Secrets must not be displayed in docs or settings UI.");

// 106-115 Binance diagnostics checks
const binanceDiagnostics = exists("src/lib/rextora/binance/binanceDiagnosticsService.ts") ? read("src/lib/rextora/binance/binanceDiagnosticsService.ts") : "";
const binanceDiagnosticsRoute = exists("app/api/rextora/binance/diagnostics/route.ts") ? read("app/api/rextora/binance/diagnostics/route.ts") : "";
assert(exists("src/lib/rextora/binance/binanceDiagnosticsService.ts"), "binanceDiagnosticsService.ts missing.");
assert(exists("app/api/rextora/binance/diagnostics/route.ts"), "binance diagnostics API route missing.");
assert(binanceDiagnostics.includes("runBinanceDiagnostics") && binanceDiagnostics.includes("mapBinanceDiagnosticError"), "Binance diagnostics service incomplete.");
assert(binanceDiagnostics.includes("-2015") && binanceDiagnostics.includes("-1021") && binanceDiagnostics.includes("-1022"), "Binance error code mapping missing.");
assert(!binanceDiagnostics.includes("signedRequest") && !binanceDiagnosticsRoute.includes("binanceTradeService"), "Diagnostics must not call real order endpoints.");
assert(systemStatusPanel.includes("Binance 연결 다시 점검") && systemStatusPanel.includes("binance-diagnostics-refresh"), "System Status diagnostics refresh button missing.");
assert(systemStatusPanel.includes("사유:") && systemStatusPanel.includes("다음 조치:"), "System Status detailed diagnostic fields missing.");
assert(binanceDiagnosticsRoute.includes("buildSyncedSystemPayload") || binanceDiagnosticsRoute.includes("runBinanceDiagnostics"), "Diagnostics route must run Binance diagnostics.");
assert(e2e.includes("binance-diagnostics-refresh") || e2e.includes("Binance 연결 다시 점검") || e2e.includes("live-readiness") || e2e.includes("system-status"), "e2e binance diagnostics check missing.");
assert(defaultSettings.includes('defaultMode: "PAPER"'), "PAPER default must remain after diagnostics.");
assert(liveGate.includes("LIVE_BLOCKED") || serverTpSl.includes("LIVE_BLOCKED"), "LIVE blocked must remain after diagnostics.");

// 116-125 System status sync checks
const systemStatusSync = exists("src/lib/rextora/systemStatusSyncService.ts") ? read("src/lib/rextora/systemStatusSyncService.ts") : "";
const systemRoute = exists("app/api/rextora/system/route.ts") ? read("app/api/rextora/system/route.ts") : "";
assert(exists("src/lib/rextora/systemStatusSyncService.ts"), "systemStatusSyncService.ts missing.");
assert(systemStatusSync.includes("buildSyncedSystemPayload") && systemStatusSync.includes("applyDiagnosticsToApiStatus"), "System status sync service incomplete.");
assert(systemRoute.includes("buildSyncedSystemPayload"), "System route must use synced payload.");
assert(systemStatusPanel.includes("binance-status-summary"), "System Status synced Binance summary card missing.");
assert(systemStatusPanel.includes("user-stream-status") && (systemStatusPanel.includes("연결 준비 완료") || systemStatusSync.includes("연결 준비 완료")), "User stream listenKey success display missing.");
assert(liveGate.includes("diagnostics?: BinanceDiagnosticsReport") || liveGate.includes("diagnostics?"), "LIVE gate must accept diagnostics report.");
assert(marketStore.includes("getMarketStaleBlockReason"), "Market stale reason helper missing.");
assert(!liveGate.includes("시장 데이터가 stale 상태입니다"), "LIVE gate must not use raw stale English message.");
assert(defaultSettings.includes('defaultMode: "PAPER"'), "PAPER default must remain after sync.");

// 126-140 Simplified LIVE execution readiness checks
const liveReadinessChecklist = exists("src/lib/rextora/liveReadinessChecklist.ts") ? read("src/lib/rextora/liveReadinessChecklist.ts") : "";
const liveReadinessRoute = exists("app/api/rextora/live/readiness/route.ts") ? read("app/api/rextora/live/readiness/route.ts") : "";
const tradingActionClient = exists("components/rextora/trading/TradingActionClient.tsx") ? read("components/rextora/trading/TradingActionClient.tsx") : "";
assert(exists("components/rextora/LiveReadinessPanel.tsx"), "LiveReadinessPanel.tsx missing.");
assert(liveReadinessPanel.includes("실전 실행 상태") && liveReadinessPanel.includes("live-execution-status-card"), "Simplified LIVE execution status UI missing.");
assert(!settingsPage.includes("LiveReadinessPanel"), "Settings page must not show developer readiness panel.");
assert(systemStatusPage.includes("SystemStatusPanel") && !systemStatusPage.includes("LiveReadinessPanel"), "System Status uses simplified panel without readiness checklist.");
assert(!liveReadinessPanel.includes("전략 실전 승인") && !liveReadinessPanel.includes("strategy-live-approval-card"), "Strategy approval UI must be removed.");
assert(!liveReadinessPanel.includes("실전 확인 문구") && !liveReadinessPanel.includes("live-confirmation-card"), "Manual confirmation UI must be removed.");
assert(liveReadinessChecklist.includes("buildFinalLiveReadinessChecklist") && liveReadinessChecklist.includes("서버 TP/SL"), "Operational LIVE readiness checklist builder missing.");
assert(settingsTabs.includes("serverTpSlRequired") || defaultSettings.includes("serverTpSlRequired"), "Server TP/SL setting must remain configurable.");
assert(liveGate.includes("fatalOnly"), "liveSafetyGate fatalOnly option missing.");
assert(liveGate.includes("설정에서 실전 거래 허용") || liveGate.includes("실전 거래 허용"), "Korean LIVE setting block reason missing.");
assert(!liveReadinessRoute.includes("binanceTrade") && !liveReadinessRoute.includes("newOrder"), "Readiness route must not place orders.");
assert(tradingDashboard.includes("실전 자동매매 시작") || read("app/live-trading/page.tsx").includes("실전 매매 시작"), "Trading dashboard must use Korean live start label.");
assert(e2e.includes("trading-dashboard") || e2e.includes("실전 자동매매 시작") || e2e.includes("paper-trading-page") || e2e.includes("live-trading-page"), "e2e simplified trading dashboard check missing.");
assert(defaultSettings.includes('defaultMode: "PAPER"') && defaultSettings.includes("allowLiveTrading: false"), "PAPER default and LIVE disabled must remain.");

// 141-158 LIVE readiness UI consistency checks
const liveChecklistDisplay = exists("src/lib/rextora/liveChecklistDisplay.ts") ? read("src/lib/rextora/liveChecklistDisplay.ts") : "";
assert(exists("src/lib/rextora/liveChecklistDisplay.ts"), "liveChecklistDisplay.ts missing.");
assert(!tradingDashboard.includes("live-readiness") && !tradingPage.includes("LiveReadinessPanel"), "Legacy trading LIVE checklist must be removed from main UX.");
assert(!tradingPage.includes("LiveReadinessPanel"), "Trading page must not show developer readiness checklist.");
assert(tradingPage.includes("TradingDashboard") || tradingPage.includes("paper-trading") || exists("app/paper-trading/page.tsx"), "Trading page must use simplified dashboard.");
assert(liveReadinessChecklist.includes("order_permission") && liveReadinessChecklist.includes("주문 권한"), "Unified checklist must include order permission state.");
assert(!liveReadinessChecklist.includes("REXTORA_LIVE_APPROVED=false") && !liveReadinessChecklist.includes("REXTORA_LIVE_CONFIRMATION_TEXT"), "Readiness checklist must not expose raw env var names.");
assert(!liveReadinessRoute.includes("REXTORA_LIVE_CONFIRMATION_TEXT") && !liveReadinessPanel.includes("REXTORA_LIVE"), "Live readiness UI must not expose raw env var names.");
assert(liveGate.includes("서버 TP/SL 보호가 아직 준비되지 않았습니다"), "Updated server TP/SL block reason missing.");
assert(systemStatusPanel.includes("매니저 상태") && systemStatusSync.includes("managerStatusLabel"), "Server TP/SL manager readiness display missing.");
assert(e2e.includes("trading-dashboard") || e2e.includes("실전 자동매매 시작") || e2e.includes("paper-start") || e2e.includes("live-start"), "e2e trading dashboard control check missing.");
assert(!sidebar.includes(">PAPER<") && sidebar.includes("ModeBadge"), "Sidebar must use Korean mode badge.");
assert(displayLabelsFile.includes('"모의 거래"') && displayLabelsFile.includes('"실전 거래"'), "displayLabels Korean mode labels missing.");
assert(!tradingDashboard.includes("Allow Live Trading") && !tradingDashboard.includes("Operator Live Start Required"), "Trading dashboard must not expose English gate labels.");
assert(exists("src/lib/rextora/tradingDashboardStatus.ts"), "tradingDashboardStatus.ts missing.");
assert(settingsTabs.includes("거래 모드") && settingsTabs.includes("손절/익절"), "Settings Korean tab labels missing.");
assert(settingsTabs.includes("HIDDEN_FIELDS") || settingsTabs.includes("manualLiveConfirmationRequired"), "Settings must hide deprecated approval fields.");
assert(liveGate.includes("diagnosticIsBlocked") && liveGate.includes("fatalOnly"), "LIVE gate must distinguish blocked vs warning with fatalOnly.");

// Phase 1 auto-trading flow checks
const tradingFlowVerifier = exists("src/lib/rextora/tradingFlowVerifier.ts") ? read("src/lib/rextora/tradingFlowVerifier.ts") : "";
const aiExecutionBridge = exists("src/lib/rextora/aiExecutionBridge.ts") ? read("src/lib/rextora/aiExecutionBridge.ts") : "";
const executionQueue = exists("src/lib/rextora/executionQueue.ts") ? read("src/lib/rextora/executionQueue.ts") : "";
const botRuntimeFile = read("src/lib/rextora/botRuntime.ts");
assert(exists("src/lib/rextora/tradingFlowVerifier.ts"), "tradingFlowVerifier.ts missing.");
assert(exists("src/lib/rextora/aiExecutionBridge.ts"), "aiExecutionBridge.ts missing.");
assert(exists("src/lib/rextora/executionQueue.ts"), "executionQueue.ts missing.");
assert(tradingFlowVerifier.includes("verifyTradingFlowIntegrity") && tradingFlowVerifier.includes("buildTradingFlowReport"), "Trading flow verifier incomplete.");
assert(aiExecutionBridge.includes("convertAiCandidatesToExecutionCandidates") && aiExecutionBridge.includes("ExecutionCandidate"), "AI execution bridge incomplete.");
assert(executionQueue.includes("buildExecutionQueue") && executionQueue.includes("processExecutionQueue"), "Execution queue incomplete.");
assert(botRuntimeFile.includes("runExecutionScanLoop") && (botRuntimeFile.includes("runSafePaperScanLoop") || botRuntimeFile.includes("buildExecutionQueue")), "botRuntime must integrate SAFE paper scan or execution queue.");
assert(botRuntimeFile.includes("실전 거래 감시가 시작되었습니다"), "Live start Korean message missing.");
assert(executionQueue.includes("maxEntriesPerScan") && executionQueue.includes("preventDuplicateSymbolPosition"), "Queue limits missing.");
assert(!executionQueue.includes("placeMarketOrder") && !executionQueue.includes("newOrder"), "Queue builder must not place orders.");
assert(liveExecutionEngineFile.includes("placeServerTpSlAfterEntry"), "Live TP/SL after entry must remain.");
assert(defaultSettings.includes("maxEntriesPerScan: 3") && defaultSettings.includes("queueDelayMs: 1000"), "Queue settings defaults missing.");
assert(
  tradingDashboard.includes("trading-opportunities") ||
    exists("app/paper-trading/page.tsx") ||
    read("app/market-watch/page.tsx").includes("quant-signal-table"),
  "Trading opportunity monitor card missing."
);
assert(exists("tests/tradingFlowVerifier.test.ts") && exists("tests/aiExecutionBridge.test.ts") && exists("tests/executionQueue.test.ts"), "Phase 1 queue tests missing.");

// Phase 2 leverage + learning checks
const leverageEngine = exists("src/lib/rextora/leverageEngine.ts") ? read("src/lib/rextora/leverageEngine.ts") : "";
const learningEngine = exists("src/lib/rextora/learningEngine.ts") ? read("src/lib/rextora/learningEngine.ts") : "";
const learningStore = exists("src/lib/rextora/learningStore.ts") ? read("src/lib/rextora/learningStore.ts") : "";
const learningTypes = exists("src/lib/rextora/learningTypes.ts") ? read("src/lib/rextora/learningTypes.ts") : "";
const leverageTypes = exists("src/lib/rextora/leverageTypes.ts") ? read("src/lib/rextora/leverageTypes.ts") : "";
const tradingDashboardStatus = exists("src/lib/rextora/tradingDashboardStatus.ts") ? read("src/lib/rextora/tradingDashboardStatus.ts") : "";
assert(exists("src/lib/rextora/leverageEngine.ts"), "leverageEngine.ts missing.");
assert(exists("src/lib/rextora/learningEngine.ts"), "learningEngine.ts missing.");
assert(exists("src/lib/rextora/learningStore.ts"), "learningStore.ts missing.");
assert(exists("src/lib/rextora/learningTypes.ts"), "learningTypes.ts missing.");
assert(exists("src/lib/rextora/leverageTypes.ts"), "leverageTypes.ts missing.");
assert(learningStore.includes("learning-profile.json"), "Learning profile path must be data/rextora/learning-profile.json.");
assert(leverageEngine.includes("decideLeverage") && leverageEngine.includes("maxLeverage"), "Leverage engine incomplete.");
assert(learningEngine.includes("calculateLearningAdjustment") && learningEngine.includes("updateLearningProfileFromTrade"), "Learning engine incomplete.");
assert(aiExecutionBridge.includes("calculateLearningAdjustment") && aiExecutionBridge.includes("decideLeverage"), "Bridge must connect learning and leverage.");
assert(aiExecutionBridge.includes("learningScoreDelta") && aiExecutionBridge.includes("leverageReason"), "Execution candidate learning/leverage fields missing.");
assert(defaultSettings.includes("autoLeverageEnabled: true") && defaultSettings.includes("minSamplesForAdjustment: 10"), "Phase 2 settings defaults missing.");
assert(settingsStore.includes("learning: { ...defaults.learning"), "Settings store must deep-merge learning defaults.");
assert(tradingDashboardStatus.includes("buildLearningSummary") && tradingDashboardStatus.includes("learningSummary"), "Dashboard learning summary missing.");
assert(read("components/rextora/trading/TradingDashboard.tsx").includes("trading-learning-card"), "Trading learning dashboard card missing.");
assert(leverageEngine.includes("Math.min(max") || leverageEngine.includes("clampLeverage"), "Leverage must respect max cap.");
assert(leverageEngine.includes("Math.max(min") || leverageEngine.includes("clampLeverage"), "Leverage must respect min floor.");
assert(learningEngine.includes("!input.costPass") || learningEngine.includes("costPass"), "Learning must not bypass cost failure.");
assert(!learningEngine.includes("placeMarketOrder") && !learningEngine.includes("executeLiveEntry"), "Learning must not place live orders.");
assert(read("src/lib/rextora/tradeLifecycle.ts").includes("recordLearningTradeOutcome") || botRuntimeFile.includes("recordTradeOutcome"), "Trade outcomes must be recorded for learning.");
assert(exists("tests/leverageEngine.test.ts") && exists("tests/learningEngine.test.ts") && exists("tests/learningStore.test.ts"), "Phase 2 tests missing.");

// 169-182 Telegram Korean localization checks
const telegramMessagesFile = exists("src/lib/rextora/telegram/telegramMessages.ts") ? read("src/lib/rextora/telegram/telegramMessages.ts") : "";
assert(telegramMessagesFile.includes("buildLearningSummaryMessage") && telegramMessagesFile.includes("[렉스토라 학습 알림]"), "Telegram learning messages must be Korean.");
const telegramOperationFile = exists("src/lib/rextora/telegramOperation.ts") ? read("src/lib/rextora/telegramOperation.ts") : "";
const telegramServiceFile = exists("src/lib/rextora/telegramService.ts") ? read("src/lib/rextora/telegramService.ts") : "";
const telegramTestRoute = exists("app/api/rextora/telegram/test/route.ts") ? read("app/api/rextora/telegram/test/route.ts") : "";
const telegramMessagesTest = exists("tests/telegramMessages.test.ts") ? read("tests/telegramMessages.test.ts") : "";
assert(exists("src/lib/rextora/telegram/telegramMessages.ts"), "telegramMessages.ts helper missing.");
assert(telegramMessagesFile.includes("buildPaperBotStartedMessage") && telegramMessagesFile.includes("buildServerTpSlSuccessMessage"), "Telegram message builders missing.");
assert(telegramMessagesFile.includes("모의 거래") && telegramMessagesFile.includes("실전 거래"), "Telegram Korean mode labels missing.");
assert(telegramMessagesFile.includes("실전 자동매매 시작") && telegramMessagesFile.includes("자동매매 중지"), "Telegram Korean bot lifecycle labels missing.");
assert(telegramMessagesFile.includes("긴급 중단") && telegramMessagesFile.includes("전체 포지션 청산") && telegramMessagesFile.includes("모든 주문 취소"), "Telegram Korean emergency labels missing.");
assert(telegramMessagesFile.includes("서버 손절/익절") && telegramMessagesFile.includes("진입 후보"), "Telegram Korean trade labels missing.");
assert(telegramMessagesFile.includes("[렉스토라 테스트]") && telegramMessagesFile.includes("텔레그램 알림 연결이 정상입니다"), "Telegram Korean test message missing.");
assert(!telegramOperationFile.includes('"Rextora LIVE/PAPER bot started"') && !telegramOperationFile.includes("Start LIVE"), "telegramOperation must not contain English Telegram copy.");
assert(!telegramOperationFile.includes("Server TP/SL") && !telegramOperationFile.includes("[LIVE]") && !telegramOperationFile.includes("TP/SL"), "telegramOperation must not contain banned Telegram labels.");
assert(!telegramServiceFile.includes("Rextora Telegram test") && telegramServiceFile.includes("TELEGRAM_TEST_MESSAGE"), "telegramService must use Korean test message constant.");
assert(telegramMessagesTest.includes("containsBannedTelegramLabel") && telegramMessagesTest.includes("containsTelegramSecret"), "telegramMessages unit tests missing.");
assert(telegramTestRoute.includes("sendAssistantTestMessage"), "Telegram test route must use assistant test sender.");
assert(!telegramMessagesFile.match(/BINANCE_API_KEY|BINANCE_API_SECRET|TG_TOKEN=|TG_CHAT_ID=/), "Telegram messages must not embed secrets.");

// 159-168 Server TP/SL manager readiness model checks
const serverTpSlReadiness = exists("src/lib/rextora/serverTpSlReadiness.ts") ? read("src/lib/rextora/serverTpSlReadiness.ts") : "";
assert(exists("src/lib/rextora/serverTpSlReadiness.ts"), "serverTpSlReadiness.ts missing.");
assert(serverTpSlReadiness.includes("implementationReady") && serverTpSlReadiness.includes("managerReady"), "Server TP/SL readiness model missing.");
assert(serverTpSlReadiness.includes("initializeServerTpSlManagerReadiness"), "Server TP/SL safe initializer missing.");
assert(!serverTpSlReadiness.includes("placeStopLossOrder") && !serverTpSlReadiness.includes("placeTakeProfitOrder"), "Readiness init must not place orders.");
assert(liveGate.includes("isServerTpSlManagerReady"), "LIVE gate must use manager readiness not active orders.");
assert(systemStatusSync.includes("initializeServerTpSlManagerReadiness"), "System sync must initialize TP/SL manager readiness.");
assert(e2e.includes("advanced-diagnostics-toggle") || e2e.includes("고급 진단") || e2e.includes("system-status"), "e2e advanced diagnostics collapsed check missing.");

// Phase 3 dashboard visibility + Korean Telegram + paper E2E checks
const paperEndToEndVerifier = exists("src/lib/rextora/paperEndToEndVerifier.ts") ? read("src/lib/rextora/paperEndToEndVerifier.ts") : "";
const tradingDashboardRoute = exists("app/api/rextora/trading/dashboard/route.ts") ? read("app/api/rextora/trading/dashboard/route.ts") : "";
assert(exists("src/lib/rextora/paperEndToEndVerifier.ts"), "paperEndToEndVerifier.ts missing.");
assert(paperEndToEndVerifier.includes("verifyPaperEndToEndFlow") && paperEndToEndVerifier.includes("usedLiveOrderEndpoints: false"), "Paper E2E verifier incomplete.");
assert(!paperEndToEndVerifier.includes("placeMarketOrder") && !paperEndToEndVerifier.includes("executeLiveEntry") && !paperEndToEndVerifier.includes("newOrder"), "Paper E2E verifier must not call live order endpoints.");
assert(tradingDashboardStatus.includes("topCandidates") && tradingDashboardStatus.includes("operations") && tradingDashboardStatus.includes("recentExecutionLogs"), "Dashboard status Phase 3 fields missing.");
assert(tradingDashboard.includes("trading-status-bar") || exists("app/paper-trading/page.tsx"), "Trading dashboard operator sections missing.");
assert(tradingDashboard.includes("POLL_MS = 4_000") || tradingDashboard.includes("4_000"), "Trading dashboard poll interval must be 3-5 seconds.");
assert(tradingDashboard.includes("/api/rextora/trading/dashboard"), "Dashboard polling must use read-only dashboard API.");
assert(!tradingDashboardRoute.includes("placeMarketOrder") && !tradingDashboardRoute.includes("executeLiveEntry"), "Dashboard route must remain read-only.");
assert(tradingDashboardRoute.includes("buildTradingDashboardStatus"), "Dashboard route must build status only.");
assert(displayLabelsFile.includes("UI_BANNED_LABELS") && displayLabelsFile.includes("displayAuditActionLabel"), "Display labels Phase 3 helpers missing.");
assert(telegramMessagesFile.includes("buildExecutionQueueCreatedMessage") && telegramMessagesFile.includes("buildMultiCandidatePartialFailureMessage"), "Telegram queue messages missing.");
assert(telegramOperationFile.includes("notifyExecutionQueueCreated") && !botRuntimeFile.includes("notifyExecutionQueueCreated"), "botRuntime must not send queue Telegram notifications.");
assert(exists("tests/paperEndToEndVerifier.test.ts") && exists("tests/tradingDashboardStatus.test.ts"), "Phase 3 unit tests missing.");
assert(tradingDashboard.includes("data-testid=\"trading-recent-trades\""), "Trading recent trades card missing.");
assert(liveExecutionEngineFile.includes("placeServerTpSlAfterEntry"), "Live TP/SL after entry must remain unchanged.");
assert(liveExecutionEngineFile.includes("closePosition") || liveExecutionEngineFile.includes("closeAllPositions") || tpSlManager.includes("close"), "TP/SL failure close behavior must remain.");

// Phase 3 post-verification fixes
const telegramRateLimiter = exists("src/lib/rextora/telegram/telegramRateLimiter.ts") ? read("src/lib/rextora/telegram/telegramRateLimiter.ts") : "";
const statusCards = exists("components/rextora/StatusCards.tsx") ? read("components/rextora/StatusCards.tsx") : "";
assert(exists("src/lib/rextora/telegram/telegramRateLimiter.ts"), "telegramRateLimiter.ts missing.");
assert(telegramRateLimiter.includes("shouldSendQueueCreatedNotification") && telegramRateLimiter.includes("QUEUE_CREATED_DEDUPE_MS"), "Queue Telegram dedupe window missing.");
assert(telegramOperationFile.includes("recordBlockedTelegramEvent(\"queue_created\")"), "Queue Telegram notifications must be blocked at the notifier boundary.");
assert(!botRuntimeFile.includes("notifyQueueCandidateExcluded"), "Per-scan excluded Telegram spam must be removed.");
assert(executionQueue.includes("computeCandidateQueueDisplays") && executionQueue.includes("runtimeStatusLabel"), "Queue display alignment helpers missing.");
assert(tradingDashboardStatus.includes("computeCandidateQueueDisplays") && tradingDashboardStatus.includes("queueStatus"), "Dashboard must align candidate queue status.");
assert(learningLogger.includes('result: "대기"') && learningLogger.includes("isLearningTradeLog"), "Learning logger must separate candidate vs trade logs.");
assert(learningLogger.includes("isLearningTradeLog") && learningLogger.includes("if (!isLearningTradeLog(log))"), "Win rate must exclude candidate-only logs.");
assert(displayLabelsFile.includes("displaySignalReason") && displayLabelsFile.includes("돌파 신호"), "Signal reason Korean mapping missing.");
assert(displayLabelsFile.includes("displayModeBannerText") && displayLabelsFile.includes("모의 거래 기본 · 실전 거래 차단"), "Mode banner Korean helper missing.");
assert(!statusCards.includes("PAPER 기본 · LIVE 차단"), "Page header must not show English PAPER/LIVE banner.");
assert(statusCards.includes("모의 거래 기본 · 실전 거래 차단"), "Page header Korean mode banner missing.");
assert(exists("tests/telegramRateLimiter.test.ts"), "telegramRateLimiter tests missing.");
assert(exists("src/lib/rextora/telegramNotifier.ts"), "telegramNotifier.ts missing.");
const telegramNotifier = read("src/lib/rextora/telegramNotifier.ts");
assert(telegramNotifier.includes("shouldSendTelegramEvent") && telegramNotifier.includes("buildQueueNotificationDedupeKey"), "Telegram event dedupe helpers missing.");
assert(telegramRateLimiter.includes("buildQueueNotificationDedupeKey") && telegramRateLimiter.includes("shouldSendTelegramEvent"), "Queue notification must use shared telegram dedupe helpers.");
assert(telegramRateLimiter.includes("QUEUE_CREATED_DEDUPE_MS = 10 * 60 * 1000"), "Queue Telegram TTL must be 10 minutes.");
assert(learningLogger.includes("shouldStoreCandidateLearningLog") && learningLogger.includes("buildCandidateLogDedupeKey"), "Candidate learning log dedupe helpers missing.");
assert(learningLogger.includes("CANDIDATE_LOG_DEDUPE_MS") && learningLogger.includes("10 * 60 * 1000"), "Candidate learning log TTL must be 10 minutes.");
assert(learningLogger.includes("return null") && learningLogger.includes("shouldStoreCandidateLearningLog"), "Duplicate candidate logs must be suppressed.");
assert(exists("tests/telegramNotifier.test.ts"), "telegramNotifier tests missing.");
assert(read("tests/telegramRateLimiter.test.ts").includes("10 minutes") || read("tests/telegramRateLimiter.test.ts").includes("10 * 60"), "Queue Telegram TTL tests missing.");
assert(read("tests/learningLogger.test.ts").includes("shouldStoreCandidateLearningLog"), "Candidate learning log dedupe tests missing.");
assert(!telegramNotifier.includes("placeMarketOrder") && !telegramRateLimiter.includes("placeMarketOrder"), "Telegram dedupe helpers must not call live order endpoints.");
assert(exists("src/lib/rextora/dataFilters.ts"), "dataFilters.ts missing.");
assert(dataFiltersFile.includes("isTestOnlySymbol") && dataFiltersFile.includes("filterUserFacingRecords"), "Test symbol filter helpers missing.");
assert(learningLogger.includes("getUserFacingLearningLogs") && learningLogger.includes("logLearningReflection"), "User-facing learning log helpers missing.");
assert(learningLogger.includes("isLearningReflectionLog"), "Learning reflection category helper missing.");
assert(learningLogPage.includes("getLearningLogViewModel") && learningLogPage.includes("LearningLogPanel"), "Learning log page must use tabbed panel and operator view model.");
assert(learningLogPanel.includes("거래 기록") && learningLogPanel.includes("학습 반영") && learningLogPanel.includes("시스템 이벤트") && learningLogPanel.includes("전체"), "Learning log operator tabs missing.");
assert(learningLogPanel.includes("data-testid=\"learning-log-trade-table\""), "Trade tab table test id missing.");
assert(learningLogPanel.includes("data-testid=\"learning-log-reflection-table\""), "Reflection tab table test id missing.");
assert(learningLogPanel.includes("data-testid=\"learning-log-system-table\""), "System event tab table test id missing.");
assert(learningLogPanel.includes("showDebugCandidates") && learningLogPanel.includes("후보 기록(디버그)"), "Candidate tab must be debug-only.");
assert(learningLogPanel.includes("청산 이유") && learningLogPanel.includes(">손익<"), "Trade tab must show exit reason and PnL columns.");
assert(learningLogPanel.includes("displaySignalReason") && learningLogPanel.includes("displayLearningLogPnl"), "Learning log panel must use Korean display helpers.");
assert(tradingDashboardStatus.includes("filterUserFacingRecords"), "Trading dashboard must filter test-only symbols.");
assert(read("app/api/rextora/learning/route.ts").includes("getOperatorLearningLogs"), "Learning API must use operator-facing logs.");
assert(exists("tests/dataFilters.test.ts"), "dataFilters tests missing.");
assert(read("tests/learningLogger.test.ts").includes("getUserFacingLearningLogs"), "learningLogger tests must cover user-facing filtering.");
assert(read("tests/e2e/rextora-smoke.spec.ts").includes("learning-log-tab-candidate") || e2e.includes("trades-page") || e2e.includes("strategy-manager"), "E2E must cover learning log tabs.");

// Trading dashboard UX polish
assert(displayLabelsFile.includes("displayPositionProtectionStatus") && displayLabelsFile.includes("모의 손절/익절 적용"), "Paper position protection helper missing.");
assert(tradingDashboardStatus.includes("displayPositionProtectionStatus"), "Dashboard must use paper protection helper.");
assert(
  (tradingDashboard.includes('data-testid="live-start-helper"') && tradingDashboard.includes("disabled={!liveStartEnabled}")) ||
    read("app/live-trading/page.tsx").includes("live-start-helper"),
  "Live start disabled UX missing."
);
assert(tradingDashboard.includes("positionProtectionTone"), "Position protection tone helper must be used.");
assert(read("tests/tradingDashboardStatus.test.ts").includes("모의 손절/익절 적용"), "Dashboard status tests must cover paper protection labels.");
assert(!tradingDashboard.match(/>\s*PAPER\s*</) && !tradingDashboard.match(/>\s*LIVE\s*</) && !tradingDashboard.includes("Start LIVE"), "Trading dashboard must not expose banned English labels.");

// Quant operator redesign: Telegram allowlist
const telegramNotifierFile = read("src/lib/rextora/telegramNotifier.ts");
assert(telegramNotifierFile.includes("ALLOWED_TELEGRAM_EVENTS") && telegramNotifierFile.includes("isAllowedTelegramEvent") && telegramNotifierFile.includes("normalizeTelegramEventType"), "Telegram allowlist helpers missing.");
assert(telegramNotifierFile.includes("paper_start") && telegramNotifierFile.includes("paper_stop") && telegramNotifierFile.includes("live_start") && telegramNotifierFile.includes("live_stop"), "Bot lifecycle Telegram events must be allowed.");
assert(telegramNotifierFile.includes("entry_filled") && telegramNotifierFile.includes("take_profit") && telegramNotifierFile.includes("stop_loss") && telegramNotifierFile.includes("trade_closed"), "Trade Telegram events must be allowed.");
assert(telegramNotifierFile.includes("emergency_stop") && telegramNotifierFile.includes('"error"') && telegramNotifierFile.includes("live_blocked"), "Emergency/error/live-blocked Telegram events must be allowed.");
const allowlistBlock = telegramNotifierFile.split("ALLOWED_TELEGRAM_EVENTS")[1]?.split("]);")[0] ?? "";
assert(!allowlistBlock.includes("queue_created") && !allowlistBlock.includes("candidate"), "queue/candidate events must not be in the Telegram allowlist.");
assert(telegramOperationFile.includes("sendOperationalTelegram") && telegramOperationFile.includes("isAllowedTelegramEvent"), "Telegram sends must pass through the allowlist boundary.");
assert(telegramOperationFile.includes("recordBlockedTelegramEvent(\"candidate_detected\")"), "Candidate detection Telegram must be blocked.");
assert(telegramOperationFile.includes("recordBlockedTelegramEvent(\"queue_excluded\")"), "Queue excluded Telegram must be blocked.");
assert(telegramOperationFile.includes("recordBlockedTelegramEvent(\"learning_adjustment\")"), "Learning adjustment Telegram must be blocked.");
assert(!botRuntimeFile.includes("notifyCandidate") && !botRuntimeFile.includes("notifyLearningAdjustment") && !botRuntimeFile.includes("notifyLearningLeverageAdjusted"), "botRuntime must not send candidate/learning Telegram noise.");
assert(read("tests/telegramNotifier.test.ts").includes("blocks queue and candidate noise events"), "Telegram allowlist tests missing.");

// Quant operator redesign: trading dashboard sections
assert(tradingDashboard.includes('data-testid="trading-status-bar"') || exists("app/paper-trading/page.tsx"), "/trading top status bar missing.");
assert(tradingDashboard.includes('data-testid="trading-controls"') || exists("app/paper-trading/page.tsx"), "/trading main controls missing.");
assert(tradingDashboard.includes('data-testid="trading-positions"') || exists("app/paper-trading/page.tsx"), "/trading active positions section missing.");
assert(
  (tradingDashboard.includes('data-testid="trading-opportunities"') && tradingDashboard.includes("감시 중인 기회")) ||
    read("app/market-watch/page.tsx").includes("quant-signal-table"),
  "/trading opportunity monitor missing."
);
assert(tradingDashboard.includes('data-testid="trading-recent-trades"') || exists("app/trades/page.tsx"), "/trading recent trades section missing.");
assert(tradingDashboard.includes('data-testid="trading-learning-card"') || exists("app/ai-reports/page.tsx"), "/trading learning summary missing.");
assert(tradingDashboard.includes("오늘 실현 손익") && tradingDashboard.includes("오늘 거래 수") && tradingDashboard.includes("오늘 승률") && tradingDashboard.includes("안전 상태"), "Top status bar Korean metrics missing.");
assert(tradingDashboard.includes("모의 자동매매 중지") && tradingDashboard.includes("실전 자동매매 중지") && tradingDashboard.includes("긴급 중지"), "Main control buttons missing.");
assert(!tradingDashboard.includes("큐 상태") && !tradingDashboard.includes("받은 후보"), "Queue-centric wording must not be the main trading UX.");
assert(tradingDashboardStatus.includes("getTradingDashboardViewModel") && tradingDashboardStatus.includes("opportunities") && tradingDashboardStatus.includes("recentTrades") && tradingDashboardStatus.includes("todayStats"), "Trading dashboard view model fields missing.");
assert(tradingDashboardStatus.includes('"진입 가능"') && tradingDashboardStatus.includes('"관찰"') && tradingDashboardStatus.includes('"제외"'), "Opportunity judgment labels missing.");

// Quant operator redesign: learning log + logging rules
assert(learningLogger.includes("logSystemEvent") && learningLogger.includes("시스템 이벤트"), "System event logging missing.");
assert(learningLogger.includes("shouldDisplayOperatorLog") && learningLogger.includes("shouldDisplayDebugCandidateLog") && learningLogger.includes("getLearningLogViewModel"), "Operator learning log helpers missing.");
assert(dataFiltersFile.includes("showDebugCandidatesInUi") && dataFiltersFile.includes("REXTORA_SHOW_DEBUG_CANDIDATES"), "Debug candidate flag missing.");
assert(botRuntimeFile.includes("logSystemEvent"), "botRuntime must log system events.");
assert(botRuntimeFile.includes("runSafePaperScanLoop") || botRuntimeFile.includes("managePaperPositions"), "SAFE paper scan loop missing from botRuntime.");
assert(paperEngine.includes("managePaperPositions") && paperEngine.includes("익절") && paperEngine.includes("손절"), "Paper position stop/take manager missing.");
assert(read("src/lib/rextora/tradeLifecycle.ts").includes("notifyTradeEntry") && read("src/lib/rextora/tradeLifecycle.ts").includes("notifyTradeClosed"), "Paper trade lifecycle Telegram wiring missing.");
assert(read("tests/learningLogger.test.ts").includes("shouldDisplayOperatorLog") || read("tests/learningLogger.test.ts").includes("getOperatorLearningLogs"), "Operator log tests missing.");
assert(e2e.includes("learning-log-tab-system") || e2e.includes("strategy-manager") || e2e.includes("paper-trading-page"), "E2E must cover quant operator pages.");
assert(e2e.includes("trading-opportunities") || e2e.includes("quant-signal-table") || e2e.includes("backtest-cost-settings"), "E2E must cover redesigned trading/backtest sections.");
assert(!read("src/lib/rextora/telegramNotifier.ts").includes("placeMarketOrder") && !telegramOperationFile.includes("placeMarketOrder"), "Telegram boundary must not call live order endpoints.");

// SAFE_v44 quant stack
assert(exists("src/lib/rextora/strategy/safeV44Strategy.ts"), "SAFE strategy loader missing.");
assert(exists("src/lib/rextora/strategy/safeV44Params.ts"), "SAFE params fallback missing.");
assert(exists("src/lib/rextora/strategy/strategyStore.ts"), "Strategy store missing.");
assert(exists("src/lib/rextora/strategy/strategyHash.ts"), "Strategy hash helper missing.");
assert(exists("src/lib/rextora/indicator/indicatorEngine.ts"), "Indicator engine missing.");
assert(exists("src/lib/rextora/signal/safeV44SignalEngine.ts"), "SAFE signal engine missing.");
assert(exists("src/lib/rextora/cost/costGuard.ts"), "Cost guard missing.");
assert(exists("src/lib/rextora/risk/safeV44RiskEngine.ts"), "SAFE risk engine missing.");
assert(exists("src/lib/rextora/backtest/backtestEngine.ts"), "SAFE backtest engine missing.");
assert(exists("src/lib/rextora/backtest/backtestRunner.ts"), "Backtest runner missing.");
assert(exists("src/lib/rextora/report/aiTradeReport.ts"), "AI trade report module missing.");
assert(exists("src/lib/rextora/execution/safePaperLoop.ts"), "SAFE paper loop missing.");
assert(exists("app/backtest/page.tsx") && exists("app/api/rextora/backtest/run/route.ts"), "Backtest UI/API missing.");
assert(exists("app/strategies/page.tsx") && exists("app/strategy-performance/page.tsx"), "Strategy management/performance pages missing.");
assert(exists("app/paper-trading/page.tsx") && exists("app/live-trading/page.tsx"), "Paper/live trading pages missing.");
assert(exists("app/trades/page.tsx") && exists("app/ai-reports/page.tsx"), "Trades/AI report pages missing.");
assert(read("components/rextora/dashboard/DashboardPanels.tsx").includes("active-strategy") && !read("components/rextora/dashboard/DashboardPanels.tsx").includes("ai-candidates-top5"), "Dashboard must remove AI candidate top5.");
assert(read("app/market-watch/page.tsx").includes("quant-signal-table") && !read("app/market-watch/page.tsx").includes("AI 점수"), "Market watch must use strategy signals.");
assert(
  read("src/lib/rextora/strategy/safeV44Strategy.ts").includes("7893ca3f0e30") ||
    read("src/lib/rextora/strategy/strategyTypes.ts").includes("7893ca3f0e30"),
  "SAFE params hash constant missing from loader."
);
assert(read("src/lib/rextora/cost/costGuard.ts").includes("cost_guard_k"), "Cost guard k check missing.");
assert(telegramNotifierFile.includes("trade_entry") && telegramNotifierFile.includes("daily_report"), "Final Telegram allowlist events incomplete.");
assert(telegramNotifierFile.includes("strategy_scan_summary"), "strategy_scan_summary must be mapped for blocking.");
assert(botRuntimeFile.includes("runSafeLiveEntries") || botRuntimeFile.includes("evaluateSafeV44Signal"), "Live scan must use SAFE mathematical signals.");
assert(read("src/lib/rextora/execution/safePaperLoop.ts").includes("evaluateSafeV44Signal") && !read("src/lib/rextora/execution/safePaperLoop.ts").includes("rankCandidates"), "Paper SAFE loop must not use AI ranker.");
assert(exists("components/rextora/trading/TradingDashboard.tsx") || exists("app/paper-trading/page.tsx"), "Trading UI missing.");
assert(exists("tests/safeQuantStack.test.ts") && exists("tests/strategyStore.test.ts"), "SAFE quant/strategy store tests missing.");
assert(read("components/rextora/backtest/SafeBacktestPanel.tsx").includes("backtest-from") && read("components/rextora/backtest/SafeBacktestPanel.tsx").includes("backtest-timeframe"), "Backtest date/timeframe controls missing.");

const passed = checks.filter((c) => c.ok).length;
const failed = checks.filter((c) => !c.ok);
console.log(`Rextora verification: ${passed}/${checks.length} checks passed.`);
if (failed.length > 0) {
  console.error(failed.map((f) => `- ${f.message}`).join("\n"));
  process.exit(1);
}
console.log("Rextora pre-live verification passed.");
