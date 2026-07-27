import { describe, expect, it } from "vitest";
import {
  buildCombinedEventSequence,
  buildCombinationSpec,
  combinationParamsForCandidate,
  validatePatternCombination,
  resolveCombinationFromParams,
  combinationLabelKo,
  normalizePatternCombinationSpec,
  blockParameterKey,
  combinationMutationRanges,
} from "../src/lib/rextora/strategySearch/patternCombination";
import { buildPatternEventSequence } from "../src/lib/rextora/strategySearch/patternEventSequence";
import { validateEventSequence } from "../src/lib/rextora/strategy/definition/eventSequence";
import { computeParamsHash } from "../src/lib/rextora/strategy/strategyHash";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";
import {
  baseParamsForPatternSpaceId,
  orderBlockSearchRanges,
} from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import {
  createSeededRandom,
  generateLocalCandidate,
  generateRandomCandidate,
} from "../src/lib/rextora/strategySearch";
import { catalogForPatternFamily } from "../src/lib/rextora/strategySearch/patternParameterCatalog";

describe("pattern combination engine", () => {
  it("builds AND confluence OB + FVG with valid eventSequence", () => {
    const spec = buildCombinationSpec({
      templateId: "confluence",
      families: ["order_block", "fvg"],
      operator: "and",
    });
    expect(validatePatternCombination(spec).ok).toBe(true);
    const seq = buildCombinedEventSequence(spec);
    expect(seq).not.toBeNull();
    expect(validateEventSequence(seq!).ok).toBe(true);
    expect(seq!.combination?.operator).toBe("and");
    expect(seq!.combination?.blocks.map((b) => b.family)).toEqual([
      "order_block",
      "fvg",
    ]);
  });

  it("builds OR and SEQUENCE combinations", () => {
    const orSpec = buildCombinationSpec({
      templateId: "confluence",
      families: ["order_block", "trendline"],
      operator: "or",
    });
    expect(validatePatternCombination(orSpec).ok).toBe(true);
    expect(orSpec.operator).toBe("or");

    const seqSpec = buildCombinationSpec({
      templateId: "ordered_sequence",
      families: ["order_block", "fvg"],
      operator: "sequence",
    });
    expect(validatePatternCombination(seqSpec).ok).toBe(true);
    expect(seqSpec.operator).toBe("sequence");
  });

  it("blocks duplicate families and missing entry_zone", () => {
    const dup = buildCombinationSpec({
      templateId: "confluence",
      families: ["order_block", "order_block"],
    });
    // buildCombinationSpec dedupes — explicit invalid:
    const invalid = {
      ...dup,
      blocks: [
        dup.blocks[0]!,
        { ...dup.blocks[0]!, id: "dup", role: "trend_filter" as const, order: 1 },
      ],
    };
    expect(validatePatternCombination(invalid).ok).toBe(false);

    const noEntry = {
      ...dup,
      blocks: dup.blocks.map((b) => ({
        ...b,
        role: "confirmation" as const,
      })),
    };
    expect(validatePatternCombination(noEntry).ok).toBe(false);
  });

  it("changes identity when operator / role / order change", () => {
    const a = combinationParamsForCandidate(
      buildCombinationSpec({
        templateId: "confluence",
        families: ["order_block", "fvg"],
        operator: "and",
      }),
    );
    const b = combinationParamsForCandidate(
      buildCombinationSpec({
        templateId: "confluence",
        families: ["order_block", "fvg"],
        operator: "or",
      }),
    );
    const c = combinationParamsForCandidate(
      buildCombinationSpec({
        templateId: "ordered_sequence",
        families: ["fvg", "order_block"],
        operator: "sequence",
      }),
    );
    const ha = computeParamsHash({
      ...CONTEXT_FALLBACK_PARAMS,
      ...a,
    } as never);
    const hb = computeParamsHash({
      ...CONTEXT_FALLBACK_PARAMS,
      ...b,
    } as never);
    const hc = computeParamsHash({
      ...CONTEXT_FALLBACK_PARAMS,
      ...c,
    } as never);
    expect(ha).not.toBe(hb);
    expect(ha).not.toBe(hc);
  });

  it("resolveCombinationFromParams + buildPatternEventSequence wire combination", () => {
    const params = {
      ...combinationParamsForCandidate(
        buildCombinationSpec({
          templateId: "zone_confluence",
          families: ["order_block", "fvg", "support_resistance"],
          operator: "and",
        }),
      ),
      penetrationPct: 0.3,
      stopAtrMult: 1.2,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
    };
    const resolved = resolveCombinationFromParams(params);
    expect(resolved?.blocks).toHaveLength(3);
    const seq = buildPatternEventSequence(params);
    expect(seq?.combination?.blocks.length).toBe(3);
    expect(combinationLabelKo(resolved!)).toContain("AND");
  });

  it("four-pattern combination is valid", () => {
    const spec = buildCombinationSpec({
      templateId: "zone_confluence",
      families: [
        "order_block",
        "fvg",
        "trendline",
        "support_resistance",
      ],
      operator: "and",
    });
    expect(validatePatternCombination(spec).ok).toBe(true);
    expect(spec.blocks).toHaveLength(4);
  });

  it("normalizes legacy roles and defaults without rewriting input", () => {
    const legacy = {
      version: 1,
      templateId: "zone_confluence",
      operator: "and",
      invalidationMode: "all",
      blocks: [
        { id: "entry", family: "order_block", role: "entry_zone", order: 0, params: {} },
        { id: "filter", family: "fvg", role: "direction_filter", order: 1, params: {} },
        { id: "stop", family: "trendline", role: "stop_reference", order: 2, params: {} },
        { id: "target", family: "support_resistance", role: "target_reference", order: 3, params: {} },
      ],
    };
    const original = JSON.stringify(legacy);
    const normalized = normalizePatternCombinationSpec(legacy);
    expect(normalized?.blocks.map((block) => block.role)).toEqual([
      "entry_zone",
      "trend_filter",
      "stop_placement",
      "take_profit",
    ]);
    expect(normalized?.failurePolicy).toBe("all");
    expect(normalized?.blocks[0]).toMatchObject({
      required: true,
      weight: 1,
      priority: 0,
    });
    expect(JSON.stringify(legacy)).toBe(original);
  });

  it.each(["and", "or", "sequence", "weighted_score", "priority"] as const)(
    "validates %s operator with every failure policy",
    (operator) => {
      for (const failurePolicy of ["any", "all", "majority"] as const) {
        const spec = buildCombinationSpec({
          templateId: operator === "sequence" ? "ordered_sequence" : "confluence",
          families: ["order_block", "fvg"],
          operator,
          failurePolicy,
          weightedThreshold: operator === "weighted_score" ? 1.5 : null,
        });
        expect(validatePatternCombination(spec)).toEqual({ ok: true, errors: [] });
      }
    },
  );

  it("puts exact catalog parameters for every selected family in candidate identity", () => {
    const spec = buildCombinationSpec({
      templateId: "zone_confluence",
      families: [
        "order_block",
        "fvg",
        "trendline",
        "supply_demand",
      ],
      operator: "weighted_score",
      weightedThreshold: 2,
    });
    spec.blocks[1]!.params.minGapPct = 0.37;
    spec.blocks[2]!.params.slopeMax = 7.25;
    spec.blocks[3]!.params.baseCandleCount = 5;
    const base = {
      ...baseParamsForPatternSpaceId("order_block")!,
      ...combinationParamsForCandidate(spec),
    };
    const ranges = [
      ...orderBlockSearchRanges(),
      ...combinationMutationRanges(spec),
    ];
    const candidate = generateRandomCandidate({
      jobId: "search_00000000-0000-4000-8000-000000000003",
      iteration: 1,
      parameterRanges: ranges,
      random: createSeededRandom(77),
      baseParams: base,
      searchVersion: "active-block-v1",
    });
    const resolved = resolveCombinationFromParams(candidate.params);
    expect(resolved?.blocks).toHaveLength(4);
    for (const block of resolved!.blocks) {
      for (const entry of catalogForPatternFamily(block.family)) {
        const key = blockParameterKey(block.id, entry.key);
        expect(candidate.params[key]).toBeDefined();
        expect(block.params[entry.key]).toBe(candidate.params[key]);
      }
    }
    const changed = {
      ...candidate.params,
      [blockParameterKey(spec.blocks[1]!.id, "minGapPct")]: 0.99,
    };
    expect(computeParamsHash(changed)).not.toBe(candidate.paramsHash);
  });

  it("mutates only catalog-owned eligible block fields plus validated structure", () => {
    const spec = buildCombinationSpec({
      templateId: "entry_confirmation",
      families: ["order_block", "fvg"],
      operator: "and",
    });
    const base = {
      ...baseParamsForPatternSpaceId("order_block")!,
      ...combinationParamsForCandidate(spec),
    };
    const ranges = [
      ...orderBlockSearchRanges(),
      ...combinationMutationRanges(spec),
    ];
    const parent = generateRandomCandidate({
      jobId: "search_00000000-0000-4000-8000-000000000004",
      iteration: 1,
      parameterRanges: ranges,
      random: createSeededRandom(10),
      baseParams: base,
      searchVersion: "active-block-v1",
    });
    const child = generateLocalCandidate({
      jobId: parent.jobId,
      iteration: 2,
      parameterRanges: ranges,
      random: createSeededRandom(11),
      parentCandidate: parent,
      mutationScale: 0.5,
      searchVersion: "active-block-v1",
    });
    const allowed = new Set(ranges.map((range) => range.key));
    const structural = new Set([
      "combinationTemplate",
      "combinationOperator",
      "combinationInvalidationMode",
      "combinationFailurePolicy",
      "combinationWeightedThreshold",
      "combinationFamilies",
      "combinationRoles",
      "combinationOrders",
      "combinationBlocks",
    ]);
    for (const key of Object.keys(child.params)) {
      if (child.params[key] !== parent.params[key]) {
        expect(allowed.has(key) || structural.has(key)).toBe(true);
      }
    }
    const nonEligible = blockParameterKey(spec.blocks[1]!.id, "minGapAbs");
    expect(child.params[nonEligible]).toBe(parent.params[nonEligible]);
    expect(validatePatternCombination(resolveCombinationFromParams(child.params)!)).toEqual({
      ok: true,
      errors: [],
    });
  });
});
