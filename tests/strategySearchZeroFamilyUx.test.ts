import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultOperatorFormState } from "../components/rextora/strategySearch/formDefaults";
import { DIRECT_LAYER_IDS } from "../components/rextora/strategySearch/visual/searchVisualCopy";
import {
  SELECTED_SPACE_REQUIRED_KO,
  LAUNCH_SETTINGS_CHECK_TITLE_KO,
  LAUNCH_READY_TITLE_KO,
  buildAppliedSettingsPreview,
  buildCreateBodyIfValid,
  launchIdleCopy,
  summarizeStrategySearchConfig,
  validateStrategySearchForm,
} from "../components/rextora/strategySearch/formValidation";

const ROOT = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function directForm(selectedSpaceIds: string[]) {
  const form = createDefaultOperatorFormState();
  form.autoStrategyCombo = false;
  form.patternConfigLevel = "basic";
  form.selectedSpaceIds = selectedSpaceIds;
  return form;
}

describe("Strategy Search zero-family launch UX", () => {
  it("A: direct mode + 6 selected families is valid", () => {
    expect(DIRECT_LAYER_IDS).toHaveLength(6);
    const form = directForm([...DIRECT_LAYER_IDS]);
    const errors = validateStrategySearchForm(form);
    expect(errors.some((e) => e.field === "selectedSpaceIds")).toBe(false);
    expect(buildCreateBodyIfValid(form).ok).toBe(true);
    const idle = launchIdleCopy(summarizeStrategySearchConfig(form));
    expect(idle.showReady).toBe(true);
    expect(idle.startDisabled).toBe(false);
    expect(idle.titleKo).toBe(LAUNCH_READY_TITLE_KO);
  });

  it("B: direct mode + 1 selected family is valid", () => {
    const form = directForm(["order_block"]);
    const errors = validateStrategySearchForm(form);
    expect(errors.some((e) => e.field === "selectedSpaceIds")).toBe(false);
    expect(buildCreateBodyIfValid(form).ok).toBe(true);
    const idle = launchIdleCopy(summarizeStrategySearchConfig(form));
    expect(idle.showReady).toBe(true);
    expect(idle.startDisabled).toBe(false);
  });

  it("C: direct mode + 0 selected families is invalid", () => {
    const form = directForm([]);
    const errors = validateStrategySearchForm(form);
    expect(errors.some((e) => e.field === "selectedSpaceIds")).toBe(true);
    expect(summarizeStrategySearchConfig(form).status).toBe("needs_fix");
    expect(buildCreateBodyIfValid(form).ok).toBe(false);
  });

  it("D/E/F: zero selected uses blocking copy, not ready copy", () => {
    const form = directForm([]);
    const idle = launchIdleCopy(summarizeStrategySearchConfig(form));
    expect(idle.showReady).toBe(false);
    expect(idle.titleKo).toBe(LAUNCH_SETTINGS_CHECK_TITLE_KO);
    expect(idle.titleKo).not.toBe(LAUNCH_READY_TITLE_KO);
    expect(idle.detailKo).toBe(SELECTED_SPACE_REQUIRED_KO);
    expect(idle.detailKo).toBe("탐색할 전략군을 1개 이상 선택하세요.");
  });

  it("G: zero selected disables the idle start action", () => {
    const form = directForm([]);
    const idle = launchIdleCopy(summarizeStrategySearchConfig(form));
    expect(idle.startDisabled).toBe(true);
    const src = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(src).toContain("launchIdleCopy(preview.summary)");
    expect(src).toContain(
      "disabled={submitting || inputDisabled || spaceSelectionBlocked}",
    );
    expect(src).toContain("if (spaceSelectionBlocked) return;");
    expect(src).toContain('data-testid="ss-launch-blocked-title"');
    expect(src).toContain("ss-launch-blocked");
    expect(src).toContain("ss-btn-primary");
    expect(src).toContain('data-testid="ss-create-submit"');
  });

  it("H: zero selected does not produce a create/start body", () => {
    const form = directForm([]);
    const validated = buildCreateBodyIfValid(form);
    expect(validated.ok).toBe(false);
    if (validated.ok) return;
    expect(validated.errors.some((e) => e.field === "selectedSpaceIds")).toBe(
      true,
    );
    const workbench = read(
      "components/rextora/strategySearch/StrategySearchWorkbench.tsx",
    );
    const startFn = workbench.slice(
      workbench.indexOf("async function handleStartSearch"),
      workbench.indexOf("async function runAction"),
    );
    expect(startFn).toContain("buildCreateBodyIfValid(form)");
    expect(startFn.indexOf("if (!validated.ok)")).toBeGreaterThan(-1);
    expect(startFn.indexOf("if (!validated.ok)")).toBeLessThan(
      startFn.indexOf("createStrategySearchJob"),
    );
    expect(startFn.indexOf("return;")).toBeGreaterThan(
      startFn.indexOf("if (!validated.ok)"),
    );
    expect(startFn.indexOf("return;")).toBeLessThan(
      startFn.indexOf("createStrategySearchJob"),
    );
    expect(startFn).toContain("await startStrategySearchJob(created.id)");
  });

  it("I: reselecting one family restores valid ready launch", () => {
    const form = directForm([]);
    expect(buildCreateBodyIfValid(form).ok).toBe(false);
    expect(launchIdleCopy(summarizeStrategySearchConfig(form)).showReady).toBe(
      false,
    );
    form.selectedSpaceIds = ["order_block"];
    expect(validateStrategySearchForm(form).some((e) => e.field === "selectedSpaceIds")).toBe(
      false,
    );
    expect(buildCreateBodyIfValid(form).ok).toBe(true);
    const idle = launchIdleCopy(summarizeStrategySearchConfig(form));
    expect(idle.showReady).toBe(true);
    expect(idle.startDisabled).toBe(false);
    expect(idle.titleKo).toBe(LAUNCH_READY_TITLE_KO);
  });

  it("J: automatic mode remains ready even with empty selectedSpaceIds", () => {
    const form = createDefaultOperatorFormState();
    expect(form.autoStrategyCombo).toBe(true);
    form.selectedSpaceIds = [];
    const errors = validateStrategySearchForm(form);
    expect(errors.some((e) => e.field === "selectedSpaceIds")).toBe(false);
    expect(buildCreateBodyIfValid(form).ok).toBe(true);
    const idle = launchIdleCopy(summarizeStrategySearchConfig(form));
    expect(idle.showReady).toBe(true);
    expect(idle.startDisabled).toBe(false);
    expect(idle.titleKo).toBe(LAUNCH_READY_TITLE_KO);
    const preview = buildAppliedSettingsPreview(form);
    expect(preview.summary.status).toBe("ok");
  });

  it("blocked launch uses invalid/disabled tokens, not success-ready green", () => {
    const formSrc = read("components/rextora/strategySearch/JobCreateForm.tsx");
    const css = read("components/rextora/v3/strategy-search.css");
    const blockedIdx = formSrc.indexOf("ss-launch-blocked");
    const readyIdx = formSrc.indexOf("ss-launch-ready");
    expect(blockedIdx).toBeGreaterThan(-1);
    expect(formSrc.indexOf("spaceSelectionBlocked")).toBeGreaterThan(-1);
    expect(formSrc.indexOf("spaceSelectionBlocked ?")).toBeLessThan(readyIdx);
    expect(css).toContain(".ss-launch-blocked");
    expect(css).toContain("color: var(--v3-danger");
    expect(css).toContain("[data-testid=\"ss-create-submit\"]:disabled");
    expect(css).toContain("cursor: not-allowed");
  });
});
