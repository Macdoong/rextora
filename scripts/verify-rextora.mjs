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
const marketSummary = exists("components/rextora/MarketWatcherSummary.tsx") ? read("components/rextora/MarketWatcherSummary.tsx") : "";
const learningLogPage = exists("app/learning-log/page.tsx") ? read("app/learning-log/page.tsx") : "";
const defaultSettings = exists("src/lib/rextora/settings/defaultSettings.ts") ? read("src/lib/rextora/settings/defaultSettings.ts") : "";
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
assert(sidebar.includes("멀티코인 감시") && sidebar.includes("AI 후보 랭킹"), "Sidebar nav missing.");
assert(dashboardPage.includes('data-layout="dashboard-compact"'), "Dashboard compact layout missing.");
assert(telegramAssistant.includes("formatCandidateAlert"), "Telegram assistant missing.");
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
assert(e2e.includes("runtime-meta") || e2e.includes("panel-skeleton") || e2e.includes("market-refresh"), "e2e perf/loading checks missing.");

// 58-69 Korean beginner UI checks
assert(settingsTabs.includes("displaySettingsFieldLabel") && !settingsTabs.includes("text-slate-400\">{key}"), "Settings UI must not expose raw variable labels.");
assert(exists("src/lib/rextora/displayLabels.ts"), "displayLabels.ts missing.");
assert(displayLabelsFile.includes("기본 거래 모드") && displayFormatFile.includes("roundTo"), "displayLabels/displayFormat beginner helpers missing.");
assert(settingsPage.includes("기본 거래 모드") && settingsPage.includes("환경변수 상태"), "Settings page Korean labels missing.");
assert(systemStatusPanel.includes("실전 거래 준비 상태"), "System Status readiness card missing.");
assert(tradingPanels.includes("PAPER 모의 거래") || tradingPanels.includes("모의 거래"), "Trading beginner helper text missing.");
assert(marketSummary.includes("formatPercent") || marketSummary.includes("formatVolumeChange"), "Market Watch formatting helpers missing.");
assert(learningLogPage.includes("displayLabel") && displayLabelsFile.includes("breakout"), "Learning Log signal translation missing.");
assert(defaultSettings.includes('defaultMode: "PAPER"') || seeds.includes('mode: "PAPER"'), "PAPER default setting missing.");
assert(liveGate.includes("LIVE_BLOCKED") || serverTpSl.includes("LIVE_BLOCKED"), "LIVE blocked gate status missing.");
assert(!settingsPage.includes("BINANCE_API_KEY=") && !settingsTabs.includes("process.env.BINANCE"), "Secrets must not be displayed in settings UI.");
assert(binanceTrade.includes("PAPER must NEVER call Binance trade endpoints"), "PAPER trade block must remain unchanged.");

