import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
  type StrategySearchOperatorFormState,
} from "../components/rextora/strategySearch/formDefaults";
import { buildAppliedSettingsPreview } from "../components/rextora/strategySearch/formValidation";
import { advancedChangedFieldCount } from "../components/rextora/strategySearch/advancedConditionsState";
import {
  INTENTIONALLY_EXCLUDED_OPERATOR_FORM_KEYS,
  SESSION_ONLY_OPERATOR_FORM_KEYS,
  applySavedOperatorForm,
  persistedFieldsEqual,
  persistedOperatorFormKeys,
} from "../components/rextora/strategySearch/searchConfigApply";
import {
  deleteStrategySearchConfig,
  duplicateStrategySearchConfig,
  loadStrategySearchConfig,
  renameStrategySearchConfig,
  saveStrategySearchConfig,
} from "../src/lib/rextora/strategySearch/searchConfigStore";

const ROOT = process.cwd();
const tempRoots: string[] = [];

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function tempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-ss-cfg-rt-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  while (tempRoots.length) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

function nonDefaultForm(): StrategySearchOperatorFormState {
  const form = createDefaultOperatorFormState();
  form.searchName = "eth-expert-saved";
  form.symbol = "ETHUSDT";
  form.timeframe = "1h";
  form.periodPreset = "long";
  form.depthProfile = "deep";
  form.qualificationProfile = "conservative";
  form.qualifiedTargetPreset = "5";
  form.qualifiedTargetCustom = "5";
  form.stopWhenQualifiedTarget = true;
  form.minTradeCount = "12";
  form.minTotalReturn = "0.08";
  form.maxMdd = "0.12";
  form.minWinRate = "0.45";
  form.minScore = "1.2";
  form.marketMode = "manual";
  form.durationPreset = "60";
  form.mddPreset = "15";
  form.tradingStyle = "stable";
  form.researchBasis = "improve_best";
  form.seed = "99";
  form.balance = "25000";
  form.feeRate = "0.0008";
  form.slippageRate = "0.0005";
  form.fundingRate = "0.0002";
  form.spreadRate = "0.0003";
  form.applyFunding = true;
  form.applySpread = false;
  form.stressEnabled = true;
  form.stressFeeMultiplier = "2";
  form.stressSlippageMultiplier = "2";
  form.jitterEnabled = true;
  form.jitterSamples = "6";
  form.jitterMutationScale = "0.2";
  form.candidateBudgetOverride = "80";
  form.maxRuntimeMinutesOverride = "90";
  form.errorWarningRate = "0.2";
  form.errorAutoPauseRate = "0.4";
  form.repeatedSignatureThreshold = "12";
  form.showAdvanced = true;
  form.selectedSpaceIds = ["order_block", "fvg"];
  form.autoStrategyCombo = false;
  form.patternConfigLevel = "expert";
  form.patternDirection = "long";
  form.patternRetestMode = "optional";
  form.patternConfirmStrength = "strict";
  form.patternConfirmClose = "disabled";
  form.patternConfirmationMode = "consecutive_closes";
  form.patternConfirmationCandleCount = "3";
  form.patternConfirmationWindow = "6";
  form.patternExpiryBars = "24";
  form.patternRiskStyle = "conservative";
  form.patternStrength = "strict";
  form.patternSrSensitivity = "tight";
  form.patternCombinationTemplate = "confluence";
  form.patternCombinationOperator = "and";
  form.patternCombinationFailurePolicy = "all";
  form.patternCombinationWeightedThreshold = "2";
  form.patternCombinationFamilies = ["order_block", "fvg"];
  form.leverageMode = "fixed";
  form.leverageFixed = "2";
  form.leverageMin = "1";
  form.leverageMax = "3";
  return form;
}

