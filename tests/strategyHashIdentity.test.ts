import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultDefinition } from "../src/lib/rextora/strategy/definition/validator";
import {
  computeStrategyHash,
} from "../src/lib/rextora/strategy/strategyHash";
import {
  buildCombinationSpec,
  buildCombinedEventSequence,
} from "../src/lib/rextora/strategySearch/patternCombination";
import { RETIRED_SAFE_PARAMS_HASH, RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


function definition() {
  const eventSequence = buildCombinedEventSequence(
    buildCombinationSpec({
      templateId: "confluence",
      families: ["order_block", "fvg"],
      operator: "and",
      failurePolicy: "majority",
    }),
  )!;
  return defaultDefinition({
    strategyId: "strategy_a",
    strategyName: "Editable label",
    description: "Editable description",
    timeframe: "15m",
    symbols: ["BTCUSDT"],
    eventSequence,
    metadata: {
      lev_min: 1,
      lev_base: 2,
      lev_max: 3,
      use_dynamic_leverage: true,
    },
  });
}

function changed(
  mutate: (value: ReturnType<typeof definition>) => void,
): string {
  const value = structuredClone(definition());
  mutate(value);
  return computeStrategyHash(value);
}

describe("canonical strategyHash identity", () => {
  it("changes for family, role, order, param, operator, and leverage", () => {
    const baseline = computeStrategyHash(definition());
    const hashes = [
      changed((value) => {
        value.eventSequence!.combination!.blocks[1]!.family = "trendline";
      }),
      changed((value) => {
        value.eventSequence!.combination!.blocks[1]!.role = "confirmation";
      }),
      changed((value) => {
        value.eventSequence!.combination!.blocks[0]!.order = 1;
        value.eventSequence!.combination!.blocks[1]!.order = 0;
      }),
      changed((value) => {
        value.eventSequence!.combination!.blocks[0]!.params.lookback = 999;
      }),
      changed((value) => {
        value.eventSequence!.combination!.operator = "or";
      }),
      changed((value) => {
        value.metadata.lev_base = 4;
      }),
    ];
    expect(new Set(hashes).size).toBe(hashes.length);
    for (const hash of hashes) expect(hash).not.toBe(baseline);
  });

  it("ignores display labels and volatile timestamps", () => {
    const baseline = definition();
    const renamed = structuredClone(baseline);
    renamed.strategyName = "Renamed";
    renamed.description = "Changed display description";
    renamed.strategyId = "strategy_b";
    renamed.createdAt = "2035-01-01T00:00:00.000Z";
    renamed.updatedAt = "2036-01-01T00:00:00.000Z";
    renamed.metadata.displayName = "Alias";
    renamed.metadata.updatedAt = "2037-01-01T00:00:00.000Z";
    expect(computeStrategyHash(renamed)).toBe(computeStrategyHash(baseline));
  });

  it("does not resurrect the retired SAFE source", () => {
    const safePath = path.join(
      process.cwd(),
      "data",
      "strategies",
      `${RETIRED_SAFE_STRATEGY_ID}.json`,
    );
    expect(fs.existsSync(safePath)).toBe(false);
    expect(RETIRED_SAFE_PARAMS_HASH).toBe("7893ca3f0e30");
    computeStrategyHash(definition());
    expect(fs.existsSync(safePath)).toBe(false);
  });
});
