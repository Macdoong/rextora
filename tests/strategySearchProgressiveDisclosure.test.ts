import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { advancedDisclosureControl } from "../components/rextora/strategySearch/completionCustomerView";

describe("Strategy Search progressive disclosure", () => {
  const form = fs.readFileSync(
    path.join(
      process.cwd(),
      "components/rextora/strategySearch/JobCreateForm.tsx",
    ),
    "utf8",
  );
  const css = fs.readFileSync(path.join(process.cwd(), "app/globals.css"), "utf8");

  it("keeps automatic, basic, and expert modes engine-backed", () => {
    const selector = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/strategySearch/visual/AdvancedLevelSelector.tsx",
      ),
      "utf8",
    );
    expect(selector).toContain('value: "automatic"');
    expect(selector).toContain('value: "basic"');
    expect(selector).toContain('value: "expert"');
    expect(form).toContain('set("patternConfigLevel", value)');
    expect(form).toContain('data-config-level={form.patternConfigLevel}');
  });

  it("hides advanced density in simpler modes and keeps a sticky review action", () => {
    expect(css).toContain('[data-config-level="automatic"]');
    expect(css).toContain('[data-config-level="basic"]');
    expect(form).toContain("StickyActionBar");
    expect(form).toContain("자동 탐색 시작");
    expect(form).toContain("선택 범위로 탐색 시작");
    expect(form).toContain("ss-combo-summary");
  });

  it("drives advanced disclosure copy and chevron from the same open boolean", () => {
    expect(advancedDisclosureControl(false)).toEqual({
      copy: "펼치기",
      chevron: "down",
      chevronGlyph: "▼",
    });
    expect(advancedDisclosureControl(true)).toEqual({
      copy: "접기",
      chevron: "up",
      chevronGlyph: "▲",
    });
    expect(form).toContain("advancedDisclosureControl(detailsOpen)");
    expect(form).toContain("aria-expanded={detailsOpen}");
    expect(form).toContain("data-direction={disclosure.chevron}");
    expect(form).toContain("hidden={!detailsOpen}");
  });

  it("disables manual pattern matrix under automatic selection", () => {
    expect(form).toContain("ss-auto-selection-notice");
    expect(form).toContain("ss-pattern-matrix-system-managed");
    expect(form).toContain("시스템 관리");
    expect(form).toContain("form.autoStrategyCombo");
  });
});
