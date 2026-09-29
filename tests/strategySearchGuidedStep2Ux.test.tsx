/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { GuidedApproachEssentials } from "@/components/rextora/strategySearch/guided/GuidedApproachEssentials";
import { StrategySearchFieldHelp } from "@/components/rextora/strategySearch/guided/StrategySearchFieldHelp";
import { STRATEGY_SEARCH_FIELD_HELP } from "@/components/rextora/strategySearch/guided/strategySearchFieldHelpContent";
import {
  SEARCH_DEPTH_PROFILES,
  createDefaultOperatorFormState,
} from "@/components/rextora/strategySearch/formDefaults";
import { StrategySearchVisualBuilder } from "@/components/rextora/strategySearch/visual/StrategySearchVisualBuilder";

describe("Guided Step 2 UX", () => {
  afterEach(() => cleanup());

  it("uses customer labels 탐색 깊이, 설정 범위, 탐색 출발점 in Step 2 sources", () => {
    const form = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "components/rextora/strategySearch/JobCreateForm.tsx",
      ),
      "utf8",
    );
    const essentials = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "components/rextora/strategySearch/guided/GuidedApproachEssentials.tsx",
      ),
      "utf8",
    );
    const level = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "components/rextora/strategySearch/visual/AdvancedLevelSelector.tsx",
      ),
      "utf8",
    );
    expect(essentials).toContain("탐색 깊이");
    expect(essentials).not.toMatch(/label[^\n]*탐색 수준/);
    expect(form).toContain("설정 범위");
    expect(form).toContain("탐색 출발점");
    expect(level).toContain("설정 범위");
    expect(form).not.toContain('label="탐색 기준"');
  });

  it("keeps internal enum keys unchanged", () => {
    const form = createDefaultOperatorFormState();
    expect(form.depthProfile).toBeTruthy();
    expect(form.patternConfigLevel).toBeTruthy();
    expect(form.researchBasis).toBe("fresh");
    expect(Object.keys(SEARCH_DEPTH_PROFILES)).toEqual(
      expect.arrayContaining(["fast", "standard", "deep"]),
    );
  });

  it("minimum-score help removes quality claim and explains non-absolute score", () => {
    const entry = STRATEGY_SEARCH_FIELD_HELP.minScore;
    expect(entry.title).toBe("최소 점수");
    expect(entry.impact).not.toContain("추천 품질을 높입니다");
    expect(entry.impact).toContain("1점 만점");
    expect(entry.how).toContain("비우면");
  });

  it("help trigger and popover viewport contract in CSS and component", () => {
    const css = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "components/rextora/v3/strategy-search.css"),
      "utf8",
    );
    expect(css).toMatch(/ss-field-help__trigger[\s\S]*width:\s*28px/);
    expect(css).toMatch(/aspect-ratio:\s*1\s*\/\s*1/);
    expect(css).toContain("ss-field-help__popover--viewport");
    expect(css).toContain("calc(100vw - 24px)");
    expect(css).toMatch(/data-placement="right"[\s\S]*::before/);
    expect(css).toMatch(/data-placement="left"[\s\S]*::before/);
    expect(css).toContain("--ss-field-help-caret-top");
    const helpSrc = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "components/rextora/strategySearch/guided/StrategySearchFieldHelp.tsx",
      ),
      "utf8",
    );
    expect(helpSrc).toContain("getBoundingClientRect");
    expect(helpSrc).toContain("computeFieldHelpPopoverLayout");
    expect(helpSrc).toContain("createPortal");
    expect(helpSrc).toContain('data-placement');
  });

  it("mobile Step 2 clears visual-builder sticky reserve padding", () => {
    const css = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "components/rextora/v3/strategy-search.css"),
      "utf8",
    );
    expect(css).toMatch(
      /data-guided-step="approach"[\s\S]*\.ss-visual-builder[\s\S]*padding-bottom:\s*0/,
    );
  });

  it("custom period fields do not mount when preset is standard", () => {
    const form = createDefaultOperatorFormState();
    render(
      <StrategySearchVisualBuilder
        form={form}
        automatic={false}
        panels={{ mode: true, market: false, workspace: false }}
        onSelectAutomatic={() => {}}
        onSelectDirect={() => {}}
        onSymbol={() => {}}
        onTimeframe={() => {}}
        onPeriod={() => {}}
        onTradingStyle={() => {}}
        onDirection={() => {}}
        onToggleLayer={() => {}}
        onCustomPeriodFrom={() => {}}
        onCustomPeriodTo={() => {}}
      />,
    );
    expect(screen.queryByTestId("ss-guided-custom-period")).toBeNull();
  });

  it("depth and config level option labels unchanged", () => {
    expect(SEARCH_DEPTH_PROFILES.fast.labelKo).toBe("빠른 탐색");
    expect(SEARCH_DEPTH_PROFILES.standard.labelKo).toBe("표준 탐색");
    expect(SEARCH_DEPTH_PROFILES.deep.labelKo).toBe("심층 탐색");
  });

  it("opens help popover with placement attribute", () => {
    render(<StrategySearchFieldHelp fieldId="minTotalReturn" />);
    fireEvent.click(screen.getByTestId("ss-field-help-minTotalReturn"));
    const pop = screen.getByTestId("ss-field-help-popover-minTotalReturn");
    expect(pop.getAttribute("data-placement")).toMatch(/left|right/);
    expect(pop.className).toContain("ss-field-help__popover--viewport");
  });

  it("GuidedApproachEssentials renders duration presets", () => {
    render(
      <GuidedApproachEssentials
        depthProfile="standard"
        depthHint="hint"
        durationPreset="180"
        maxRuntimeMinutesOverride=""
        onDepth={() => {}}
        onDurationPreset={() => {}}
        onMaxRuntime={() => {}}
      />,
    );
    const select = screen.getByTestId("ss-duration") as HTMLSelectElement;
    expect(select.querySelector('option[value="60"]')).toBeTruthy();
    expect(select.querySelector('option[value="custom"]')).toBeTruthy();
  });
});
