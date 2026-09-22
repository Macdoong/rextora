import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  paperSessionVisualState,
  resolveExplicitCurrentStrategy,
} from "../src/lib/rextora/ui/operatorCurrentStrategy";
import {
  freshnessTone,
  hasRealTimeSeries,
  parseQueueVisualState,
  resolveSystemNodeTone,
} from "../components/rextora/dashboard/OperatorCenterVisuals";
import {
  formatDisplayPrice,
  formatLeverageMultiple,
} from "../src/lib/rextora/displayFormat";
import {
  formatOperatorQueueCopy,
  formatTodayTradingCostLine,
  hasOperatorSearchResult,
  hasRelevantPaperSession,
  normalizeOperatorQueueCopy,
  resolveOperatorRiskGaugeTone,
  shouldShowOperatorPrimaryAction,
} from "../src/lib/rextora/ui/operatorCenterPresentation";
import {
  OPERATOR_EMPTY,
  OPERATOR_STATUS,
} from "../src/lib/rextora/ui/operatorTerminology";

const ROOT = process.cwd();
function read(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("operator center v2 and shell motion/icons", () => {
  it("renders the approved KPI set and empty strategy state", () => {
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).toContain("계좌 자산");
    expect(center).toContain("오늘 실현 손익");
    expect(center).toContain("미실현 손익");
    expect(center).toContain("오늘 거래");
    expect(center).toContain("오늘 승률");
    expect(center).toContain("모의매매 상태");
    expect(center).toContain("OPERATOR_EMPTY.strategy");
    expect(center).toContain("새 탐색 시작");
    expect(center).not.toContain("OPERATOR_LABEL.technicalDetail");
    expect(center).not.toContain("paramsHash");
    expect(center).not.toContain("SAFE_v44_i4060");
    expect(center).toContain("operator-execution-monitor");
    expect(center).toContain("operator-current-position");
    expect(center).toContain("승인 조건과 현재 차단 이유를 확인하세요.");
    expect(center).toContain("WinRateRing");
    expect(center).toContain("LimitGauge");
    expect(center).toContain("ScalarSignedBar");
    expect(center).toContain("PaperStateFlow");
  });

  it("1. no explicit strategy renders 선택된 전략이 없습니다.", () => {
    expect(
      resolveExplicitCurrentStrategy({
        paperName: "변동성 돌파 · 공격형",
        activeStrategyName: "변동성 돌파 · 공격형",
        researchName: "변동성 돌파 · 공격형",
      }),
    ).toBeNull();
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).toContain("resolveExplicitCurrentStrategy");
    expect(center).toContain("OPERATOR_EMPTY.strategy");
    expect(OPERATOR_EMPTY.strategy).toBe("선택된 전략이 없습니다.");
  });

  it("2. old Paper strategy does not become current strategy", () => {
    expect(
      resolveExplicitCurrentStrategy({
        paperName: "변동성 돌파 · 공격형",
        paperSessionStatus: "stopped",
      }),
    ).toBeNull();
    const resolver = read("src/lib/rextora/ui/operatorCurrentStrategy.ts");
    expect(resolver).toContain("void input.paperName");
    expect(resolver).toContain("void input.paperSessionStatus");
  });

  it("3. old research/search strategy does not become current strategy", () => {
    expect(
      resolveExplicitCurrentStrategy({
        researchName: "변동성 돌파 · 공격형",
        activeStrategyName: "변동성 돌파 · 공격형",
      }),
    ).toBeNull();
    const resolver = read("src/lib/rextora/ui/operatorCurrentStrategy.ts");
    expect(resolver).toContain("void input.researchName");
    expect(resolver).toContain("void input.activeStrategyName");
  });

  it("4. explicit selected strategy renders the selected name", () => {
    expect(
      resolveExplicitCurrentStrategy({
        pageContextStrategyName: "명시 선택 전략",
        pageContextStrategyId: "explicit-1",
        paperName: "변동성 돌파 · 공격형",
        researchName: "이전 탐색",
      }),
    ).toEqual({ name: "명시 선택 전략", id: "explicit-1" });
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).toContain("hasSelectedStrategy ? strategyName : OPERATOR_EMPTY.strategy");
  });

  it("5. ContextBar does not render duplicate anonymous 선택 없음 chips", () => {
    const ctx = read("components/rextora/shell/ContextBar.tsx");
    expect(ctx).toContain("OPERATOR_STATUS.noStrategy");
    expect(ctx).toContain("strategyChipLabel");
    expect(ctx).toContain("primarySymbolTimeframe?.trim()");
    expect(ctx).not.toMatch(/displayValue\(primaryStrategy\)/);
    expect(ctx).not.toMatch(/displayValue\(primarySymbolTimeframe\)/);
    expect(OPERATOR_STATUS.noStrategy).toBe("전략 없음");
    expect(OPERATOR_STATUS.unavailable).toBe("선택 없음");
  });

  it("6. technical hash remains absent from Operator Center", () => {
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).not.toContain("paramsHash");
    expect(center).not.toContain("7893ca3f0e30");
    expect(center).not.toContain("OPERATOR_LABEL.technicalDetail");
  });

  it("7. no SAFE fallback for current strategy", () => {
    expect(
      resolveExplicitCurrentStrategy({
        pageContextStrategyId: "SAFE_v44_i4060",
        pageContextStrategyName: "SAFE_v44_i4060",
      }),
    ).toBeNull();
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).not.toContain("SAFE_v44_i4060");
    expect(center).not.toContain("buildLockedSafeStrategy");
  });

  it("8. visual components receive only real data", () => {
    const visuals = read("components/rextora/dashboard/OperatorCenterVisuals.tsx");
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(visuals).toContain("hasRealTimeSeries");
    expect(visuals).toContain("Never fabricate a historical series");
    expect(center).toContain("LimitGauge current={risk?.usagePct}");
    expect(center).toContain("ScalarSignedBar value={unrealized}");
    expect(center).toContain("WinRateRing value={winRate} tradeCount={tradeCount}");
    expect(center).toContain("CountSegments value={data.status?.operations?.watchedSymbolCount}");
    expect(center).toContain("CandidateAvailability value={data.status?.operations?.eligibleCandidateCount}");
    expect(center).toContain("OccupancyIndicator");
    expect(center).toContain("FreshnessPulse updatedAt={data.status?.lastUpdatedAt}");
    expect(center).toContain("resolveSystemNodeTone");
    expect(hasRealTimeSeries([1])).toBe(false);
    expect(hasRealTimeSeries([1, 2])).toBe(true);
  });

  it("9. no fake generated historical series helper exists", () => {
    const visuals = read("components/rextora/dashboard/OperatorCenterVisuals.tsx");
    expect(visuals).not.toMatch(/fake(Historical)?Series/i);
    expect(visuals).not.toMatch(/generate.*(history|series)/i);
    expect(visuals).not.toContain("Math.random");
    expect(visuals).toContain("if (series.length < 2)");
  });

  it("10. reduced-motion support remains present", () => {
    const tokens = read("components/rextora/v3/tokens.css");
    const motion = read("components/rextora/v3/motion.css");
    const oc = read("components/rextora/v3/operator-center.css");
    expect(tokens).toContain("--v3-motion-fast: 160ms");
    expect(tokens).toContain("--v3-motion-base: 240ms");
    expect(tokens).toContain("--v3-motion-slow: 420ms");
    expect(tokens).toContain("cubic-bezier(0.22, 1, 0.36, 1)");
    expect(motion).toContain("prefers-reduced-motion");
    expect(motion).toContain("translateY(-2px)");
    expect(motion).toContain("scale(0.99)");
    expect(oc).toContain("prefers-reduced-motion");
    expect(oc).toContain("v3OcGaugeFill");
  });

  it("uses lucide nav icons on desktop, drawer, and bottom nav", () => {
    const sidebar = read("components/rextora/Sidebar.tsx");
    const lifecycle = read("components/rextora/shell/LifecycleNavigation.tsx");
    const icons = read("components/rextora/shell/NavIcons.tsx");
    expect(sidebar).toContain("NavIcon");
    expect(sidebar).not.toContain("NAV_ICO");
    expect(sidebar).toContain('id="menu"');
    expect(lifecycle).toContain("NavIcon");
    expect(icons).toContain("lucide-react");
    expect(icons).toContain("Gauge");
    expect(icons).toContain("Search");
    expect(icons).toContain("LineChart");
    expect(icons).toContain("Menu");
  });

  it("does not add a new icon dependency", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["lucide-react"]).toBeTruthy();
    expect(pkg.dependencies["react-icons"]).toBeUndefined();
    expect(pkg.dependencies["@heroicons/react"]).toBeUndefined();
  });

  it("maps paper session status to a compact visual state", () => {
    expect(paperSessionVisualState(null)).toBe("idle");
    expect(paperSessionVisualState("active")).toBe("running");
    expect(paperSessionVisualState("paused")).toBe("paused");
    expect(paperSessionVisualState("stopped")).toBe("ended");
  });

  it("1. DashboardPanels has no SAFE runtime fallback", () => {
    const panels = read("components/rextora/dashboard/DashboardPanels.tsx");
    expect(panels).not.toContain("SAFE_v44_i4060");
    expect(panels).not.toContain("7893ca3f0e30");
    expect(panels).toContain('value={strategy?.name ?? "—"}');
  });

  it("2. no dashboard runtime component falls back to SAFE_v44_i4060", () => {
    const files = [
      "components/rextora/dashboard/OperatorCenter.tsx",
      "components/rextora/dashboard/DashboardPanels.tsx",
      "components/rextora/dashboard/dashboardData.ts",
      "components/rextora/dashboard/LifecycleDashboard.tsx",
      "app/dashboard/page.tsx",
    ];
    for (const file of files) {
      expect(read(file)).not.toContain("SAFE_v44_i4060");
      expect(read(file)).not.toContain("7893ca3f0e30");
    }
  });

  it("3. missing strategy renders empty-state semantics", () => {
    expect(resolveExplicitCurrentStrategy({})).toBeNull();
    expect(OPERATOR_EMPTY.strategy).toBe("선택된 전략이 없습니다.");
    const panels = read("components/rextora/dashboard/DashboardPanels.tsx");
    expect(panels).toContain("setStrategy(null)");
  });

  it("4. market visuals use actual scalar/status data only", () => {
    expect(parseQueueVisualState("대기 중")).toBe("idle");
    expect(parseQueueVisualState("수신 2 · 대기 1 · 실행 0 · 완료 1")).toBe("waiting");
    expect(parseQueueVisualState("수신 2 · 대기 0 · 실행 1 · 완료 0")).toBe("running");
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).toContain("watchedSymbolCount");
    expect(center).toContain("eligibleCandidateCount");
    expect(center).toContain("openPositionCount");
  });

  it("5. freshness visual uses actual lastUpdatedAt", () => {
    expect(freshnessTone(null)).toBe("idle");
    expect(freshnessTone(new Date().toISOString())).toBe("ok");
    expect(freshnessTone(new Date(Date.now() - 30_000).toISOString())).toBe("warn");
    expect(freshnessTone(new Date(Date.now() - 120_000).toISOString())).toBe("bad");
    const visuals = read("components/rextora/dashboard/OperatorCenterVisuals.tsx");
    expect(visuals).toContain("Date.parse(updatedAt)");
  });

  it("6. system nodes use actual verified status fields", () => {
    expect(
      resolveSystemNodeTone({ kind: "execution", botStatusLabel: "대기 중" }),
    ).toBe("idle");
    expect(
      resolveSystemNodeTone({ kind: "execution", botStatusLabel: "실행 중" }),
    ).toBe("ok");
    expect(
      resolveSystemNodeTone({ kind: "execution", botStatusLabel: "오류" }),
    ).toBe("bad");
    expect(
      resolveSystemNodeTone({ kind: "api", loadError: "fail" }),
    ).toBe("bad");
    expect(
      resolveSystemNodeTone({ kind: "market" }),
    ).toBe("idle");
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).toContain("botStatusLabel");
    expect(center).toContain("queueStatusLabel");
    expect(center).toContain("loadError: data.error");
  });

  it("10. existing Live safety behavior is untouched in Operator Center", () => {
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).not.toMatch(/method:\s*"POST"/);
    expect(center).not.toContain("allowLiveTrading: true");
    expect(center).toContain("LIVE_DISABLED_LABEL");
    expect(center).toContain("LIVE_ORDERS_BLOCKED_LABEL");
  });

  it("mobile pipeline is a local horizontal snap track and desktop stays six columns", () => {
    const oc = read("components/rextora/v3/operator-center.css");
    const globals = read("app/globals.css");
    expect(oc).toContain("grid-template-columns: repeat(6, minmax(110px, 1fr))");
    expect(oc).toContain("grid-template-columns: repeat(6, minmax(130px, 1fr))");
    expect(oc).toContain("scroll-snap-type: x mandatory");
    expect(oc).toContain("grid-auto-flow: column");
    expect(oc).toContain("grid-auto-columns: minmax(148px, 52%)");
    expect(oc).toContain("scroll-snap-align: start");
    expect(oc).toContain("overflow-x: auto");
    expect(oc).toContain("scrollbar-width: none");
    expect(oc).toContain("-ms-overflow-style: none");
    expect(oc).toContain("::-webkit-scrollbar");
    expect(globals).toContain("scroll-snap-type: x mandatory");
    expect(globals).toContain("scrollbar-width: none");
    expect(oc).not.toMatch(/\.v3-oc-pipeline \{\s*grid-template-columns:\s*1fr;/);
    expect(read("package.json")).not.toContain("embla-carousel");
    expect(read("package.json")).not.toContain("swiper");
  });

  it("market and risk compact to two columns on mobile with last update full width", () => {
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    const oc = read("components/rextora/v3/operator-center.css");
    expect(center).toContain("v3-oc-ops-grid");
    expect(center).toContain("v3-oc-metric--wide");
    expect(center).toContain("v3-oc-risk-grid");
    expect(center).toContain("마지막 갱신");
    expect(center).toContain("QueueIndicator");
    expect(center).toContain("FreshnessPulse");
    expect(oc).toContain(".v3-oc-ops-grid .v3-oc-metric--wide");
    expect(oc).toContain("grid-column: 1 / -1");
    expect(oc).toContain("minmax(0, 1fr) minmax(0, 1fr)");
    expect(oc).toContain("@media (max-width: 320px)");
    expect(oc).toContain("@media (max-width: 390px)");
    expect(oc).toContain("@media (min-width: 653px) and (max-width: 884px)");
  });

  it("formats position prices for display without mutating stored numbers", () => {
    const source = 122.45363409846485;
    const small = 0.000012345678;
    const displayed = formatDisplayPrice(source);
    const smallDisplayed = formatDisplayPrice(small);
    expect(source).toBe(122.45363409846485);
    expect(small).toBe(0.000012345678);
    expect(displayed).toMatch(/^122\.4536341/);
    expect(displayed).not.toBe(String(source));
    expect((displayed.split(".")[1] ?? "").length).toBeLessThanOrEqual(8);
    expect(smallDisplayed).toBe("0.000012345678");
    expect(formatDisplayPrice(undefined)).toBe("—");
    expect(formatLeverageMultiple(2)).toBe("2.0x");
    expect(formatLeverageMultiple(3)).toBe("3.0x");
    expect(formatLeverageMultiple(null)).toBe("—");
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).toContain("formatDisplayPrice(row.entryPrice)");
    expect(center).toContain("formatDisplayPrice(row.currentPrice)");
    expect(center).toContain("formatLeverageMultiple(risk?.currentLeverage)");
    expect(center).not.toContain("{row.entryPrice ?? \"—\"}");
  });

  it("does not change the global floating AI button or mobile bottom navigation", () => {
    const fab = read("components/rextora/agent/GlobalAgentAssistant.tsx");
    const shell = read("components/rextora/shell/GlobalShell.tsx");
    const sidebar = read("components/rextora/Sidebar.tsx");
    const oc = read("components/rextora/v3/operator-center.css");
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(fab).toContain("rextora-agent-fab");
    expect(shell).toContain("<GlobalAgentAssistant />");
    expect(center).not.toContain("rextora-agent-fab");
    expect(oc).not.toContain("rextora-agent-fab");
    expect(sidebar).toContain('data-testid="shell-bottom-nav"');
    expect(sidebar).toContain('data-testid="mobile-nav"');
    expect(OPERATOR_EMPTY.strategy).toBe("선택된 전략이 없습니다.");
  });

  it("empty strategy heading is unique and CTA uses canonical primary style", () => {
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    const emptyUses = center.match(/OPERATOR_EMPTY\.strategy/g) ?? [];
    expect(emptyUses).toHaveLength(1);
    expect(center).toContain(
      "hasSelectedStrategy ? strategyName : OPERATOR_EMPTY.strategy",
    );
    expect(center).toContain('{hasSelectedStrategy ? strategyName : "—"}');
    expect(center).not.toContain("<p>{OPERATOR_EMPTY.strategy}</p>");
    expect(center).toContain('data-testid="operator-start-search"');
    expect(center).toContain('className="rextora-dashboard-primary-cta"');
    expect(center).toContain('variant="primary"');
    expect(center).toContain('href="/strategy-search"');
    const primary = read("components/rextora/dashboard/DashboardPrimaryAction.tsx");
    expect(primary).toContain('className="rextora-dashboard-primary-cta"');
    expect(primary).toContain('variant="primary"');
  });

  it("suppresses duplicate idle new-search primary and keeps live blockers", () => {
    expect(
      shouldShowOperatorPrimaryAction({
        hasSelectedStrategy: false,
        primaryAction: { href: "/strategy-search", label: "새 탐색 시작" },
      }),
    ).toBe(false);
    expect(
      shouldShowOperatorPrimaryAction({
        hasSelectedStrategy: true,
        primaryAction: { href: "/strategy-search", label: "새 탐색 시작" },
      }),
    ).toBe(true);
    expect(
      shouldShowOperatorPrimaryAction({
        hasSelectedStrategy: false,
        primaryAction: { href: "/strategy-search?jobId=1", label: "진행 중인 탐색 보기" },
      }),
    ).toBe(true);
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).toContain("shouldShowOperatorPrimaryAction");
    expect(center).toContain("operator-start-search");
    expect(center).toContain("buildOperatorActionQueue");
    expect(center).toContain("liveBlockReason");
    expect(center).toContain("LIVE_ORDERS_BLOCKED_LABEL");
  });

  it("makes result and paper secondary actions state-aware", () => {
    expect(hasOperatorSearchResult(null, [])).toBe(false);
    expect(hasOperatorSearchResult(null, [{ status: "running" }])).toBe(false);
    expect(hasOperatorSearchResult({ id: "job-1", status: "completed" }, [])).toBe(true);
    expect(hasOperatorSearchResult(null, [{ status: "failed" }])).toBe(true);
    expect(hasRelevantPaperSession(null)).toBe(false);
    expect(hasRelevantPaperSession("")).toBe(false);
    expect(hasRelevantPaperSession("active")).toBe(true);
    expect(hasRelevantPaperSession("stopped")).toBe(true);
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).toContain("hasOperatorSearchResult");
    expect(center).toContain("hasRelevantPaperSession");
    expect(center).toContain('href="/results"');
    expect(center).toContain('href="/paper-trading"');
    expect(center).toContain("showResultsAction");
    expect(center).toContain("showPaperAction");
  });

  it("formats queue copy with readable spacing without changing values", () => {
    expect(
      formatOperatorQueueCopy({ received: 5, queued: 1, executing: 0, executed: 0 }),
    ).toBe("수신 5 · 대기 1 · 실행 0 · 완료 0");
    expect(normalizeOperatorQueueCopy("수신5 · 대기1 · 실행0 · 완료0")).toBe(
      "수신 5 · 대기 1 · 실행 0 · 완료 0",
    );
    expect(normalizeOperatorQueueCopy("수신 2 · 대기 1 · 실행 0 · 완료 1")).toBe(
      "수신 2 · 대기 1 · 실행 0 · 완료 1",
    );
    const status = read("src/lib/rextora/tradingDashboardStatus.ts");
    expect(status).toContain("formatOperatorQueueCopy");
  });

  it("maps existing riskState to gauge tone and does not add new thresholds", () => {
    expect(resolveOperatorRiskGaugeTone({ riskState: "정상" })).toBe("ok");
    expect(resolveOperatorRiskGaugeTone({ riskState: "주의" })).toBe("warn");
    expect(resolveOperatorRiskGaugeTone({ riskState: "위험" })).toBe("bad");
    expect(resolveOperatorRiskGaugeTone({ riskState: "자동 중단" })).toBe("bad");
    expect(resolveOperatorRiskGaugeTone({ emergencyActive: true, riskState: "정상" })).toBe("bad");
    expect(resolveOperatorRiskGaugeTone({})).toBe("ok");
    const visuals = read("components/rextora/dashboard/OperatorCenterVisuals.tsx");
    expect(visuals).not.toContain("usage >= 70");
    expect(visuals).not.toContain("0.6");
    expect(visuals).not.toContain("0.8");
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).toContain("resolveOperatorRiskGaugeTone");
    expect(center).toContain("tone={riskTone}");
  });

  it("formats today trading cost only from verified fee/funding/slippage fields", () => {
    expect(formatTodayTradingCostLine({})).toBeNull();
    expect(formatTodayTradingCostLine({ feeUsdt: 1, fundingUsdt: 0.2 })).toBeNull();
    expect(
      formatTodayTradingCostLine({ feeUsdt: 1, fundingUsdt: 0.14, slippageUsdt: 0.1 }),
    ).toBe("주요 거래비용 -1.24 USDT");
    expect(
      formatTodayTradingCostLine({ feeUsdt: 0, fundingUsdt: 0, slippageUsdt: 0 }),
    ).toBe("주요 거래비용 0.00 USDT");
    const presentation = read("src/lib/rextora/ui/operatorCenterPresentation.ts");
    expect(presentation).toContain("주요 거래비용");
    expect(presentation).toContain("const paid = fee + funding + slippage");
    expect(presentation).toContain("const impact = -paid");
    expect(presentation).not.toMatch(/`거래비용 \$\{/);
    expect(presentation).not.toContain("spreadUsdt");
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).toContain("formatTodayTradingCostLine");
    expect(center).not.toContain("Math.random");
    const dash = read("components/rextora/dashboard/dashboardData.ts");
    expect(dash).toContain("feeUsdt");
    expect(dash).toContain("fundingUsdt");
    expect(dash).toContain("slippageUsdt");
    expect(dash).not.toContain("spreadUsdt");
  });
});
