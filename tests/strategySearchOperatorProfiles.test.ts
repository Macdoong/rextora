import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createEmptySearchPlan,
  getSearchDepthProfile,
  getQualificationProfile,
  resolveSpacesForDepth,
} from "../src/lib/rextora/strategySearch";
import {
  SAFE_V44_SEARCH_SPACES,
  getSearchSpaceById,
  rangesForSpace,
} from "../src/lib/rextora/strategySearch/searchSpaces";
import { buildReadableStrategyIdentity } from "../src/lib/rextora/strategySearch/readableStrategyName";
import { CONTEXT_FALLBACK_PARAMS } from "../src/lib/rextora/strategy/safeV44Params";

describe("strategySearch operator profiles + spaces + names", () => {
  it("depth profiles map to verified budgets and spaces", () => {
    const fast = getSearchDepthProfile("fast");
    const deep = getSearchDepthProfile("deep");
    expect(fast.candidateBudget).toBeLessThan(deep.candidateBudget);
    expect(fast.jitterEnabled).toBe(false);
    expect(deep.jitterEnabled).toBe(true);
    const spaces = resolveSpacesForDepth("standard");
    expect(spaces.length).toBeGreaterThan(1);
    expect(
      spaces.every((s) => SAFE_V44_SEARCH_SPACES.some((x) => x.id === s.id)),
    ).toBe(true);
  });

  it("qualification profiles map to PASS-friendly thresholds", () => {
    const c = getQualificationProfile("conservative");
    const a = getQualificationProfile("aggressive");
    expect(c.maxMddAbs!).toBeLessThan(a.maxMddAbs!);
    expect(c.minTradeCount!).toBeGreaterThan(a.minTradeCount!);
  });

  it("search spaces only use SafeV44 catalog keys", () => {
    for (const space of SAFE_V44_SEARCH_SPACES) {
      const def = getSearchSpaceById(space.id);
      expect(def).not.toBeNull();
      const r = rangesForSpace(def!);
      expect(r.length).toBeGreaterThan(0);
    }
  });

  it("readable names are deterministic and hide hash by default", () => {
    const params = { ...CONTEXT_FALLBACK_PARAMS, ema_fast: 12 };
    const a = buildReadableStrategyIdentity(params, "abcdef123456");
    const b = buildReadableStrategyIdentity(params, "abcdef123456");
    expect(a.readableName).toBe(b.readableName);
    expect(a.readableName.includes("abcdef123456")).toBe(false);
    expect(a.readableName).not.toMatch(/\([a-f0-9]{4}\)/i);
    expect(a.readableName).toMatch(/균형형|공격형|보수형/);
    expect(a.strategyTypeLabelKo.length).toBeGreaterThan(0);
  });

  it("creates a versioned empty search plan", () => {
    const plan = createEmptySearchPlan({
      searchName: "테스트",
      depthProfile: "fast",
      qualificationProfile: "balanced",
      qualifiedTarget: 3,
      candidateBudget: 80,
      stageBatchSize: 20,
      maxRuntimeMs: 60_000,
      spaces: resolveSpacesForDepth("fast").map((s) => ({
        id: s.id,
        labelKo: s.labelKo,
      })),
    });
    expect(plan.version).toBe(1);
    expect(plan.spaces[0]?.status).toBe("active");
    expect(plan.completionReason).toBeNull();
  });

  it("SAFE research file remains present with protected hash", () => {
    const p = path.join(
      process.cwd(),
      "data",
      "strategies",
      "SAFE_v44_i4060.json",
    );
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.readFileSync(p, "utf8")).toContain("7893ca3f0e30");
  });
});