// 70-80 Final polish checks (11 user-spec verification items)
assert(!settingsTabs.includes(">defaultMode<") && !settingsPage.includes(">defaultMode<"), "Settings must not show raw defaultMode label.");
assert(!settingsTabs.includes(">liveTradingEnabled<") && !settingsTabs.includes(">manualLiveConfirmationRequired<"), "Settings must not show raw liveTradingEnabled/manualLiveConfirmationRequired.");
assert(!settingsTabs.includes(">testnetMode<") && !settingsTabs.includes(">positionMode<") && !settingsTabs.includes(">oneWayMode<") && !settingsTabs.includes(">marginType<"), "Settings must not show raw trading field names.");
assert(systemStatusPanel.includes("차단 이유") && systemStatusPanel.includes("다음 조치") && systemStatusPanel.includes("실전 거래 가능 여부"), "System Status readiness sections missing.");
assert(!dashboardPanels.includes("source=bot-runtime") && !dashboardPanels.includes("cached=true") && !dashboardPanels.includes("heartbeat"), "Dashboard must not show raw debug metadata.");
assert(tradingPanels.includes("PAPER 모의 거래") && tradingPanels.includes("LIVE 실전 거래") && tradingPanels.includes('displayLabel("SERVER REQUIRED")'), "Trading page Korean mode helpers missing.");
assert(displayFormatFile.includes("formatRuntimeMeta") && !systemStatusPage.includes("scan=in-progress") && !systemStatusPage.includes("lastScan="), "System Status debug metadata must be Korean.");
assert(!learningLogPage.includes(">breakout<") && !learningLogPage.includes(">overheated_zone<") && !learningLogPage.includes(">volume_spike<") && displayLabelsFile.includes('open: "진행 중"'), "Learning Log must translate signal/result values.");
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
assert(liveGate.includes("LIVE 실전 거래 설정이 꺼져 있습니다"), "Korean LIVE setting block reason missing.");
assert(liveGate.includes("allowLiveTrading") || defaultSettings.includes("allowLiveTrading"), "allowLiveTrading setting missing.");
assert(defaultSettings.includes("operatorLiveStartRequired: true"), "operatorLiveStartRequired default missing.");
assert(defaultSettings.includes("closePositionIfTpSlFails: true"), "closePositionIfTpSlFails default missing.");
assert(liveExecutionEngineFile.includes("placeServerTpSlAfterEntry"), "liveExecutionEngine must call server TP/SL after entry.");
assert(liveExecutionEngineFile.includes("closeLivePositionAfterTpSlFailure") || liveExecutionEngineFile.includes("closePosition"), "liveExecutionEngine must close position if TP/SL fails.");
assert(botRuntime.includes("startLiveBotRuntime"), "LIVE bot runtime start missing.");
assert(displayLabelsFile.includes("displayBlockReason"), "displayBlockReason helper missing.");
assert(
  exists("components/rextora/LiveReadinessPanel.tsx") && liveReadinessPanel.includes("remainingBlocks"),
  "Live readiness panel must show remaining block reasons for operators."
);
assert(settingsPage.includes("실전 연결 준비 순서"), "Settings connection prep guide card missing.");
assert(systemStatusPanel.includes("Binance 연결 진단") && systemStatusPanel.includes("Binance 연결"), "System Status connection diagnostics card missing.");
assert(systemStatusPanel.includes("실전 거래 가능 여부"), "System Status live readiness must show tradability.");
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
assert(e2e.includes("binance-diagnostics-refresh") || e2e.includes("Binance 연결 다시 점검"), "e2e binance diagnostics check missing.");
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
assert(settingsPage.includes("LiveReadinessPanel") && systemStatusPage.includes("LiveReadinessPanel"), "Settings and System Status must show LIVE readiness panel.");
assert(!liveReadinessPanel.includes("전략 실전 승인") && !liveReadinessPanel.includes("strategy-live-approval-card"), "Strategy approval UI must be removed.");
assert(!liveReadinessPanel.includes("실전 확인 문구") && !liveReadinessPanel.includes("live-confirmation-card"), "Manual confirmation UI must be removed.");
assert(liveReadinessChecklist.includes("buildFinalLiveReadinessChecklist") && liveReadinessChecklist.includes("서버 TP/SL"), "Operational LIVE readiness checklist builder missing.");
assert(settingsTabs.includes("serverTpSlRequired") || defaultSettings.includes("serverTpSlRequired"), "Server TP/SL setting must remain configurable.");
assert(liveGate.includes("LIVE 실전 거래 설정이 꺼져 있습니다") && liveGate.includes("서버 TP/SL 보호가 아직 준비되지 않았습니다"), "Operational Korean LIVE block reasons missing.");
assert(!liveReadinessRoute.includes("binanceTrade") && !liveReadinessRoute.includes("newOrder"), "Readiness route must not place orders.");
assert(tradingActionClient.includes("Start LIVE") && tradingActionClient.includes("live-trading-panel"), "Trading LIVE control panel missing.");
assert(e2e.includes("live-readiness-panel") || e2e.includes("실전 실행 상태"), "e2e simplified LIVE execution status check missing.");
assert(defaultSettings.includes('defaultMode: "PAPER"') && defaultSettings.includes("allowLiveTrading: false"), "PAPER default and LIVE disabled must remain.");

