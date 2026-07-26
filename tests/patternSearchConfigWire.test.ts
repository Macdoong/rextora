import { describe, expect, it } from "vitest";
import {
  operatorFormToCreateBody,
  createDefaultOperatorFormState,
} from "../components/rextora/strategySearch/formDefaults";
import { validateCreateSearchJobBody } from "../src/lib/rextora/strategySearch/jobApiValidation";
import {
  applyPatternOperatorConfigToBaseParams,
  applyPatternOperatorConfigToRanges,
  patternConfigFromPlanFields,
} from "../src/lib/rextora/strategySearch/patternSearchConfig";
import {
  ORDER_BLOCK_BASE_PARAMS,
  orderBlockSearchRanges,
} from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import { createEmptySearchPlan } from "../src/lib/rextora/strategySearch/searchPlan";
import type { StrategySearchParameterRange } from "../src/lib/rextora/strategySearch/types";

function sampleCreateBody() {
  return operatorFormToCreateBody(createDefaultOperatorFormState());
}

describe("patternSearchConfig wire", () => {
  it("automatic mode leaves ranges and base unchanged", () => {
    const ranges = orderBlockSearchRanges();
    const base = { ...ORDER_BLOCK_BASE_PARAMS };
    expect(
      applyPatternOperatorConfigToRanges(ranges, null),
    ).toEqual(ranges);
    expect(
      applyPatternOperatorConfigToBaseParams(base, null),
    ).toEqual(base);
    expect(patternConfigFromPlanFields({ patternConfigLevel: "automatic" })).toBeNull();
  });

  it("basic config tightens penetration on required retest + strict confirm", () => {
    const config = patternConfigFromPlanFields({
      patternConfigLevel: "basic",
      patternRetestMode: "required",
      patternConfirmStrength: "strict",
      patternExpiryBars: 48,
    })!;
    const ranges = applyPatternOperatorConfigToRanges(
      orderBlockSearchRanges(),
      config,
    );
    const penetration = ranges.find((r) => r.key === "penetrationPct")!;
    expect(penetration.max).toBeLessThan(0.8);
    expect(penetration.defaultValue).toBeLessThan(0.45);
    const stop = ranges.find((r) => r.key === "stopAtrMult")!;
    expect(stop.defaultValue).toBeGreaterThan(1.2);
  });

  it("optional retest widens penetration max vs required", () => {
    const required = patternConfigFromPlanFields({
      patternConfigLevel: "basic",
      patternRetestMode: "required",
    })!;
    const optional = patternConfigFromPlanFields({
      patternConfigLevel: "basic",
      patternRetestMode: "optional",
    })!;
    const reqMax = applyPatternOperatorConfigToRanges(
      orderBlockSearchRanges(),
      required,
    ).find((r) => r.key === "penetrationPct")!.max as number;
    const optMax = applyPatternOperatorConfigToRanges(
      orderBlockSearchRanges(),
      optional,
    ).find((r) => r.key === "penetrationPct")!.max as number;
    expect(optMax).toBeGreaterThan(reqMax);
  });

  it("disabled retest clears requireTouch and widens penetration vs optional", () => {
    const optional = patternConfigFromPlanFields({
      patternConfigLevel: "basic",
      patternRetestMode: "optional",
    })!;
    const disabled = patternConfigFromPlanFields({
      patternConfigLevel: "basic",
      patternRetestMode: "disabled",
      patternConfirmClose: "disabled",
    })!;
    const optMax = applyPatternOperatorConfigToRanges(
      orderBlockSearchRanges(),
      optional,
    ).find((r) => r.key === "penetrationPct")!.max as number;
    const disMax = applyPatternOperatorConfigToRanges(
      orderBlockSearchRanges(),
      disabled,
    ).find((r) => r.key === "penetrationPct")!.max as number;
    expect(disMax).toBeGreaterThan(optMax);
    const base = applyPatternOperatorConfigToBaseParams(
      { ...ORDER_BLOCK_BASE_PARAMS },
      disabled,
    );
    expect(base.requireTouch).toBe(false);
    expect(base.requireCloseInDirection).toBe(false);
  });

  it("pattern strength and sr sensitivity adjust existing keys only", () => {
    const config = patternConfigFromPlanFields({
      patternConfigLevel: "basic",
      patternStrength: "strict",
      patternSrSensitivity: "tight",
    })!;
    const base = applyPatternOperatorConfigToBaseParams(
      {
        ...ORDER_BLOCK_BASE_PARAMS,
        minTouches: 2,
        tolerancePct: 0.35,
        zoneWidthPct: 0.25,
      },
      config,
    );
    expect(base.zoneLookback as number).toBeGreaterThan(
      ORDER_BLOCK_BASE_PARAMS.zoneLookback,
    );
    expect(base.minTouches as number).toBeGreaterThan(2);
    expect(base.tolerancePct as number).toBeLessThan(0.35);
  });

  it("expiry bars centers maxHoldBars range default", () => {
    const config = patternConfigFromPlanFields({
      patternConfigLevel: "expert",
      patternExpiryBars: 60,
    })!;
    const hold = applyPatternOperatorConfigToRanges(
      orderBlockSearchRanges(),
      config,
    ).find((r) => r.key === "maxHoldBars")!;
    expect(hold.defaultValue).toBe(60);
    expect(hold.min).toBeLessThanOrEqual(60);
    expect(hold.max).toBeGreaterThanOrEqual(60);
  });

  it("risk style adjusts stop/tp defaults in base params", () => {
    const conservative = patternConfigFromPlanFields({
      patternConfigLevel: "basic",
      patternRiskStyle: "conservative",
    })!;
    const aggressive = patternConfigFromPlanFields({
      patternConfigLevel: "basic",
      patternRiskStyle: "aggressive",
    })!;
    const cBase = applyPatternOperatorConfigToBaseParams(
      { ...ORDER_BLOCK_BASE_PARAMS },
      conservative,
    );
    const aBase = applyPatternOperatorConfigToBaseParams(
      { ...ORDER_BLOCK_BASE_PARAMS },
      aggressive,
    );
    expect(cBase.stopAtrMult).toBeGreaterThan(aBase.stopAtrMult as number);
    expect(cBase.tpAtrMult).toBeLessThan(aBase.tpAtrMult as number);
  });

  it("sets direction on pattern base params", () => {
    const config = patternConfigFromPlanFields({
      patternConfigLevel: "basic",
      patternDirection: "short",
    })!;
    const base = applyPatternOperatorConfigToBaseParams(
      { ...ORDER_BLOCK_BASE_PARAMS },
      config,
    );
    expect(base.direction).toBe("short");
  });

  it("operator form includes pattern fields on operatorPlan", () => {
    const form = createDefaultOperatorFormState();
    form.patternConfigLevel = "basic";
    form.patternDirection = "long";
    form.patternRetestMode = "optional";
    form.patternConfirmStrength = "strict";
    form.patternExpiryBars = "36";
    form.patternRiskStyle = "conservative";
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.patternConfigLevel).toBe("basic");
    expect(body.operatorPlan?.patternDirection).toBe("long");
    expect(body.operatorPlan?.patternRetestMode).toBe("optional");
    expect(body.operatorPlan?.patternConfirmStrength).toBe("strict");
    expect(body.operatorPlan?.patternExpiryBars).toBe(36);
    expect(body.operatorPlan?.patternRiskStyle).toBe("conservative");
  });

  it("API validation accepts pattern operator plan fields", () => {
    const body = sampleCreateBody();
    body.operatorPlan = {
      ...body.operatorPlan!,
      patternConfigLevel: "expert",
      patternDirection: "both",
      patternRetestMode: "required",
      patternConfirmStrength: "standard",
      patternExpiryBars: 48,
      patternRiskStyle: "balanced",
    };
    const validated = validateCreateSearchJobBody(body);
    expect(validated.operatorPlan?.patternConfigLevel).toBe("expert");
    expect(validated.operatorPlan?.patternExpiryBars).toBe(48);
  });

  it("API validation rejects invalid pattern expiry", () => {
    const body = sampleCreateBody();
    body.operatorPlan = {
      ...body.operatorPlan!,
      patternConfigLevel: "basic",
      patternExpiryBars: 5,
    };
    expect(() => validateCreateSearchJobBody(body)).toThrow();
  });

  it("createEmptySearchPlan persists pattern snapshot", () => {
    const plan = createEmptySearchPlan({
      searchName: "test",
      depthProfile: "standard",
      qualificationProfile: "balanced",
      qualifiedTarget: 3,
      candidateBudget: 100,
      stageBatchSize: 20,
      maxRuntimeMs: 60_000,
      spaces: [{ id: "order_block", labelKo: "Order Block" }],
      patternConfigLevel: "basic",
      patternDirection: "long",
      patternRetestMode: "required",
      patternConfirmStrength: "strict",
      patternExpiryBars: 36,
      patternRiskStyle: "aggressive",
    });
    expect(plan.patternConfigLevel).toBe("basic");
    expect(plan.patternDirection).toBe("long");
    expect(plan.patternExpiryBars).toBe(36);
  });

  it("does not invent unknown range keys", () => {
    const sample: StrategySearchParameterRange[] = [
      { key: "penetrationPct", min: 0.2, max: 0.8, step: 0.05, valueType: "float" },
    ];
    const config = patternConfigFromPlanFields({
      patternConfigLevel: "basic",
      patternRiskStyle: "conservative",
    })!;
    const out = applyPatternOperatorConfigToRanges(sample, config);
    expect(out.map((r) => r.key)).toEqual(["penetrationPct"]);
  });

  it("persisted summary module includes pattern section when level is basic/expert", () => {
    const src = require("node:fs").readFileSync(
      require("node:path").join(
        process.cwd(),
        "src/lib/rextora/strategySearch/persistedSearchSummary.ts",
      ),
      "utf8",
    ) as string;
    expect(src).toContain("pattern_config");
    expect(src).toContain("패턴 탐색 설정");
    const plan = createEmptySearchPlan({
      searchName: "패턴",
      depthProfile: "standard",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 50,
      stageBatchSize: 10,
      maxRuntimeMs: null,
      spaces: [{ id: "fvg", labelKo: "FVG" }],
      patternConfigLevel: "basic",
      patternDirection: "both",
      patternRetestMode: "optional",
      patternConfirmStrength: "standard",
      patternExpiryBars: 48,
      patternRiskStyle: "balanced",
    });
    expect(patternConfigFromPlanFields(plan)?.patternRetestMode).toBe("optional");
  });
});
