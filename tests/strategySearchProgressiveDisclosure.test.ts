import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
    expect(form).toContain('value: "automatic"');
    expect(form).toContain('value: "basic"');
    expect(form).toContain('value: "expert"');
    expect(form).toContain('set("patternConfigLevel", value)');
    expect(form).toContain('data-config-level={form.patternConfigLevel}');
  });

  it("hides advanced density in simpler modes and keeps a sticky review action", () => {
    expect(css).toContain('[data-config-level="automatic"]');
    expect(css).toContain('[data-config-level="basic"]');
    expect(form).toContain("StickyActionBar");
    expect(form).toContain("연구 시작");
    expect(form).toContain("ss-combo-summary");
  });

  it("disables manual pattern matrix under automatic selection", () => {
    expect(form).toContain("ss-auto-selection-notice");
    expect(form).toContain("ss-pattern-matrix-system-managed");
    expect(form).toContain("시스템 관리");
    expect(form).toContain("form.autoStrategyCombo");
  });
});
