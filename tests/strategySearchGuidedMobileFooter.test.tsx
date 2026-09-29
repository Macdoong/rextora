/** @vitest-environment jsdom */
import type React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveGuidedFooterActionsClassName,
  resolveGuidedFooterPairedRow,
} from "@/components/rextora/strategySearch/guided/guidedFooterLayout";

describe("Guided mobile footer layout", () => {
  afterEach(() => cleanup());

  const formSrc = () =>
    require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "components/rextora/strategySearch/JobCreateForm.tsx",
      ),
      "utf8",
    );

  const cssSrc = () =>
    require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "components/rextora/v3/strategy-search.css",
      ),
      "utf8",
    );

  const wrap = (ui: React.ReactNode) => (
    <div className="v3-strategy-search">{ui}</div>
  );

  const renderFooter = (options: {
    paired: boolean;
    showPrev: boolean;
    primaryTestId: "ss-guided-next" | "ss-create-submit";
  }) => {
    const className = resolveGuidedFooterActionsClassName({
      canGoPrevious: options.showPrev,
      hasPrimaryAction: true,
    });
    render(
      wrap(
        <div
          className={className}
          data-testid="ss-guided-footer-actions"
          data-guided-footer-paired={options.paired ? "true" : "false"}
        >
          {options.showPrev ? (
            <button
              type="button"
              className="ss-guided-footer-back"
              data-testid="ss-guided-prev"
            >
              이전
            </button>
          ) : null}
          <button
            type="button"
            className="ss-btn-primary ss-guided-next-btn"
            data-testid={options.primaryTestId}
          >
            {options.primaryTestId === "ss-create-submit" ? "탐색 시작" : "다음 단계"}
          </button>
        </div>,
      ),
    );
    return screen.getByTestId("ss-guided-footer-actions");
  };

  it("Step 1: no with-back modifier when previous is absent", () => {
    expect(
      resolveGuidedFooterActionsClassName({
        canGoPrevious: false,
        hasPrimaryAction: true,
      }),
    ).toBe("ss-guided-footer-actions");
    expect(resolveGuidedFooterPairedRow({ canGoPrevious: false, hasPrimaryAction: true })).toBe(
      false,
    );
    const footer = renderFooter({
      paired: false,
      showPrev: false,
      primaryTestId: "ss-guided-next",
    });
    expect(footer.classList.contains("ss-guided-footer-actions--with-back")).toBe(false);
    expect(footer.querySelector('[data-testid="ss-guided-prev"]')).toBeNull();
    expect(footer.querySelector('[data-testid="ss-guided-next"]')).toBeTruthy();
  });

  it("Steps 2–4: with-back when previous and primary both exist", () => {
    for (const step of [2, 3, 4] as const) {
      expect(
        resolveGuidedFooterPairedRow({ canGoPrevious: true, hasPrimaryAction: true }),
      ).toBe(true);
      void step;
    }
    cleanup();
    const footer = renderFooter({
      paired: true,
      showPrev: true,
      primaryTestId: "ss-guided-next",
    });
    expect(footer.classList.contains("ss-guided-footer-actions--with-back")).toBe(true);
    expect(
      Array.from(footer.children).map((n) => n.getAttribute("data-testid")),
    ).toEqual(["ss-guided-prev", "ss-guided-next"]);
  });

  it("Step 5: no guided footer; previous and submit grouped in launch panel", () => {
    const src = formSrc();
    expect(src).toMatch(/showGuidedFooterPrevious/);
    expect(src).not.toMatch(/showGuidedFooterSubmit\s*=/);
    expect(src).toMatch(/showGuidedFooterSubmitInLaunchBar/);
    expect(src).toMatch(/ss-launch-panel-actions/);
    expect(src).toMatch(/showLaunchPanelActions/);
  });

  it("JobCreateForm uses shared with-back modifier, not Step 3-only class", () => {
    const src = formSrc();
    const layout = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "components/rextora/strategySearch/guided/guidedFooterLayout.ts",
      ),
      "utf8",
    );
    expect(layout).toContain("ss-guided-footer-actions--with-back");
    expect(src).toContain("resolveGuidedFooterActionsClassName");
    expect(src).not.toContain("ss-guided-footer-actions--strategy-step");
    expect(src).toMatch(/guidedFooterPairedRow/);
    expect(src).toMatch(/showGuidedFooterSubmitInLaunchBar/);
  });

  it("CSS keeps global primary full width but overrides inside with-back footer", () => {
    const css = cssSrc();
    expect(css).toMatch(
      /\.v3-strategy-search \.ss-btn-primary[\s\S]*width: 100%/,
    );
    expect(css).toMatch(
      /\.ss-guided-footer-actions--with-back[\s\S]*ss-guided-next-btn[\s\S]*width: auto/,
    );
    expect(css).toMatch(
      /\.ss-launch-panel-actions[\s\S]*\[data-testid="ss-create-submit"\][\s\S]*width: auto/,
    );
    expect(css).not.toContain("ss-guided-footer-actions--strategy-step");
  });
});
