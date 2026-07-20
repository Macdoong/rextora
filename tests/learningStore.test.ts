import { describe, expect, it, beforeEach } from "vitest";
import path from "node:path";
import {
  loadLearningProfile,
  saveLearningProfile,
  resetLearningProfileForTests,
  LEARNING_PROFILE_FILENAME,
  createDefaultLearningProfile
} from "../src/lib/rextora/learningStore";
import { getDataDir } from "../src/lib/rextora/storage/jsonStore";

describe("learningStore", () => {
  beforeEach(() => {
    resetLearningProfileForTests();
  });

  it("uses learning-profile.json under data/rextora", () => {
    expect(path.join(getDataDir(), LEARNING_PROFILE_FILENAME)).toContain("learning-profile.json");
  });

  it("deep merges default profile fields", () => {
    const defaults = createDefaultLearningProfile();
    saveLearningProfile({
      ...defaults,
      global: { ...defaults.global, trades: 5, wins: 3, losses: 2 }
    });
    const loaded = loadLearningProfile();
    expect(loaded.global.trades).toBe(5);
    expect(loaded.bySymbol).toBeDefined();
    expect(loaded.recentAdjustments).toEqual([]);
  });
});