describe("Strategy Search saved-configuration roundtrip and discoverability", () => {
  it("A: save → mutate → load restores every persisted field", () => {
    const rootDir = tempRoot();
    const original = nonDefaultForm();
    saveStrategySearchConfig("eth-expert-saved", original, { rootDir });
    const mutated = createDefaultOperatorFormState();
    mutated.symbol = "XRPUSDT";
    mutated.feeRate = "0.009";
    mutated.patternConfigLevel = "automatic";
    mutated.selectedSpaceIds = ["ema_core"];
    mutated.showAdvanced = false;
    const loadedRecord = loadStrategySearchConfig("eth-expert-saved", { rootDir });
    expect(loadedRecord).not.toBeNull();
    const restored = applySavedOperatorForm(loadedRecord!.form, {
      showAdvanced: mutated.showAdvanced,
    });
    const parity = persistedFieldsEqual(original, restored);
    expect(parity.drifted).toEqual([]);
    expect(parity.ok).toBe(true);
    expect(restored.symbol).toBe("ETHUSDT");
    expect(restored.feeRate).toBe("0.0008");
    expect(restored.patternConfigLevel).toBe("expert");
    expect(restored.selectedSpaceIds).toEqual(["order_block", "fvg"]);
    expect(restored.tradingStyle).toBe("stable");
    expect(restored.leverageMode).toBe("fixed");
  });

  it("B: session-only and intentionally excluded fields follow the documented contract", () => {
    expect(SESSION_ONLY_OPERATOR_FORM_KEYS).toEqual(["showAdvanced"]);
    expect(INTENTIONALLY_EXCLUDED_OPERATOR_FORM_KEYS).toEqual([
      "symbols",
      "intensity",
      "goal",
      "targetReturn",
      "maxSearchCount",
      "runUntilQualified",
    ]);
    const saved = nonDefaultForm();
    saved.showAdvanced = true;
    const restored = applySavedOperatorForm(saved, { showAdvanced: false });
    expect(restored.showAdvanced).toBe(false);
    expect(restored.symbols).toBeUndefined();
    expect(restored.runUntilQualified).toBeUndefined();
  });

  it("proves previous session-merge drift and that applySavedOperatorForm removes it", () => {
    const defaults = createDefaultOperatorFormState();
    const partialSaved = { symbol: "ETHUSDT" } as Partial<StrategySearchOperatorFormState>;
    const staleCurrent = {
      ...defaults,
      symbol: "XRPUSDT",
      feeRate: "0.009",
      patternConfigLevel: "expert" as const,
    };
    const oldMerge = {
      ...staleCurrent,
      ...partialSaved,
    };
    expect(oldMerge.feeRate).toBe("0.009");
    expect(oldMerge.patternConfigLevel).toBe("expert");
    const fixed = applySavedOperatorForm(partialSaved, {
      showAdvanced: staleCurrent.showAdvanced,
    });
    expect(fixed.symbol).toBe("ETHUSDT");
    expect(fixed.feeRate).toBe(defaults.feeRate);
    expect(fixed.patternConfigLevel).toBe(defaults.patternConfigLevel);
  });

  it("C/D/E/F: automatic/basic/expert can access config manager without exposing expert fields", () => {
    const form = read("components/rextora/strategySearch/JobCreateForm.tsx");
    const css = read("app/globals.css");
    expect(form).toContain('data-testid="ss-config-entry"');
    expect(form).toContain('id="ss-section-config"');
    expect(form).toContain("SearchConfigManager");
    expect(form).toContain('GuidedStepMount active={guided.isStepActive("review")}');
    expect(css).not.toMatch(
      /data-config-level="automatic"[\s\S]*#ss-section-config/,
    );
    expect(css).not.toMatch(
      /data-config-level="basic"[\s\S]*#ss-section-config/,
    );
    expect(css).toContain('#ss-section-engine');
    expect(css).toContain('#ss-section-expert');
    expect(form).toContain('data-config-level={form.patternConfigLevel}');
  });

  it("G: loading a saved config does not start Strategy Search", () => {
    const manager = read(
      "components/rextora/strategySearch/SearchConfigManager.tsx",
    );
    expect(manager).toContain("applySavedOperatorForm");
    expect(manager).toContain("onChange(next)");
    expect(manager).not.toContain("createStrategySearchJob");
    expect(manager).not.toContain("startStrategySearchJob");
    expect(manager).toContain("탐색은 자동으로 시작되지 않습니다");
  });

  it("H/I/J: loaded values sync settings level, summary, and changed-count", () => {
    const formSrc = read("components/rextora/strategySearch/JobCreateForm.tsx");
    expect(formSrc).toContain('value={form.patternConfigLevel}');
    expect(formSrc).toContain("buildAppliedSettingsPreview(form)");
    expect(formSrc).toContain("advancedConditionsStateLabel(form)");
    const original = nonDefaultForm();
    const restored = applySavedOperatorForm(original, { showAdvanced: false });
    expect(restored.patternConfigLevel).toBe("expert");
    const preview = buildAppliedSettingsPreview(restored);
    const defaultPreview = buildAppliedSettingsPreview(
      createDefaultOperatorFormState(),
    );
    expect(preview.rows.map((r) => r.valueKo).join("|")).not.toBe(
      defaultPreview.rows.map((r) => r.valueKo).join("|"),
    );
    expect(advancedChangedFieldCount(restored)).toBeGreaterThan(
      advancedChangedFieldCount(createDefaultOperatorFormState()),
    );
  });

  it("K/L/M/N: rename/duplicate/delete preserve form values and do not clear current form", () => {
    const rootDir = tempRoot();
    const original = nonDefaultForm();
    saveStrategySearchConfig("cfg_src", original, { rootDir });
    renameStrategySearchConfig("cfg_src", "cfg_renamed", { rootDir });
    expect(loadStrategySearchConfig("cfg_src", { rootDir })).toBeNull();
    const renamed = loadStrategySearchConfig("cfg_renamed", { rootDir });
    expect(persistedFieldsEqual(original, applySavedOperatorForm(renamed!.form)).ok).toBe(
      true,
    );
    duplicateStrategySearchConfig("cfg_renamed", "cfg_copy", { rootDir });
    const copy = loadStrategySearchConfig("cfg_copy", { rootDir });
    expect(persistedFieldsEqual(original, applySavedOperatorForm(copy!.form)).ok).toBe(
      true,
    );
    expect(loadStrategySearchConfig("cfg_renamed", { rootDir })).not.toBeNull();
    expect(deleteStrategySearchConfig("cfg_copy", { rootDir })).toBe(true);
    expect(loadStrategySearchConfig("cfg_copy", { rootDir })).toBeNull();
    expect(loadStrategySearchConfig("cfg_renamed", { rootDir })).not.toBeNull();
    const manager = read(
      "components/rextora/strategySearch/SearchConfigManager.tsx",
    );
    expect(manager).toContain("설정을 삭제할까요?");
    expect(manager).toContain("setLoadedConfigName(null)");
    expect(manager).not.toContain("createDefaultOperatorFormState()");
  });

  it("O: customer render avoids raw config identifiers", () => {
    const manager = read(
      "components/rextora/strategySearch/SearchConfigManager.tsx",
    );
    expect(manager).toContain("formatCustomerSearchValue");
    expect(manager).not.toContain("strategySearchRoot");
    expect(manager).not.toContain("schemaVersion");
    expect(manager).not.toMatch(/configs\/[^\s"']+\.json/);
    const customerJsx = manager.slice(
      manager.indexOf('<div className="ss-config-manager"'),
    );
    expect(customerJsx).not.toContain(".json");
    expect(customerJsx).not.toContain("schemaVersion");
    expect(manager).toContain("설정 저장");
    expect(manager).toContain("저장된 설정");
    expect(manager).toContain("불러오기");
    expect(manager).toContain("이름 변경");
    expect(manager).toContain("복제");
    expect(manager).toContain("삭제");
  });

  it("P: mobile layout has no horizontal overflow contract", () => {
    const css = read("components/rextora/v3/strategy-search.css");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain(".ss-config-manager");
    expect(css).toContain("overflow-x: hidden");
    expect(css).toContain("overflow-wrap: anywhere");
  });

  it("Q/R/S: form defaults, validation, and search payload semantics remain unchanged", () => {
    const form = createDefaultOperatorFormState();
    expect(form.patternConfigLevel).toBe("automatic");
    expect(form.tradingStyle).toBe("balanced");
    expect(form.errorWarningRate).toBe("0.35");
    expect(form.errorAutoPauseRate).toBe("0.55");
    expect(form.repeatedSignatureThreshold).toBe("25");
    expect(form.feeRate).toBe("0.0004");
    expect(form.autoStrategyCombo).toBe(true);
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.patternConfigLevel).toBe("automatic");
    expect(body.timeframe).toBe("15m");
    expect(formDefaultsSourceUnchanged()).toBe(true);
  });

  it("persisted field inventory is derived from the canonical default form", () => {
    const keys = persistedOperatorFormKeys();
    expect(keys.length).toBeGreaterThan(40);
    expect(keys).toContain("symbol");
    expect(keys).toContain("patternConfigLevel");
    expect(keys).toContain("selectedSpaceIds");
    expect(keys).toContain("feeRate");
    expect(keys).not.toContain("showAdvanced");
  });
});

function formDefaultsSourceUnchanged(): boolean {
  const defaults = read("components/rextora/strategySearch/formDefaults.ts");
  const validation = read("components/rextora/strategySearch/formValidation.ts");
  return (
    defaults.includes('patternConfigLevel: "automatic"') &&
    defaults.includes('tradingStyle: "balanced"') &&
    validation.includes("buildAppliedSettingsPreview")
  );
}
