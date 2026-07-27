/**
 * FINAL_READY_VERIFY regression: OR/SEQUENCE/4-pattern/leverage Plan→candidate
 * and S/R chart overlay selection persistence contract.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
} from "@/components/rextora/strategySearch/formDefaults";
import {
  createStrategySearchJobApi,
  getStrategySearchJobApi,
} from "@/src/lib/rextora/strategySearch/jobApiService";
import { getSearchPlan } from "@/src/lib/rextora/strategySearch/searchPlan";
import { applyLeverageModeToParams } from "@/src/lib/rextora/strategySearch/leverageMode";

function tmpStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-final-ready-"));
  return { rootDir: root };
}

function blocks(
  families: string[],
  roles: Array<"entry_zone" | "trend_filter" | "confirmation" | "invalidation">,
) {
  return families.map((family, order) => ({
    id: `${family}_${order}`,
    family: family as
      | "order_block"
      | "fvg"
      | "trendline"
      | "support_resistance",
    role: roles[order] ?? ("trend_filter" as const),
    order,
    required: true,
    weight: 1,
    priority: order,
    params: {},
  }));
}

describe("FINAL_READY_VERIFY operator and leverage mapping", () => {
  it("OR request → Plan → detail preserves operator and two families", () => {
    const store = tmpStore();
    const form = createDefaultOperatorFormState();
    form.searchName = "FINAL_READY_VERIFY_OR_TEST";
    form.durationPreset = "15";
    form.maxRuntimeMinutesOverride = "15";
    form.autoStrategyCombo = false;
    form.patternConfigLevel = "basic";
    form.leverageMode = "automatic";
    form.selectedSpaceIds = ["order_block", "fvg"];
    form.patternCombinationFamilies = ["order_block", "fvg"];
    form.patternCombinationOperator = "or";
    form.patternCombinationTemplate = "confluence";
    form.patternCombinationBlocks = blocks(
      ["order_block", "fvg"],
      ["entry_zone", "trend_filter"],
    );
    form.jitterEnabled = true;
    const created = createStrategySearchJobApi(
      operatorFormToCreateBody(form),
      store,
    );
    const plan = getSearchPlan(created.id, store);
    expect(plan?.patternCombinationOperator).toBe("or");
    expect(plan?.patternCombinationFamilies).toEqual(["order_block", "fvg"]);
    expect(plan?.patternConfigLevel).toBe("basic");
    expect(plan?.leverageMode).toBe("automatic");
    expect(plan?.spaces.map((s) => s.id)).toEqual(["order_block"]);
    expect(
      plan?.spaces.some((s) => /ema|safe|rsi|breakout/i.test(s.id)),
    ).toBe(false);
    const detail = getStrategySearchJobApi(created.id, store);
    expect(detail.patternCombinationFamilies).toEqual(["order_block", "fvg"]);

    const profile = JSON.parse(
      fs.readFileSync(
        path.join(store.rootDir, "jobs", `${created.id}.execution.json`),
        "utf8",
      ),
    );
    expect(profile.jitterConfig.enabled).toBe(true);
    expect(profile.jitterConfig.parameterRanges.map((r: { key: string }) => r.key)).toContain(
      "direction",
    );
    expect(profile.jitterConfig.parameterRanges.map((r: { key: string }) => r.key)).not.toEqual([
      "ema_fast",
    ]);
  });

  it("SEQUENCE request → Plan preserves ordered roles", () => {
    const store = tmpStore();
    const form = createDefaultOperatorFormState();
    form.searchName = "FINAL_READY_VERIFY_SEQUENCE_TEST";
    form.durationPreset = "15";
    form.maxRuntimeMinutesOverride = "15";
    form.autoStrategyCombo = false;
    form.selectedSpaceIds = ["order_block", "fvg"];
    form.patternCombinationFamilies = ["order_block", "fvg"];
    form.patternCombinationOperator = "sequence";
    form.patternCombinationTemplate = "ordered_sequence";
    form.patternCombinationBlocks = blocks(
      ["order_block", "fvg"],
      ["entry_zone", "confirmation"],
    );
    const created = createStrategySearchJobApi(
      operatorFormToCreateBody(form),
      store,
    );
    const plan = getSearchPlan(created.id, store);
    expect(plan?.patternCombinationOperator).toBe("sequence");
    expect(plan?.patternCombinationSpec?.blocks.map((b) => b.role)).toEqual([
      "entry_zone",
      "confirmation",
    ]);
    expect(plan?.patternCombinationSpec?.templateId).toBe("ordered_sequence");
  });

  it("four-pattern AND Plan keeps all families and roles without SafeV44 leak", () => {
    const store = tmpStore();
    const form = createDefaultOperatorFormState();
    form.searchName = "FINAL_READY_VERIFY_4PATTERN_TEST";
    form.durationPreset = "15";
    form.maxRuntimeMinutesOverride = "15";
    form.autoStrategyCombo = false;
    form.patternConfigLevel = "automatic";
    form.selectedSpaceIds = [
      "order_block",
      "fvg",
      "trendline",
      "support_resistance",
    ];
    form.patternCombinationFamilies = [
      "order_block",
      "fvg",
      "trendline",
      "support_resistance",
    ];
    form.patternCombinationOperator = "and";
    form.patternCombinationTemplate = "confluence";
    form.patternCombinationBlocks = blocks(
      ["order_block", "fvg", "trendline", "support_resistance"],
      ["entry_zone", "trend_filter", "confirmation", "invalidation"],
    );
    const created = createStrategySearchJobApi(
      operatorFormToCreateBody(form),
      store,
    );
    const plan = getSearchPlan(created.id, store)!;
    expect(plan.patternCombinationFamilies).toHaveLength(4);
    expect(plan.patternCombinationSpec?.blocks.map((b) => b.family)).toEqual([
      "order_block",
      "fvg",
      "trendline",
      "support_resistance",
    ]);
    expect(plan.spaces.map((s) => s.id)).toEqual(["order_block"]);
  });

  it.each([
    ["automatic", { leverageMode: "automatic" as const, leverageMin: 1, leverageMax: 5 }, true, [1, 5]],
    ["fixed", { leverageMode: "fixed" as const, leverageFixed: 3 }, false, [3, 3]],
    ["range", { leverageMode: "range" as const, leverageMin: 2, leverageMax: 4 }, false, [2, 4]],
    ["disabled", { leverageMode: "disabled" as const }, false, [1, 1]],
  ] as const)(
    "leverage %s maps into candidate params",
    (_label, policy, expectDyn, [min, max]) => {
      const params = applyLeverageModeToParams(
        {
          lev_min: 1.2,
          lev_base: 2,
          lev_max: 5,
          use_dynamic_leverage: true,
        },
        policy,
      );
      expect(params.use_dynamic_leverage).toBe(expectDyn);
      expect(params.lev_min).toBe(min);
      expect(params.lev_max).toBe(max);
      if (_label === "disabled") {
        expect(params.lev_base).toBe(1);
      }
      if (_label === "fixed") {
        expect(params.lev_base).toBe(3);
      }
    },
  );

  it("Automatic / Basic / Expert config levels persist on Plan", () => {
    for (const level of ["automatic", "basic", "expert"] as const) {
      const store = tmpStore();
      const form = createDefaultOperatorFormState();
      form.searchName = `FINAL_READY_VERIFY_CFG_${level}`;
      form.durationPreset = "15";
      form.maxRuntimeMinutesOverride = "15";
      form.autoStrategyCombo = false;
      form.patternConfigLevel = level;
      form.selectedSpaceIds = ["order_block"];
      form.patternCombinationFamilies = ["order_block"];
      form.patternCombinationTemplate = "single";
      form.patternCombinationBlocks = blocks(["order_block"], ["entry_zone"]);
      if (level === "basic") form.patternStrength = "strict";
      if (level === "expert") {
        form.patternExpiryBars = "72";
        form.patternConfirmationWindow = "6";
      }
      const created = createStrategySearchJobApi(
        operatorFormToCreateBody(form),
        store,
      );
      const plan = getSearchPlan(created.id, store);
      expect(plan?.patternConfigLevel).toBe(level);
    }
  });
});

describe("S/R main-chart overlay contract", () => {
  it("drawer close must not clear selected trade (source contract)", () => {
    const src = fs.readFileSync(
      path.join(
        process.cwd(),
        "components/rextora/charts/BacktestAnalysisView.tsx",
      ),
      "utf8",
    );
    expect(src).toContain("Close the drawer only");
    expect(src).toContain("setDrawerTrade(null)");
    // Must not clear selection on drawer close anymore.
    expect(src).not.toMatch(
      /onClose=\{\(\)\s*=>\s*\{\s*setDrawerTrade\(null\);\s*setSelectedTradeId\(null\)/,
    );
    const chartSrc = fs.readFileSync(
      path.join(process.cwd(), "components/rextora/charts/CandlestickChart.tsx"),
      "utf8",
    );
    expect(chartSrc).toContain('data-testid="chart-zone-rect"');
  });

  it("persisted S/R run retains geometry for overlay", () => {
    const runPath = path.join(
      process.cwd(),
      "data/rextora/backtests/bt_ms31e01l_5d6b9f.json",
    );
    if (!fs.existsSync(runPath)) return;
    const run = JSON.parse(fs.readFileSync(runPath, "utf8")) as {
      trades: Array<{
        patternType?: string;
        zoneHigh?: number;
        zoneLow?: number;
        patternBlocks?: Array<{ family: string; zoneHigh?: number; zoneLow?: number }>;
      }>;
    };
    const t0 = run.trades[0];
    expect(t0?.patternType).toBe("support_resistance");
    expect(t0?.zoneHigh).toBeGreaterThan(t0!.zoneLow!);
    expect(t0?.patternBlocks?.[0]?.family).toBe("support_resistance");
  });
});
