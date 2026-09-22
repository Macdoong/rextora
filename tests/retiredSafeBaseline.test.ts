import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  GENERIC_SEARCH_BASELINE_PARAMS,
} from "../src/lib/rextora/strategy/safeV44Params";
import { isLockedSafeHash } from "../src/lib/rextora/strategy/strategyHash";
import {
  NO_PAPER_STRATEGY,
  RETIRED_SAFE_PARAMS_HASH,
  RETIRED_SAFE_STRATEGY_ID,
  isRetiredSafeId,
  isRetiredSafeIdentity,
  neutralizeRetiredStrategyId,
} from "../src/lib/rextora/strategy/retiredSafeBaseline";
import {
  ensureStrategyStore,
  getPaperActiveStrategy,
  listStrategies,
} from "../src/lib/rextora/strategy/strategyStore";
import { getStrategyLiveApprovalState } from "../src/lib/rextora/strategyLiveApproval";

const ENV_KEY = "REXTORA_STRATEGIES_DIR";
let cleanup: (() => void) | null = null;

function isolate() {
  const prev = process.env[ENV_KEY];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-no-safe-"));
  process.env[ENV_KEY] = root;
  cleanup = () => {
    if (prev === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = prev;
    fs.rmSync(root, { recursive: true, force: true });
  };
  return root;
}

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe("retired SAFE baseline", () => {
  it("does not auto-inject SAFE and treats empty store as valid", () => {
    isolate();
    expect(ensureStrategyStore()).toEqual([]);
    expect(listStrategies()).toEqual([]);
    expect(getPaperActiveStrategy()).toBeNull();
    expect(fs.existsSync(path.join(process.cwd(), "data/strategies/SAFE_v44_i4060.json"))).toBe(false);
  });

  it("migrates stale SAFE paperActive and store files to none", () => {
    const root = isolate();
    fs.writeFileSync(
      path.join(root, "index.json"),
      JSON.stringify({
        version: 1,
        strategies: [
          {
            id: RETIRED_SAFE_STRATEGY_ID,
            name: RETIRED_SAFE_STRATEGY_ID,
            paperActive: true,
            liveActive: true,
          },
        ],
      }),
    );
    fs.writeFileSync(
      path.join(root, `${RETIRED_SAFE_STRATEGY_ID}.json`),
      JSON.stringify({ id: RETIRED_SAFE_STRATEGY_ID, locked: true }),
    );
    expect(listStrategies()).toEqual([]);
    expect(getPaperActiveStrategy()).toBeNull();
    expect(fs.existsSync(path.join(root, `${RETIRED_SAFE_STRATEGY_ID}.json`))).toBe(false);
  });

  it("live approval default is none and stale SAFE ids neutralize", () => {
    expect(isRetiredSafeId(RETIRED_SAFE_STRATEGY_ID)).toBe(true);
    expect(isRetiredSafeIdentity(RETIRED_SAFE_STRATEGY_ID)).toBe(true);
    expect(isRetiredSafeIdentity(RETIRED_SAFE_PARAMS_HASH)).toBe(true);
    expect(isRetiredSafeIdentity("custom_abc")).toBe(false);
    expect(neutralizeRetiredStrategyId(RETIRED_SAFE_STRATEGY_ID)).toBeNull();
    const state = getStrategyLiveApprovalState();
    expect(state.strategyId == null || !isRetiredSafeId(state.strategyId)).toBe(true);
    if (isRetiredSafeId(state.strategyId)) {
      expect(state.verifiedForLive).toBe(false);
    }
  });

  it("search baseline is generic and hash lock is retired", () => {
    expect(GENERIC_SEARCH_BASELINE_PARAMS.ema_slow).toBeTypeOf("number");
    expect(isLockedSafeHash(RETIRED_SAFE_PARAMS_HASH)).toBe(false);
    const runner = fs.readFileSync(
      path.join(process.cwd(), "src/lib/rextora/strategySearch/jobRunner.ts"),
      "utf8",
    );
    expect(runner).toContain("GENERIC_SEARCH_BASELINE_PARAMS");
    expect(runner).not.toContain("CONTEXT_FALLBACK_PARAMS");
    expect(NO_PAPER_STRATEGY).toContain("전략");
  });
});
