/** @vitest-environment jsdom */
import type React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
} from "@/components/rextora/strategySearch/formDefaults";
import { GuidedMobileScopeSummary } from "@/components/rextora/strategySearch/guided/GuidedMobileScopeSummary";
import { GuidedStrategyScopeSummary } from "@/components/rextora/strategySearch/guided/GuidedStrategyScopeSummary";
import { GuidedDisclosure } from "@/components/rextora/strategySearch/guided/GuidedDisclosure";
import { showGuidedPatternDetailDisclosure } from "@/components/rextora/strategySearch/guided/strategySearchGuidedVisibility";
import { formatCustomerSearchValue } from "@/components/rextora/strategySearch/customerDisplay";
import { resolvePatternSelectionMode } from "@/src/lib/rextora/patternSelectionMode";

describe("Guided Step 3 UX", () => {
  afterEach(() => cleanup());

  const formSrc = () =>
    require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "components/rextora/strategySearch/JobCreateForm.tsx",
      ),
      "utf8",
    );

  it("A: Step 3 summaries use customer labels, not raw strategy ids", () => {
    const form = createDefaultOperatorFormState();
    form.selectedSpaceIds = ["order_block", "fvg", "support_resistance"];
    form.patternCombinationFamilies = ["order_block", "fvg"];
    form.patternCombinationBlocks = [];

    render(
      <GuidedStrategyScopeSummary
        form={form}
        selectionMode="manual"
        combinationSentence="오더블럭 진입 존 + FVG 확인"
      />,
    );
    const essentials = screen.getByTestId("ss-guided-strategy-essentials");
    expect(essentials.textContent).toContain("오더블럭");
    expect(essentials.textContent).toContain("FVG");
    expect(essentials.textContent).toMatch(/지지·저항|지지 · 저항/);
    expect(essentials.textContent).not.toMatch(/\border_block\b/);
    expect(essentials.textContent).not.toMatch(/\bsupport_resistance\b/);

    cleanup();
    render(
      <GuidedMobileScopeSummary
        form={form}
        selectionMode="manual"
        combinationSentence="오더블럭 + FVG"
      />,
    );
    const mobile = screen.getByTestId("ss-guided-mobile-scope-summary");
    expect(mobile.textContent).toContain("오더블럭");
    expect(mobile.textContent).not.toMatch(/\border_block\b/);
  });

  it("B: stored ids remain unchanged in create body", () => {
    const form = createDefaultOperatorFormState();
    form.selectedSpaceIds = ["order_block", "ema_core"];
    form.patternCombinationFamilies = ["order_block", "fvg"];
    form.patternCombinationBlocks = [
      {
        id: "order_block_0",
        family: "order_block",
        role: "entry_zone",
        order: 0,
        required: true,
        weight: 1,
        priority: 0,
        params: {},
      },
    ];
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.patternCombinationFamilies).toEqual([
      "order_block",
      "fvg",
    ]);
    expect(body.operatorPlan?.patternCombinationSpec?.blocks[0]?.family).toBe(
      "order_block",
    );
  });

  it("C–N: JobCreateForm customer copy and conditional controls", () => {
    const src = formSrc();
    expect(src).not.toContain("canonical failurePolicy");
    expect(src).not.toContain("유효 기간(봉)");
    expect(src).toContain("최대 보유 기간(봉)");
    expect(src).toContain("ss-pattern-max-hold-automatic");
    expect(src).toContain('data-testid="ss-pattern-expiry"');
    expect(src).toContain("ss-combo-pattern-cap-notice");
    expect(src).toContain("comboPatternAtCap");
    expect(src).toContain('label="패턴 종류"');
    expect(src).toContain('label="역할"');
    expect(src).toContain('label="실패 시 청산"');
    expect(src).toContain('label="확인 방식"');
    expect(src).toContain('label="패턴 결합 방식"');
    expect(src).not.toContain('label="논리 관계"');
    expect(src).toMatch(/showComboBlockWeight[\s\S]*weighted_score/);
    expect(src).toMatch(/showComboBlockPriority[\s\S]*priority/);
    expect(src).toContain("ss-pattern-block-order-");
  });

  it("O: disclosure title and meta render with deterministic separators", () => {
    const css = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "components/rextora/v3/strategy-search.css"),
      "utf8",
    );
    expect(css).toContain(".ss-guided-disclosure__sep");
    expect(css).toContain(".ss-guided-disclosure__meta-group");
    expect(formSrc()).toContain('summaryMeta={["워크스페이스", "전략군"]}');
    expect(formSrc()).not.toContain('title="범위 지도 · 워크스페이스"');

    const wrap = (ui: React.ReactNode) => (
      <div className="v3-strategy-search">{ui}</div>
    );

    const leadText = (testId: string) =>
      screen.getByTestId(testId).querySelector(".ss-guided-disclosure__lead")
        ?.textContent ?? "";

    render(
      wrap(
        <GuidedDisclosure
          title="범위 지도"
          summaryMeta={["워크스페이스", "전략군"]}
          testId="ss-disclosure-workspace"
        >
          <div />
        </GuidedDisclosure>,
      ),
    );
    expect(leadText("ss-disclosure-workspace")).toBe(
      "범위 지도 · 워크스페이스 · 전략군",
    );
    expect(leadText("ss-disclosure-workspace")).not.toMatch(/워크스페이스전략군/);
    expect(
      screen.getByTestId("ss-disclosure-workspace").querySelectorAll(
        ".ss-guided-disclosure__sep",
      ).length,
    ).toBe(2);

    cleanup();
    render(
      wrap(
        <GuidedDisclosure
          title="패턴 세부 설정"
          summaryMeta="Rextora 자동 설정"
          testId="ss-disclosure-pattern-auto"
        >
          <div />
        </GuidedDisclosure>,
      ),
    );
    expect(leadText("ss-disclosure-pattern-auto")).toBe(
      "패턴 세부 설정 · Rextora 자동 설정",
    );
    expect(leadText("ss-disclosure-pattern-auto")).not.toMatch(/설정Rextora|설정기본/);

    cleanup();
    render(
      wrap(
        <GuidedDisclosure
          title="패턴 세부 설정"
          summaryMeta="기본 수준"
          testId="ss-disclosure-pattern-basic"
        >
          <div />
        </GuidedDisclosure>,
      ),
    );
    expect(leadText("ss-disclosure-pattern-basic")).toBe(
      "패턴 세부 설정 · 기본 수준",
    );

    cleanup();
    render(
      wrap(
        <GuidedDisclosure
          title="패턴 세부 설정"
          summaryMeta="사용자 조정 유지 · 기본 수준"
          testId="ss-disclosure-pattern-override"
        >
          <div />
        </GuidedDisclosure>,
      ),
    );
    expect(leadText("ss-disclosure-pattern-override")).toBe(
      "패턴 세부 설정 · 사용자 조정 유지 · 기본 수준",
    );
    expect(leadText("ss-disclosure-pattern-override")).not.toMatch(/설정사용자/);
  });

  it("combination operator labels are Korean-first with unchanged values", () => {
    expect(formatCustomerSearchValue("weighted_score")).toBe(
      "가중 점수 (Weighted Score)",
    );
    expect(formatCustomerSearchValue("priority")).toBe("우선순위 (Priority)");
    expect(formatCustomerSearchValue("and")).toBe("모두 충족 (AND)");
    const src = formSrc();
    expect(src).toContain('formatCustomerSearchValue("weighted_score")');
    expect(src).not.toContain("WEIGHTED SCORE (가중 점수)");
    const form = createDefaultOperatorFormState();
    form.patternCombinationOperator = "weighted_score";
    expect(operatorFormToCreateBody(form).operatorPlan?.patternCombinationOperator).toBe(
      "weighted_score",
    );
  });

  it("automatic pattern-detail disclosure visibility and max-hold presentation", () => {
    expect(
      showGuidedPatternDetailDisclosure({
        selectionMode: "automatic",
        patternConfigLevel: "automatic",
      }),
    ).toBe(true);
    expect(
      showGuidedPatternDetailDisclosure({
        selectionMode: "direct",
        patternConfigLevel: "automatic",
      }),
    ).toBe(true);
    const src = formSrc();
    expect(src).toContain("ss-pattern-detail-automatic-managed");
    expect(src).toContain("Rextora 자동 설정");
    const automaticManagedBlock = src.match(
      /data-testid="ss-pattern-detail-automatic-managed"[\s\S]*?<\/div>\s*\)\s*:\s*null/,
    );
    expect(automaticManagedBlock?.[0]).toContain("ss-pattern-max-hold-automatic");
    expect(automaticManagedBlock?.[0]).not.toContain("ss-pattern-expiry");
    expect(src).toMatch(
      /patternConfigLevel === "basic"[\s\S]*data-testid="ss-pattern-expiry"/,
    );
    expect(src).toContain('data-testid="ss-pattern-expert-ranges"');
    const form = createDefaultOperatorFormState();
    expect(form.patternConfigLevel).toBe("automatic");
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.patternConfigLevel).toBe("automatic");
    expect(body.operatorPlan?.patternExpiryBars).toBe(48);
  });

  it("automatic search + manual pattern config override UX", () => {
    const src = formSrc();
    expect(src).toContain("automaticSearchWithManualPatternConfig");
    expect(src).toContain("ss-pattern-auto-override-notice");
    expect(src).toContain("ss-pattern-reset-to-automatic-config");
    expect(src).toContain("사용자 조정 유지 · 기본 수준");
    expect(src).toContain("사용자 조정 유지 · 전문가 수준");
    expect(src).toMatch(
      /현재 자동 탐색을 사용하고 있지만 패턴 세부 설정은 이전에[\s\S]*사용자 조정을 유지하고 있습니다/,
    );
    expect(src).toMatch(
      /ss-pattern-reset-to-automatic-config[\s\S]*set\("patternConfigLevel", "automatic"\)/,
    );
    expect(src).toMatch(/patternDetailSummaryMeta/);

    const overrideBlock = src.match(
      /automaticSearchWithManualPatternConfig \? \([\s\S]*?ss-pattern-auto-override-notice[\s\S]*?\) : null/,
    );
    expect(overrideBlock?.[0]).toBeTruthy();
    expect(overrideBlock?.[0]).not.toContain("ss-pattern-detail-automatic-managed");

    const managedBlock = src.match(
      /data-testid="ss-pattern-detail-automatic-managed"[\s\S]*?<\/div>\s*\)\s*:\s*null/,
    );
    expect(managedBlock?.[0]).not.toContain("ss-pattern-reset-to-automatic-config");
    expect(src).not.toMatch(
      /ss-pattern-detail-automatic-managed[\s\S]*ss-pattern-reset-to-automatic-config/,
    );

    expect(
      resolvePatternSelectionMode({
        autoStrategyCombo: true,
        patternConfigLevel: "basic",
      }),
    ).toBe("automatic");
    expect(
      resolvePatternSelectionMode({
        autoStrategyCombo: false,
        patternConfigLevel: "basic",
      }),
    ).toBe("manual");
  });

  it("reset to automatic config preserves detailed values and request semantics", () => {
    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = true;
    form.patternConfigLevel = "expert";
    form.patternExpiryBars = 72;
    form.patternConfirmationMode = "strict";
    form.patternDirection = "long";

    const before = operatorFormToCreateBody(form);
    expect(before.operatorPlan?.patternConfigLevel).toBe("expert");
    expect(before.operatorPlan?.patternExpiryBars).toBe(72);

    form.patternConfigLevel = "automatic";
    const afterReset = operatorFormToCreateBody(form);
    expect(afterReset.operatorPlan?.patternConfigLevel).toBe("automatic");
    expect(afterReset.operatorPlan?.patternExpiryBars).toBe(72);
    expect(afterReset.operatorPlan?.patternDirection).toBe("long");

    form.patternConfigLevel = "expert";
    const restored = operatorFormToCreateBody(form);
    expect(restored.operatorPlan?.patternConfigLevel).toBe("expert");
    expect(restored.operatorPlan?.patternExpiryBars).toBe(72);
    expect(restored.operatorPlan?.patternDirection).toBe("long");
  });

  it("direct/manual mode does not require automatic override notice branch", () => {
    const src = formSrc();
    expect(src).toMatch(
      /automaticSearchWithManualPatternConfig \? \([\s\S]*ss-pattern-auto-override-notice/,
    );
    expect(src).toMatch(
      /patternDetailSummaryMeta[\s\S]*"기본 수준"/,
    );
    expect(src).toMatch(
      /patternDetailSummaryMeta[\s\S]*"전문가 수준"/,
    );
  });

  it("Step 3 footer uses shared with-back mobile contract", () => {
    const src = formSrc();
    expect(src).toContain("resolveGuidedFooterActionsClassName");
    expect(src).not.toContain("ss-guided-footer-actions--strategy-step");
  });

  it("P: tradingStyle shared field unchanged", () => {
    const src = formSrc();
    expect(src).toContain("applyTradingStyle");
    expect(src).toContain("GuidedMobileScopeSummary");
    const mobile = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "components/rextora/strategySearch/guided/GuidedMobileScopeSummary.tsx",
      ),
      "utf8",
    );
    expect(mobile).toContain("presetLabel(form.tradingStyle)");
  });
});
