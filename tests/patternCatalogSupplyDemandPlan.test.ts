import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
} from "../components/rextora/strategySearch/formDefaults";
import type { OhlcvCandle } from "../src/lib/rextora/data/ohlcvTypes";
import { detectSupplyDemand } from "../src/lib/rextora/strategy/conditions/supplyDemand";
import { buildSupplyDemandSequence } from "../src/lib/rextora/strategy/definition/eventSequence";
import {
  PATTERN_PARAMETER_CATALOG,
  PATTERN_SEARCH_SPACE_IDS,
  catalogRangesForPatternFamily,
  createEmptySearchPlan,
  createStrategySearchJobApi,
  getSearchPlan,
  normalizePatternCombinationSpec,
  saveSearchPlan,
} from "../src/lib/rextora/strategySearch";

const roots: string[] = [];
const tempRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-pattern-plan-"));
  roots.push(root);
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function candle(
  index: number,
  open: number,
  high: number,
  low: number,
  close: number,
): OhlcvCandle {
  return {
    openTime: Date.UTC(2025, 0, 1) + index * 60_000,
    closeTime: Date.UTC(2025, 0, 1) + (index + 1) * 60_000 - 1,
    open,
    high,
    low,
    close,
    volume: 100,
  };
}

const detectorParams = {
  lookback: 20,
  baseCandleCount: 2,
  maxBaseRangeAtrMult: 1,
  minDepartureAtrMult: 1,
  minDeparturePct: 0.3,
  zoneBodyOnly: false,
  maxAgeBars: 20,
  firstTouchOnly: true,
  requireRejectionClose: false,
  invalidateOnCloseBeyond: true,
};

describe("canonical pattern parameter catalog", () => {
  it("covers every searchable family with detector-backed bounded fields", () => {
    expect(PATTERN_SEARCH_SPACE_IDS).toContain("supply_demand");
    for (const family of PATTERN_SEARCH_SPACE_IDS) {
      const entries = PATTERN_PARAMETER_CATALOG[family];
      expect(entries.length).toBeGreaterThan(8);
      expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length);
      for (const entry of entries) {
        expect(entry.labelKo).not.toBe("");
        expect(entry.detectorField).not.toBe("");
        expect(entry.explanationLabel).not.toBe("");
        expect(["enum", "int", "float", "bool"]).toContain(entry.type);
      }
      expect(catalogRangesForPatternFamily(family).map((range) => range.key)).toEqual(
        entries
          .filter((entry) => entry.mutationEligible)
          .map((entry) => entry.key),
      );
    }
  });
});

describe("supply/demand completed-candle detector and sequence", () => {
  it("detects a demand base/departure retest without observing future candles", () => {
    const candles = [
      candle(0, 100, 100.4, 99.8, 100.1),
      candle(1, 100.1, 100.5, 99.9, 100.2),
      candle(2, 100.2, 104.5, 100.1, 104),
      candle(3, 104, 104.3, 102.5, 103),
      candle(4, 103, 103.2, 100.3, 102),
      candle(5, 1, 1, 1, 1),
    ];
    const result = detectSupplyDemand(candles, 4, 1, "demand", detectorParams);
    expect(result.hit).toBe(true);
    expect(result.zone).toMatchObject({
      kind: "demand",
      departureBar: 2,
      high: 100.5,
      low: 99.8,
    });

    const changedFuture = candles.map((item) => ({ ...item }));
    changedFuture[5] = candle(5, 10_000, 20_000, 1, 15_000);
    expect(
      detectSupplyDemand(changedFuture, 4, 1, "demand", detectorParams),
    ).toEqual(result);
  });

  it("builds a canonical supply/demand event sequence", () => {
    const seq = buildSupplyDemandSequence({
      penetrationPct: 0.45,
      stopAtrMult: 1.2,
      tpAtrMult: 2,
      maxHoldBars: 48,
      zoneLookback: 40,
      baseCandleCount: 2,
      maxBaseRangeAtrMult: 1,
      minDepartureAtrMult: 1,
      minDeparturePct: 0.3,
      zoneBodyOnly: false,
      firstTouchOnly: true,
      requireRejectionClose: false,
      invalidateOnCloseBeyond: true,
    });
    expect(seq.steps[0]).toMatchObject({
      kind: "pattern_creation",
      patternFamily: "supply_demand",
    });
    expect(seq.steps.map((step) => step.kind)).toContain("max_hold_exit");
  });
});

describe("immutable combination Search Plan persistence", () => {
  it("deep-normalizes and detaches block configs from callers", () => {
    const raw = {
      version: 1,
      templateId: "confluence",
      operator: "and",
      invalidationMode: "any",
      blocks: [
        {
          id: "ob",
          family: "order_block",
          role: "entry_zone",
          order: 0,
          params: { minImpulseAtrMult: 1.1 },
        },
        {
          id: "sd",
          family: "supply_demand",
          role: "confirmation",
          order: 1,
          params: { baseCandleCount: 3 },
        },
      ],
    };
    const spec = normalizePatternCombinationSpec(raw);
    expect(spec).not.toBeNull();
    const plan = createEmptySearchPlan({
      searchName: "immutable",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 1,
      candidateBudget: 10,
      stageBatchSize: 5,
      maxRuntimeMs: 60_000,
      spaces: [{ id: "order_block", labelKo: "OB" }],
      patternCombinationSpec: spec,
    });
    raw.blocks[0]!.params.minImpulseAtrMult = 9;
    expect(plan.patternCombinationSpec?.blocks[0]?.params.minImpulseAtrMult).toBe(
      1.1,
    );
    expect(Object.isFrozen(plan.patternCombinationSpec?.blocks[0]?.params)).toBe(
      true,
    );

    const root = tempRoot();
    const jobId = "search_00000000-0000-4000-8000-000000000001";
    saveSearchPlan(jobId, plan, { rootDir: root });
    const first = getSearchPlan(jobId, { rootDir: root })!;
    const second = getSearchPlan(jobId, { rootDir: root })!;
    expect(first.patternCombinationSpec).toEqual(second.patternCombinationSpec);
    expect(first.patternCombinationSpec).not.toBe(second.patternCombinationSpec);
  });

  it("persists API block configs and preserves the protected SAFE snapshot", () => {
    const safePath = path.join(
      process.cwd(),
      "data",
      "strategies",
      "SAFE_v44_i4060.json",
    );
    const safeBefore = fs.readFileSync(safePath);
    const safeJson = JSON.parse(safeBefore.toString("utf8")) as {
      params_hash: string;
    };
    expect(safeJson.params_hash).toBe("7893ca3f0e30");

    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = false;
    form.selectedSpaceIds = ["order_block"];
    form.patternCombinationFamilies = ["order_block", "supply_demand"];
    form.patternCombinationTemplate = "confluence";
    form.patternCombinationBlocks = [
      {
        id: "ob",
        family: "order_block",
        role: "entry_zone",
        order: 0,
        params: { minImpulseAtrMult: 1.4 },
      },
      {
        id: "sd",
        family: "supply_demand",
        role: "confirmation",
        order: 1,
        params: { baseCandleCount: 3 },
      },
    ];
    const root = tempRoot();
    const created = createStrategySearchJobApi(operatorFormToCreateBody(form), {
      rootDir: root,
    });
    const persisted = getSearchPlan(created.id, { rootDir: root });
    expect(persisted?.patternCombinationSpec?.blocks[1]?.params).toEqual({
      baseCandleCount: 3,
    });
    expect(fs.readFileSync(safePath)).toEqual(safeBefore);
  });
});
