import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  INTENTIONAL_ENGLISH_ALLOWLIST,
  OPERATOR_NAV,
  OPERATOR_PIPELINE,
  OPERATOR_STATUS,
  PROHIBITED_VISIBLE_ENGLISH_LABELS,
} from "../src/lib/rextora/ui/operatorTerminology";

const ROOT = path.resolve(__dirname, "..");

const UI_FILES = [
  "components/rextora/shell/ContextBar.tsx",
  "components/rextora/Sidebar.tsx",
  "components/rextora/shell/navigationModel.ts",
  "components/rextora/shell/LifecycleNavigation.tsx",
  "app/dashboard/page.tsx",
  "components/rextora/dashboard/OperatorCenter.tsx",
  "components/rextora/dashboard/DashboardLifecycleOverview.tsx",
  "app/strategy-search/page.tsx",
  "app/results/page.tsx",
  "app/backtest/page.tsx",
  "app/paper-trading/page.tsx",
  "app/risk/page.tsx",
  "components/rextora/risk/RiskOperatorWorkbench.tsx",
  "app/live-trading/page.tsx",
  "components/rextora/live/LiveActivationGates.tsx",
  "components/rextora/live/operator/OperatorApprovalPanel.tsx",
  "components/rextora/live/operator/LiveSafetyHeader.tsx",
  "app/settings/page.tsx",
];

describe("Korean UI terminology contract", () => {
  it("21-24. prohibited visible English labels are absent from core UI", () => {
    for (const rel of UI_FILES) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      for (const label of PROHIBITED_VISIBLE_ENGLISH_LABELS) {
        expect(src, `${rel} contains ${label}`).not.toContain(`"${label}"`);
        expect(src, `${rel} contains ${label}`).not.toContain(`'${label}'`);
        expect(src, `${rel} contains ${label}`).not.toContain(`>${label}<`);
        expect(src, `${rel} contains ${label}`).not.toContain(`{${JSON.stringify(label)}}`);
      }
    }
  });

  it("22. Korean nav labels are defined", () => {
    const nav = fs.readFileSync(
      path.join(ROOT, "components/rextora/shell/navigationModel.ts"),
      "utf8",
    );
    expect(nav).toContain(`label: "${OPERATOR_NAV.dashboard}"`);
    expect(nav).toContain(`lifecycleLabel: "${OPERATOR_NAV.research}"`);
    expect(nav).toContain(`lifecycleLabel: "${OPERATOR_NAV.strategy}"`);
    expect(nav).toContain(`lifecycleLabel: "${OPERATOR_NAV.backtest}"`);
    expect(nav).toContain(`lifecycleLabel: "${OPERATOR_NAV.paper}"`);
    expect(nav).toContain(`lifecycleLabel: "${OPERATOR_NAV.liveGate}"`);
  });

  it("23. Korean status labels exist", () => {
    expect(OPERATOR_STATUS.paperMode).toBe("모의거래");
    expect(OPERATOR_STATUS.liveInactive).toBe("실전 매매 비활성");
    expect(OPERATOR_STATUS.realOrdersBlocked).toBe("실제 주문 차단");
    expect(OPERATOR_STATUS.operatingNormal).toBe("운영 정상");
    expect(OPERATOR_PIPELINE.research).toBe("전략 탐색");
  });

  it("24. technical allowlist remains documented", () => {
    expect(INTENTIONAL_ENGLISH_ALLOWLIST).toContain("API");
    expect(INTENTIONAL_ENGLISH_ALLOWLIST).toContain("AI");
    expect(INTENTIONAL_ENGLISH_ALLOWLIST).toContain("BTCUSDT");
    expect(INTENTIONAL_ENGLISH_ALLOWLIST).toContain("SAFE_v44_i4060");
  });
});
