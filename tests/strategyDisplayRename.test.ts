import { describe, expect, it } from "vitest";
import {
  createStrategy,
  getStrategyById,
  updateStrategyDisplayMeta,
} from "../src/lib/rextora/strategy/strategyStore";

import {
  buildCombinationSpec,
  buildCombinedEventSequence,
} from "../src/lib/rextora/strategySearch/patternCombination";
import { defaultDefinition } from "../src/lib/rextora/strategy/definition/validator";
import { RETIRED_SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/retiredSafeBaseline";


describe("strategy display rename preserves identity", () => {
  it("renaming displayAlias does not change paramsHash or id", () => {
    const seq = buildCombinedEventSequence(
      buildCombinationSpec({
        templateId: "confluence",
        families: ["order_block", "fvg"],
        operator: "and",
      }),
    );
    const created = createStrategy({
      name: "변동성 돌파 · 공격형",
      displayAlias: "OB-FVG-01 · 구간 중첩 · BTCUSDT 15m",
      displayName: "변동성 돌파 · 공격형",
      strategyType: "condition_builder",
      timeframe: "15m",
      definition: defaultDefinition({
        strategyId: "pending",
        strategyName: "변동성 돌파 · 공격형",
        strategyType: "condition_builder",
        timeframe: "15m",
        eventSequence: seq!,
      }),
    });
    expect(created.id).not.toBe(RETIRED_SAFE_STRATEGY_ID);
    expect(created.paramsHash).not.toBe("7893ca3f0e30");
    const beforeHash = created.paramsHash;
    const beforeStrategyHash = created.strategyHash;
    const beforeId = created.id;

    const renamed = updateStrategyDisplayMeta(created.id, {
      displayAlias: "Z99 · 구간 중첩 · BTCUSDT 15m",
      displayName: "사용자 이름",
    });
    expect(renamed.id).toBe(beforeId);
    expect(renamed.paramsHash).toBe(beforeHash);
    expect(renamed.strategyHash).toBe(beforeStrategyHash);
    expect(renamed.displayAlias).toBe("Z99 · 구간 중첩 · BTCUSDT 15m");
    expect(renamed.displayName).toBe("사용자 이름");

    const readBack = getStrategyById(created.id);
    expect(readBack?.displayAlias).toBe("Z99 · 구간 중첩 · BTCUSDT 15m");
    expect(readBack?.paramsHash).toBe(beforeHash);
  });
});
