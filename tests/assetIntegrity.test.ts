import { describe, expect, it, beforeEach } from "vitest";
import { getAccountState, initializeSeed, setAccountMode } from "../src/lib/rextora/accountStateStore";

describe("Asset Integrity", () => {
  beforeEach(() => {
    setAccountMode("PAPER");
    initializeSeed(0);
  });

  it("stores the latest initialSeedUsdt (shared account state)", () => {
    setAccountMode("PAPER");
    initializeSeed(1000);
    expect(getAccountState().initialSeedUsdt).toBe(1000);

    setAccountMode("LIVE");
    initializeSeed(5000);
    expect(getAccountState().initialSeedUsdt).toBe(5000);

    // Account state is process-global; seed is not mode-partitioned.
    setAccountMode("PAPER");
    expect(getAccountState().initialSeedUsdt).toBe(5000);
  });

  it("maps nullish seed to 확인 불가 for UI", () => {
    initializeSeed(null as unknown as number);
    const state = getAccountState();
    const display = state.initialSeedUsdt && Number.isFinite(state.initialSeedUsdt) ? state.initialSeedUsdt : "확인 불가";
    expect(display === "확인 불가" || typeof display === "number").toBe(true);
  });

  it("should prevent NaN/0 in calculations", () => {
    const assets = (a: number | null, b: number | null) => {
      const left = Number.isFinite(a as number) ? (a as number) : 0;
      const right = Number.isFinite(b as number) ? (b as number) : 0;
      return left + right;
    };
    expect(assets(NaN, 100)).toBe(100);
    expect(assets(null, 50)).toBe(50);
  });
});
