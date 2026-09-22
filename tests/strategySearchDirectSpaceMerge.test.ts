import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SEARCHABLE_SPACE_OPTIONS,
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
} from "../components/rextora/strategySearch/formDefaults";
import {
  DIRECT_AUTOMATIC_ONLY_SPACE_IDS,
  DIRECT_LAYER_IDS,
  DIRECT_SUPPLEMENTAL_SPACE_IDS,
  mergeDirectVisualSpaceIds,
  visualSpaceIdsForDirectMode,
} from "../components/rextora/strategySearch/visual/searchVisualCopy";
import { SEARCH_DEPTH_PROFILES } from "../src/lib/rextora/strategySearch/operatorProfiles";
import {
  rangesForSpace,
  resolveSelectedSearchSpaces,
} from "../src/lib/rextora/strategySearch/searchSpaces";

describe("Direct Strategy selectedSpaceIds merge", () => {
  it("proves Expert Direct can independently select risk_exits", () => {
    expect(SEARCHABLE_SPACE_OPTIONS.map((space) => space.id)).toContain(
      "risk_exits",
    );
    expect([...DIRECT_SUPPLEMENTAL_SPACE_IDS]).toEqual(["risk_exits"]);
    expect(DIRECT_LAYER_IDS).not.toContain("risk_exits");
    const formSrc = fs.readFileSync(
      path.join(
        process.cwd(),
        "components",
        "rextora",
        "strategySearch",
        "JobCreateForm.tsx",
      ),
      "utf8",
    );
    expect(formSrc).toContain("SEARCHABLE_SPACE_OPTIONS.map");
    expect(formSrc).toContain("ss-space-${space.id}");
    expect(formSrc).toContain("mergeDirectVisualSpaceIds");
  });

  it("preserves risk_exits across a Direct visual-layer toggle", () => {
    const current = ["order_block", "fvg", "risk_exits"];
    const afterEnableEma = mergeDirectVisualSpaceIds(current, [
      "order_block",
      "fvg",
      "ema_core",
    ]);
    expect(afterEnableEma).toEqual([
      "order_block",
      "fvg",
      "ema_core",
      "risk_exits",
    ]);
    const afterDisableFvg = mergeDirectVisualSpaceIds(afterEnableEma, [
      "order_block",
      "ema_core",
    ]);
    expect(afterDisableFvg).toContain("risk_exits");
    expect(afterDisableFvg).not.toContain("fvg");
  });

  it("does not reintroduce automatic-only leftovers and de-duplicates", () => {
    expect([...DIRECT_AUTOMATIC_ONLY_SPACE_IDS]).toEqual([
      "rsi_pullback",
      "breakout",
      "full_safe",
    ]);
    const leaked = [
      "order_block",
      "fvg",
      "risk_exits",
      "rsi_pullback",
      "breakout",
      "full_safe",
      "risk_exits",
      "unknown_space",
    ];
    const merged = mergeDirectVisualSpaceIds(leaked, [
      "order_block",
      "fvg",
      "order_block",
    ]);
    expect(merged).toEqual(["order_block", "fvg", "risk_exits"]);
    expect(merged.filter((id) => id === "risk_exits")).toHaveLength(1);
    expect(merged).not.toContain("rsi_pullback");
    expect(merged).not.toContain("breakout");
    expect(merged).not.toContain("full_safe");
    expect(merged).not.toContain("unknown_space");
  });

  it("Direct entry still drops automatic leftovers including bundled risk_exits", () => {
    const defaults = createDefaultOperatorFormState();
    expect(defaults.selectedSpaceIds).toEqual(
      SEARCHABLE_SPACE_OPTIONS.map((space) => space.id),
    );
    expect(visualSpaceIdsForDirectMode(defaults.selectedSpaceIds)).toEqual(
      DIRECT_LAYER_IDS,
    );
    expect(visualSpaceIdsForDirectMode(defaults.selectedSpaceIds)).not.toContain(
      "risk_exits",
    );
  });
});

describe("Direct manual OB+FVG ATR mutation ranges", () => {
  it("resolves stopAtrMult and tpAtrMult from the real space-range path", () => {
    const form = createDefaultOperatorFormState();
    form.autoStrategyCombo = false;
    form.patternConfigLevel = "basic";
    form.selectedSpaceIds = ["order_block", "fvg"];
    const body = operatorFormToCreateBody(form);
    expect(body.operatorPlan?.patternSelectionMode).toBe("manual");
    expect(body.operatorPlan?.selectedSpaceIds).toEqual([
      "order_block",
      "fvg",
    ]);
    expect(body.operatorPlan?.patternCombinationFamilies).toBeNull();
    expect(body.operatorPlan?.patternCombinationSpec).toBeNull();

    const spaces = resolveSelectedSearchSpaces(
      body.operatorPlan?.selectedSpaceIds,
      SEARCH_DEPTH_PROFILES.standard.spaceIds,
    );
    expect(spaces.map((space) => space.id)).toEqual(["order_block", "fvg"]);
    const ranges = spaces.flatMap((space) => rangesForSpace(space));
    expect(ranges.some((range) => range.key === "stopAtrMult")).toBe(true);
    expect(ranges.some((range) => range.key === "tpAtrMult")).toBe(true);
    expect(ranges.find((range) => range.key === "stopAtrMult")?.min).toBe(0.5);
    expect(ranges.find((range) => range.key === "tpAtrMult")?.min).toBe(0.75);
  });
});