// 141-158 LIVE readiness UI consistency checks
const liveChecklistDisplay = exists("src/lib/rextora/liveChecklistDisplay.ts") ? read("src/lib/rextora/liveChecklistDisplay.ts") : "";
const tradingPage = exists("app/trading/page.tsx") ? read("app/trading/page.tsx") : "";
assert(exists("src/lib/rextora/liveChecklistDisplay.ts"), "liveChecklistDisplay.ts missing.");
assert(!tradingPanels.includes("LIVE 안전 체크리스트") && !tradingPanels.includes("live-safety-checklist"), "Legacy trading LIVE checklist must be removed.");
assert(tradingPage.includes("LiveReadinessPanel") && !tradingPage.includes("LiveSafetyChecklist"), "Trading page must use unified LIVE readiness panel only.");
assert(liveReadinessChecklist.includes("order_permission") && liveReadinessChecklist.includes("주문 권한"), "Unified checklist must include order permission state.");
assert(!liveReadinessChecklist.includes("REXTORA_LIVE_APPROVED=false") && !liveReadinessChecklist.includes("REXTORA_LIVE_CONFIRMATION_TEXT"), "Readiness checklist must not expose raw env var names.");
assert(!liveReadinessRoute.includes("REXTORA_LIVE_CONFIRMATION_TEXT") && !liveReadinessPanel.includes("REXTORA_LIVE"), "Live readiness UI must not expose raw env var names.");
assert(liveGate.includes("서버 TP/SL 보호가 아직 준비되지 않았습니다"), "Updated server TP/SL block reason missing.");
assert(systemStatusPanel.includes("매니저 상태") && systemStatusSync.includes("managerStatusLabel"), "Server TP/SL manager readiness display missing.");
assert(e2e.includes("live-trading-panel") || e2e.includes("Start LIVE"), "e2e LIVE trading control panel check missing.");
assert(e2e.includes("not.toContainText(\"REXTORA_LIVE_APPROVED\")"), "e2e must reject raw REXTORA_LIVE_APPROVED in UI.");

// 159-168 Server TP/SL manager readiness model checks
const serverTpSlReadiness = exists("src/lib/rextora/serverTpSlReadiness.ts") ? read("src/lib/rextora/serverTpSlReadiness.ts") : "";
assert(exists("src/lib/rextora/serverTpSlReadiness.ts"), "serverTpSlReadiness.ts missing.");
assert(serverTpSlReadiness.includes("implementationReady") && serverTpSlReadiness.includes("managerReady"), "Server TP/SL readiness model missing.");
assert(serverTpSlReadiness.includes("initializeServerTpSlManagerReadiness"), "Server TP/SL safe initializer missing.");
assert(!serverTpSlReadiness.includes("placeStopLossOrder") && !serverTpSlReadiness.includes("placeTakeProfitOrder"), "Readiness init must not place orders.");
assert(liveGate.includes("isServerTpSlManagerReady"), "LIVE gate must use manager readiness not active orders.");
assert(systemStatusSync.includes("initializeServerTpSlManagerReadiness"), "System sync must initialize TP/SL manager readiness.");
assert(e2e.includes("live-readiness-server_tpsl") || e2e.includes("tpsl-readiness-detail"), "e2e TP/SL readiness coverage missing.");

const passed = checks.filter((c) => c.ok).length;
const failed = checks.filter((c) => !c.ok);
console.log(`Rextora verification: ${passed}/${checks.length} checks passed.`);
if (failed.length > 0) {
  console.error(failed.map((f) => `- ${f.message}`).join("\n"));
  process.exit(1);
}
console.log("Rextora pre-live verification passed.");
