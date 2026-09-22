/**
 * Pattern Settings → Engine traceability matrix (STEP 3).
 * Uses canonical builders + store APIs — not mocked form-only tests.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  operatorFormToCreateBody,
  createDefaultOperatorFormState,
  type StrategySearchOperatorFormState,
} from "../components/rextora/strategySearch/formDefaults";
import {
  resolvePatternSelectionMode,
  selectedSpaceIdsForSelectionMode,
} from "../src/lib/rextora/patternSelectionMode";
import {
  normalizePatternCombinationSpec,
  validatePatternCombination,
  buildCombinedEventSequence,
} from "../src/lib/rextora/strategySearch/patternCombination";
import {
  buildOrderBlockLongSequence,
  buildFvgSequence,
  buildTrendlineSequence,
  buildSupportResistanceSequence,
  buildSupplyDemandSequence,
} from "../src/lib/rextora/strategy/definition/eventSequence";
import {
  readOrderBlockParams,
  readFvgParams,
  readTrendlineParams,
  readSupportResistanceParams,
  readSupplyDemandParams,
} from "../src/lib/rextora/strategySearch/patternSearchSpaces";
import { catalogDefaultsForPatternFamily } from "../src/lib/rextora/strategySearch/patternParameterCatalog";
import { validateCreateSearchJobBody } from "../src/lib/rextora/strategySearch/jobApiValidation";
import { buildPersistedSearchSummary } from "../src/lib/rextora/strategySearch/persistedSearchSummary";
import {
  createSearchJob,
  getSearchJob,
} from "../src/lib/rextora/strategySearch/jobStore";
import {
  createEmptySearchPlan,
  saveSearchPlan,
  getSearchPlan,
} from "../src/lib/rextora/strategySearch/searchPlan";
import { buildPatternEventSequence } from "../src/lib/rextora/strategySearch/patternEventSequence";

const SAFE = path.join(process.cwd(), "data", "strategies", "SAFE_v44_i4060.json");

function sha256Snippet(file: string): { size: number; head: string } {
  if (!fs.existsSync(file)) return { size: 0, head: "" };
  const buf = fs.readFileSync(file);
  return { size: buf.length, head: buf.subarray(0, 32).toString("hex") };
}

function minimalCreateBody(
  operatorPlan: Record<string, unknown>,
): Record<string, unknown> {
  const base = operatorFormToCreateBody(createDefaultOperatorFormState());
  return {
    ...base,
    operatorPlan: {
      ...base.operatorPlan,
      ...operatorPlan,
    },
  };
}

describe("pattern settings → engine traceability", () => {
  let tmpRoot = "";
  let safeBefore = { size: 0, head: "" };

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-trace-"));
    process.env.REXTORA_STRATEGY_SEARCH_DIR = path.join(tmpRoot, "strategy-search");
    fs.mkdirSync(process.env.REXTORA_STRATEGY_SEARCH_DIR, { recursive: true });
    safeBefore = sha256Snippet(SAFE);
  });

  afterEach(() => {
    delete process.env.REXTORA_STRATEGY_SEARCH_DIR;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("1. automatic mode nulls selectedSpaceIds and disables manual application", () => {
    const form = createDefaultOperatorFormState();
    expect(form.patternConfigLevel).toBe("automatic");
    expect(form.autoStrategyCombo).toBe(true);
    const mode = resolvePatternSelectionMode(form);
    expect(mode).toBe("automatic");
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.patternSelectionMode).toBe("automatic");
    expect(body.operatorPlan?.selectedSpaceIds).toBeNull();
    expect(
      selectedSpaceIdsForSelectionMode("automatic", ["order_block"]),
    ).toBeNull();
  });

  it("2. basic OB-only produces OB-permitted spaces in payload", () => {
    const form: StrategySearchOperatorFormState = {
      ...createDefaultOperatorFormState(),
      patternConfigLevel: "basic",
      autoStrategyCombo: false,
      selectedSpaceIds: ["order_block"],
      patternCombinationFamilies: ["order_block"],
      patternCombinationBlocks: [
        {
          id: "order_block_0",
          family: "order_block",
          role: "entry_zone",
          order: 0,
          required: true,
          weight: 1,
          priority: 0,
          params: { ...catalogDefaultsForPatternFamily("order_block") },
        },
      ],
    };
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.patternSelectionMode).toBe("manual");
    expect(body.operatorPlan?.selectedSpaceIds).toEqual(["order_block"]);
    expect(body.operatorPlan?.patternCombinationFamilies).toEqual([
      "order_block",
    ]);
  });

  it("3. basic FVG + Trendline persists both families", () => {
    const form: StrategySearchOperatorFormState = {
      ...createDefaultOperatorFormState(),
      patternConfigLevel: "basic",
      autoStrategyCombo: false,
      selectedSpaceIds: ["fvg", "trendline"],
      patternCombinationOperator: "and",
      patternCombinationFamilies: ["fvg", "trendline"],
      patternCombinationBlocks: [
        {
          id: "fvg_0",
          family: "fvg",
          role: "entry_zone",
          order: 0,
          required: true,
          weight: 1,
          priority: 0,
          params: { ...catalogDefaultsForPatternFamily("fvg") },
        },
        {
          id: "trendline_1",
          family: "trendline",
          role: "trend_filter",
          order: 1,
          required: true,
          weight: 1,
          priority: 1,
          params: { ...catalogDefaultsForPatternFamily("trendline") },
        },
      ],
    };
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.selectedSpaceIds).toEqual(["fvg", "trendline"]);
    expect(body.operatorPlan?.patternCombinationFamilies).toEqual([
      "fvg",
      "trendline",
    ]);
    expect(body.operatorPlan?.patternCombinationSpec?.blocks).toHaveLength(2);
  });

  it("4. expert OB+FVG AND stores and builds AND combination", () => {
    const spec = normalizePatternCombinationSpec({
      version: 1,
      templateId: "confluence",
      operator: "and",
      failurePolicy: "any",
      invalidationMode: "any",
      blocks: [
        {
          id: "order_block_0",
          family: "order_block",
          role: "entry_zone",
          order: 0,
          required: true,
          weight: 1,
          priority: 0,
          params: catalogDefaultsForPatternFamily("order_block"),
        },
        {
          id: "fvg_1",
          family: "fvg",
          role: "confirmation",
          order: 1,
          required: true,
          weight: 1,
          priority: 1,
          params: catalogDefaultsForPatternFamily("fvg"),
        },
      ],
    });
    expect(spec).not.toBeNull();
    expect(spec!.operator).toBe("and");
    const seq = buildCombinedEventSequence(spec!);
    expect(seq?.combination?.operator).toBe("and");
  });

  it("5. expert OR stores and executes OR", () => {
    const spec = normalizePatternCombinationSpec({
      version: 1,
      templateId: "confluence",
      operator: "or",
      failurePolicy: "any",
      invalidationMode: "any",
      blocks: [
        {
          id: "fvg_0",
          family: "fvg",
          role: "entry_zone",
          order: 0,
          required: true,
          weight: 1,
          priority: 0,
          params: catalogDefaultsForPatternFamily("fvg"),
        },
        {
          id: "trendline_1",
          family: "trendline",
          role: "trend_filter",
          order: 1,
          required: true,
          weight: 1,
          priority: 1,
          params: catalogDefaultsForPatternFamily("trendline"),
        },
      ],
    });
    expect(spec!.operator).toBe("or");
    expect(buildCombinedEventSequence(spec!)?.combination?.operator).toBe("or");
  });

  it("6. SEQUENCE preserves block order", () => {
    const spec = normalizePatternCombinationSpec({
      version: 1,
      templateId: "ordered_sequence",
      operator: "sequence",
      failurePolicy: "any",
      invalidationMode: "any",
      blocks: [
        {
          id: "trendline_0",
          family: "trendline",
          role: "trend_filter",
          order: 0,
          required: true,
          weight: 1,
          priority: 0,
          params: catalogDefaultsForPatternFamily("trendline"),
        },
        {
          id: "order_block_1",
          family: "order_block",
          role: "entry_zone",
          order: 1,
          required: true,
          weight: 1,
          priority: 1,
          params: catalogDefaultsForPatternFamily("order_block"),
        },
      ],
    });
    const orders = spec!.blocks.map((b) => b.order);
    expect(orders).toEqual([0, 1]);
    expect(spec!.blocks.map((b) => b.family)).toEqual([
      "trendline",
      "order_block",
    ]);
    expect(buildCombinedEventSequence(spec!)?.combination?.operator).toBe(
      "sequence",
    );
  });

  it("7. required and optional blocks are persisted on the canonical spec", () => {
    const spec = normalizePatternCombinationSpec({
      version: 1,
      templateId: "confluence",
      operator: "and",
      failurePolicy: "any",
      invalidationMode: "any",
      blocks: [
        {
          id: "order_block_0",
          family: "order_block",
          role: "entry_zone",
          order: 0,
          required: true,
          weight: 1,
          priority: 0,
          params: catalogDefaultsForPatternFamily("order_block"),
        },
        {
          id: "fvg_1",
          family: "fvg",
          role: "confirmation",
          order: 1,
          required: false,
          weight: 1,
          priority: 1,
          params: catalogDefaultsForPatternFamily("fvg"),
        },
      ],
    });
    expect(spec!.blocks.find((b) => b.family === "fvg")?.required).toBe(false);
    expect(
      buildCombinedEventSequence(spec!)?.combination?.blocks.find(
        (b) => b.family === "fvg",
      )?.required,
    ).toBe(false);
  });

  it("8. majority failure policy does not collapse to any", () => {
    const form: StrategySearchOperatorFormState = {
      ...createDefaultOperatorFormState(),
      patternConfigLevel: "expert",
      autoStrategyCombo: false,
      selectedSpaceIds: ["order_block", "fvg"],
      patternCombinationFailurePolicy: "majority",
      patternCombinationOperator: "and",
      patternCombinationFamilies: ["order_block", "fvg"],
      patternCombinationBlocks: [
        {
          id: "order_block_0",
          family: "order_block",
          role: "entry_zone",
          order: 0,
          required: true,
          weight: 1,
          priority: 0,
          params: catalogDefaultsForPatternFamily("order_block"),
        },
        {
          id: "fvg_1",
          family: "fvg",
          role: "confirmation",
          order: 1,
          required: true,
          weight: 1,
          priority: 1,
          params: catalogDefaultsForPatternFamily("fvg"),
        },
      ],
    };
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.patternCombinationFailurePolicy).toBe("majority");
    expect(body.operatorPlan?.patternCombinationInvalidationMode).toBe(
      "majority",
    );
    expect(body.operatorPlan?.patternCombinationSpec?.failurePolicy).toBe(
      "majority",
    );
    expect(body.operatorPlan?.patternCombinationSpec?.invalidationMode).toBe(
      "majority",
    );
    const normalized = normalizePatternCombinationSpec(
      body.operatorPlan!.patternCombinationSpec,
    );
    expect(normalized?.failurePolicy).toBe("majority");
    expect(normalized?.invalidationMode).toBe("majority");
  });

  it("9. unsupported combination operator fails validation", () => {
    expect(() =>
      validateCreateSearchJobBody(
        minimalCreateBody({
          patternCombinationOperator: "xor_not_real",
          selectedSpaceIds: ["order_block"],
          patternSelectionMode: "manual",
        }),
      ),
    ).toThrow(/invalid/i);
  });

  it("10. OB body-zone setting reaches detector params in canonical sequence", () => {
    const defaults = catalogDefaultsForPatternFamily("order_block");
    const params = readOrderBlockParams({
      ...defaults,
      zoneBasis: "BODY",
    });
    expect(params.zoneBasis).toBe("BODY");
    expect(params.bodyOnly).toBe(true);
    const seq = buildOrderBlockLongSequence(params);
    const creation = seq.steps.find((s) => s.kind === "pattern_creation");
    expect(creation?.params.zoneBasis).toBe("BODY");
    expect(creation?.params.bodyOnly).toBe(true);
  });

  it("11. OB penetration/retest changes canonical entry + revisit", () => {
    const a = buildOrderBlockLongSequence(
      readOrderBlockParams({
        ...catalogDefaultsForPatternFamily("order_block"),
        penetrationPct: 0.2,
        requireTouch: true,
      }),
    );
    const b = buildOrderBlockLongSequence(
      readOrderBlockParams({
        ...catalogDefaultsForPatternFamily("order_block"),
        penetrationPct: 0.8,
        requireTouch: false,
      }),
    );
    expect(a.steps.find((s) => s.kind === "penetration")?.params.penetrationPct).toBe(
      0.2,
    );
    expect(b.steps.find((s) => s.kind === "penetration")?.params.penetrationPct).toBe(
      0.8,
    );
    expect(a.steps.find((s) => s.kind === "revisit")?.params.requireTouch).toBe(
      true,
    );
    expect(b.steps.find((s) => s.kind === "revisit")?.params.requireTouch).toBe(
      false,
    );
  });

  it("12. FVG entry trigger is connected (not defaults-only)", () => {
    const params = readFvgParams({
      ...catalogDefaultsForPatternFamily("fvg"),
      entryExecution: "NEXT_BAR_OPEN",
      touchBasis: "CLOSE",
      maxBarsAfterTouch: 3,
    });
    const seq = buildFvgSequence(params);
    const entry = seq.steps.find((s) => s.kind === "entry");
    expect(entry?.params.entryExecution).toBe("NEXT_BAR_OPEN");
    expect(entry?.params.touchBasis).toBe("CLOSE");
    expect(entry?.params.maxBarsAfterTouch).toBe(3);
  });

  it("13. Trendline entry trigger is connected", () => {
    const params = readTrendlineParams({
      ...catalogDefaultsForPatternFamily("trendline"),
      entryExecution: "TOUCH_PRICE",
      revalidateAtEntry: false,
    });
    const seq = buildTrendlineSequence(params);
    const entry = seq.steps.find((s) => s.kind === "entry");
    expect(entry?.params.entryExecution).toBe("TOUCH_PRICE");
    expect(entry?.params.revalidateAtEntry).toBe(false);
  });

  it("14. Support/Resistance entry trigger is connected", () => {
    const params = readSupportResistanceParams({
      ...catalogDefaultsForPatternFamily("support_resistance"),
      entryExecution: "LIMIT_AT_ZONE_LEVEL",
      entryPriceTolerancePct: 0.25,
    });
    const seq = buildSupportResistanceSequence(params);
    const entry = seq.steps.find((s) => s.kind === "entry");
    expect(entry?.params.entryExecution).toBe("LIMIT_AT_ZONE_LEVEL");
    expect(entry?.params.entryPriceTolerancePct).toBe(0.25);
  });

  it("15. Supply/Demand entry trigger is connected", () => {
    const params = readSupplyDemandParams({
      ...catalogDefaultsForPatternFamily("supply_demand"),
      entryExecution: "NEXT_BAR_OPEN",
      maxBarsAfterConfirmation: 2,
    });
    const seq = buildSupplyDemandSequence(params);
    const entry = seq.steps.find((s) => s.kind === "entry");
    expect(entry?.params.entryExecution).toBe("NEXT_BAR_OPEN");
    expect(entry?.params.maxBarsAfterConfirmation).toBe(2);
  });

  it("16. leverage mode remains in plan through create path", () => {
    const validated = validateCreateSearchJobBody(
      minimalCreateBody({
        patternSelectionMode: "manual",
        selectedSpaceIds: ["order_block"],
        leverageMode: "fixed",
        leverageFixed: 4,
        adaptiveLeverageEnabled: false,
        patternConfigLevel: "basic",
      }),
    );
    expect(validated.operatorPlan?.leverageMode).toBe("fixed");
    expect(validated.operatorPlan?.leverageFixed).toBe(4);
    const job = createSearchJob(
      {
        ...(validated.config as never),
      },
      { rootDir: process.env.REXTORA_STRATEGY_SEARCH_DIR },
    );
    saveSearchPlan(
      job.id,
      createEmptySearchPlan({
        searchName: "lev",
        depthProfile: "fast",
        qualificationProfile: "balanced",
        qualifiedTarget: 1,
        candidateBudget: 10,
        stageBatchSize: 5,
        maxRuntimeMs: 60_000,
        spaces: [{ id: "order_block", labelKo: "OB" }],
        leverageMode: validated.operatorPlan!.leverageMode,
        leverageFixed: validated.operatorPlan!.leverageFixed,
        patternSelectionMode: "manual",
        patternConfigLevel: "basic",
      }),
      { rootDir: process.env.REXTORA_STRATEGY_SEARCH_DIR },
    );
    const plan = getSearchPlan(job.id, {
      rootDir: process.env.REXTORA_STRATEGY_SEARCH_DIR,
    });
    expect(plan?.leverageMode).toBe("fixed");
    expect(plan?.leverageFixed).toBe(4);
  });

  it("17. Results applied-settings summary matches canonical combination", () => {
    const job = createSearchJob(
      {
        searchVersion: "1",
        strategyTemplateId: "summary",
        symbols: ["BTCUSDT"],
        timeframe: "15m",
        dataVersion: "binance-v1",
        seed: 1,
        generatorType: "random",
        maxIterations: 5,
        parameterRanges: [
          { key: "placeholder", min: 1, max: 2, step: 1, type: "int" },
        ],
        evaluationWindows: [
          {
            id: "full",
            fromOpenTime: Date.UTC(2024, 0, 1),
            toOpenTime: Date.UTC(2024, 0, 2),
          },
        ],
        passCriteria: { minTradeCount: 1, minTotalReturn: 0, maxMdd: 1 },
      } as never,
      { rootDir: process.env.REXTORA_STRATEGY_SEARCH_DIR },
    );
    const spec = normalizePatternCombinationSpec({
      version: 1,
      templateId: "confluence",
      operator: "and",
      failurePolicy: "majority",
      invalidationMode: "majority",
      blocks: [
        {
          id: "order_block_0",
          family: "order_block",
          role: "entry_zone",
          order: 0,
          required: true,
          weight: 1,
          priority: 0,
          params: catalogDefaultsForPatternFamily("order_block"),
        },
        {
          id: "fvg_1",
          family: "fvg",
          role: "confirmation",
          order: 1,
          required: false,
          weight: 2,
          priority: 1,
          params: catalogDefaultsForPatternFamily("fvg"),
        },
      ],
    });
    saveSearchPlan(
      job.id,
      createEmptySearchPlan({
        searchName: "summary",
        depthProfile: "fast",
        qualificationProfile: "balanced",
        qualifiedTarget: 1,
        candidateBudget: 10,
        stageBatchSize: 5,
        maxRuntimeMs: null,
        spaces: [{ id: "order_block", labelKo: "OB" }],
        patternSelectionMode: "manual",
        patternConfigLevel: "expert",
        patternDirection: "both",
        patternRetestMode: "required",
        patternConfirmStrength: "standard",
        patternConfirmClose: "required",
        patternCombinationOperator: "and",
        patternCombinationFailurePolicy: "majority",
        patternCombinationInvalidationMode: "majority",
        patternCombinationFamilies: ["order_block", "fvg"],
        patternCombinationSpec: spec,
      }),
      { rootDir: process.env.REXTORA_STRATEGY_SEARCH_DIR },
    );
    const summary = buildPersistedSearchSummary(job.id, {
      rootDir: process.env.REXTORA_STRATEGY_SEARCH_DIR,
    });
    expect(summary).not.toBeNull();
    const patternSection = summary!.sections.find(
      (s) => s.id === "pattern_config",
    );
    expect(patternSection).toBeTruthy();
    expect(
      patternSection!.rows.find((r) => r.labelKo === "조합 연산자")?.valueKo,
    ).toBe("AND");
    expect(
      patternSection!.rows.find((r) => r.labelKo === "실패 정책")?.valueKo,
    ).toContain("MAJORITY");
    expect(
      patternSection!.rows.find((r) => r.labelKo === "블록 (역할·필수·가중·우선)")
        ?.valueKo,
    ).toContain("선택");
    expect(summary!.developerPayload.patternCombinationSpec).toBeTruthy();
  });

  it("18. backtest inspector source: combination operator on sequence evidence path", () => {
    const seq = buildCombinedEventSequence(
      normalizePatternCombinationSpec({
        version: 1,
        templateId: "confluence",
        operator: "priority",
        failurePolicy: "all",
        invalidationMode: "all",
        blocks: [
          {
            id: "order_block_0",
            family: "order_block",
            role: "entry_zone",
            order: 0,
            required: true,
            weight: 1,
            priority: 0,
            params: catalogDefaultsForPatternFamily("order_block"),
          },
          {
            id: "supply_demand_1",
            family: "supply_demand",
            role: "confirmation",
            order: 1,
            required: true,
            weight: 1,
            priority: 2,
            params: catalogDefaultsForPatternFamily("supply_demand"),
          },
        ],
      })!,
    );
    expect(seq?.combination?.operator).toBe("priority");
    expect(seq?.combination?.failurePolicy).toBe("all");
    expect(seq?.combination?.blocks).toHaveLength(2);
  });

  it("19. no selectedSpaceIds regression when switching automatic → manual", () => {
    const auto = createDefaultOperatorFormState();
    expect(operatorFormToCreateBody(auto).operatorPlan?.selectedSpaceIds).toBeNull();
    const manual: StrategySearchOperatorFormState = {
      ...auto,
      patternConfigLevel: "basic",
      autoStrategyCombo: false,
      selectedSpaceIds: ["order_block", "fvg"],
    };
    const body = operatorFormToCreateBody(manual);
    expect(body.operatorPlan?.patternSelectionMode).toBe("manual");
    expect(body.operatorPlan?.selectedSpaceIds).toEqual([
      "order_block",
      "fvg",
    ]);
  });

  it("20. retired SAFE file remains absent", () => {
    expect(fs.existsSync(SAFE)).toBe(false);
    expect(sha256Snippet(SAFE)).toEqual({ size: 0, head: "" });
  });

  it("institutional OB quality fields reach pattern_creation", () => {
    const params = readOrderBlockParams({
      ...catalogDefaultsForPatternFamily("order_block"),
      institutionalQuality: true,
      minSourceBodyPct: 0.2,
      requireBodyEngulf: true,
    });
    expect(params.institutionalQuality).toBe(true);
    const seq = buildOrderBlockLongSequence(params);
    const creation = seq.steps.find((s) => s.kind === "pattern_creation");
    expect(creation?.params.institutionalQuality).toBe(true);
    expect(creation?.params.minSourceBodyPct).toBe(0.2);
    expect(creation?.params.requireBodyEngulf).toBe(true);
  });

  it("patternEventSequence single-family OB carries institutional + entry trigger", () => {
    const seq = buildPatternEventSequence(
      {
        ...catalogDefaultsForPatternFamily("order_block"),
        institutionalQuality: true,
        entryExecution: "NEXT_BAR_OPEN",
      },
      "order_block",
    );
    expect(seq).not.toBeNull();
    expect(
      seq!.steps.find((s) => s.kind === "pattern_creation")?.params
        .institutionalQuality,
    ).toBe(true);
    expect(
      seq!.steps.find((s) => s.kind === "entry")?.params.entryExecution,
    ).toBe("NEXT_BAR_OPEN");
  });

  it("invalid majority-only invalidationMode still normalizes to majority failurePolicy", () => {
    const spec = normalizePatternCombinationSpec({
      version: 1,
      templateId: "single",
      operator: "and",
      invalidationMode: "majority",
      blocks: [
        {
          id: "order_block_0",
          family: "order_block",
          role: "entry_zone",
          order: 0,
          required: true,
          weight: 1,
          priority: 0,
          params: catalogDefaultsForPatternFamily("order_block"),
        },
      ],
    });
    expect(spec?.failurePolicy).toBe("majority");
    expect(spec?.invalidationMode).toBe("majority");
    expect(validatePatternCombination(spec!).ok).toBe(true);
  });
});
