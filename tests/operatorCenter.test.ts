import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EXPECTED_SAFE_PARAMS_HASH } from "../src/lib/rextora/strategy/strategyTypes";
import { LIVE_DISABLED_LABEL, LIVE_ORDERS_BLOCKED_LABEL } from "../src/lib/rextora/live/liveGateOperatorPresentation";

const ROOT = path.resolve(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("operator center", () => {
  it("1. dashboard title is 운영센터", () => {
    expect(read("app/dashboard/page.tsx")).toContain('title="운영센터"');
    expect(read("components/rextora/shell/navigationModel.ts")).toContain(
      'label: "운영센터"',
    );
  });

  it("2-4. Korean mode, live disabled, pipeline labels", () => {
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).toContain("OPERATOR_STATUS.paperMode");
    expect(center).toContain("LIVE_DISABLED_LABEL");
    expect(center).toContain("LIVE_ORDERS_BLOCKED_LABEL");
    expect(LIVE_DISABLED_LABEL).toBe("실전 매매 비활성");
    expect(LIVE_ORDERS_BLOCKED_LABEL).toMatch(/실제 주문 차단/);
    expect(center).toContain("buildOperatorPipeline");
    expect(center).toContain("operator-pipeline");
  });

  it("5-7. action queue and canonical strategy context", () => {
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).toContain("buildOperatorActionQueue");
    expect(center).toContain("groupOperatorActions");
    expect(center).toContain("operator-current-strategy");
    expect(center).toContain("paperName");
    expect(center).toContain("activeStrategy");
  });

  it("8. stale Agent context does not replace operator context", () => {
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).not.toContain("useSharedAgentSession");
    expect(center).not.toContain("pinnedObjective");
    const briefing = read(
      "components/rextora/dashboard/DashboardExecutiveBriefing.tsx",
    );
    expect(briefing).not.toContain("useSharedAgentSession");
    const ctx = read("components/rextora/shell/ContextBar.tsx");
    expect(ctx).toContain("pageOwnsContext");
    expect(ctx).toContain("primaryStrategy");
  });

  it("9-13. source-backed risk/live/paper/backtest/research", () => {
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).toContain("status?.emergencyActive");
    expect(center).toContain("status?.canStartLive");
    expect(center).toContain("paperSessionStatus");
    expect(center).toContain("dashboardResearchLifecycleLabel");
    const pipeline = read("src/lib/rextora/ui/operatorPipeline.ts");
    expect(pipeline).toContain("tone: \"waiting\"");
    expect(pipeline).toContain("id: \"backtest\"");
  });

  it("14-16. zero positions/trades truthful; technical IDs secondary", () => {
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).toContain("OPERATOR_EMPTY.positions");
    expect(center).toContain("OPERATOR_EMPTY.trades");
    expect(center).toContain("operator-zero-positions");
    expect(center).toContain("operator-zero-trades");
    expect(center).toContain("OPERATOR_LABEL.technicalDetail");
  });

  it("17-19. viewer read-only; operator/CEO use existing permissions", () => {
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).toContain("useAuth");
    expect(center).toContain('can("research:run")');
    expect(center).toContain("조회 전용");
    expect(center).toContain("authRoleLabelKo");
  });

  it("20. dashboard render does not mutate state", () => {
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).not.toMatch(/method:\s*"POST"/);
    expect(center).not.toMatch(/method:\s*"PUT"/);
    expect(center).not.toMatch(/method:\s*"PATCH"/);
    expect(center).not.toContain("liveTradingEnabled: true");
    expect(center).not.toContain("allowLiveTrading: true");
  });

  it("25-27. compact mobile hierarchy and reachable actions", () => {
    const css = read("app/globals.css");
    expect(css).toContain("@media (max-width: 390px)");
    expect(css).toContain("op-pipeline-track");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain(".op-action-link");
    expect(css).toContain("min-height: 2.75rem");
    const sidebar = read("components/rextora/Sidebar.tsx");
    expect(sidebar).toContain("mobile-nav");
    expect(sidebar).toContain("min-h-11");
  });

  it("28-31. SAFE untouched and no live/exchange mutation from UI files", () => {
    const safe = JSON.parse(
      read("data/strategies/SAFE_v44_i4060.json"),
    ) as { params_hash?: string };
    expect(safe.params_hash).toBe(EXPECTED_SAFE_PARAMS_HASH);
    expect(safe.params_hash).toBe("7893ca3f0e30");
    const center = read("components/rextora/dashboard/OperatorCenter.tsx");
    expect(center).not.toContain("api.binance");
    expect(center).not.toContain("createOrder");
  });
});
