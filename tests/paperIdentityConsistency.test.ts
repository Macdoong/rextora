import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  copyStrategy,
  ensureStrategyStore,
  getStrategyById,
  setPaperActiveStrategy,
} from "../src/lib/rextora/strategy/strategyStore";
import { SAFE_STRATEGY_ID } from "../src/lib/rextora/strategy/strategyTypes";
import { createPaperSession } from "../src/lib/rextora/paper/paperSessionStore";
import { installIsolatedStrategyStore } from "./helpers/isolatedStrategyStore";
import { computeStrategyHash } from "../src/lib/rextora/strategy/strategyHash";
import {
  storedToDefinition,
  type StoredStrategyV1,
} from "../src/lib/rextora/strategy/definition/bridge";

describe("paper identity consistency", () => {
  let cleanup: (() => void) | undefined;
  let paperRoot: string | undefined;
  let strategiesRoot: string | undefined;

  beforeEach(() => {
    cleanup?.();
    const isolated = installIsolatedStrategyStore();
    cleanup = isolated.cleanup;
    strategiesRoot = isolated.root;
    ensureStrategyStore();
    if (paperRoot) {
      fs.rmSync(paperRoot, { recursive: true, force: true });
    }
    paperRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rextora-paper-id-"));
    process.env.REXTORA_PAPER_SESSIONS_DIR = paperRoot;
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    strategiesRoot = undefined;
    if (paperRoot) {
      fs.rmSync(paperRoot, { recursive: true, force: true });
      paperRoot = undefined;
    }
    delete process.env.REXTORA_PAPER_SESSIONS_DIR;
  });

  it("hydrates strategyHash for legacy rows without definition", () => {
    const created = copyStrategy(SAFE_STRATEGY_ID, "legacy_no_def");
    const file = path.join(strategiesRoot!, `${created.id}.json`);
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    delete raw.definition;
    delete raw.strategyHash;
    fs.writeFileSync(file, JSON.stringify(raw, null, 2));

    const loaded = getStrategyById(created.id) as StoredStrategyV1;
    expect(loaded.strategyHash).toBeTruthy();
    expect(loaded.strategyHash!.length).toBe(64);
    expect(loaded.strategyHash).not.toBe(loaded.paramsHash);
    expect(loaded.strategyHash).toBe(
      computeStrategyHash(storedToDefinition(loaded)),
    );
  });

  it("paper session identity matches library strategyHash and paramsHash", () => {
    const created = copyStrategy(SAFE_STRATEGY_ID, "paper_id_match");
    const session = createPaperSession({ strategyId: created.id });
    const lib = getStrategyById(created.id)!;
    expect(session.strategyId).toBe(lib.id);
    expect(session.strategyHash).toBe(lib.strategyHash);
    expect(session.sourceParamsHash).toBe(lib.paramsHash);
    expect(session.strategyHash).not.toBe(lib.paramsHash);
  });

  it("setPaperActiveStrategy clears other paperActive flags", () => {
    const a = copyStrategy(SAFE_STRATEGY_ID, "paper_a");
    const b = copyStrategy(SAFE_STRATEGY_ID, "paper_b");
    setPaperActiveStrategy(a.id);
    setPaperActiveStrategy(b.id);
    expect(getStrategyById(a.id)?.paperActive).toBe(false);
    expect(getStrategyById(b.id)?.paperActive).toBe(true);
  });
});
