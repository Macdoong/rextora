import { describe, expect, it } from "vitest";
import {
  RUNNER_CHECKPOINT_VERSION,
  StrategySearchCheckpointError,
  buildPersistedCheckpoint,
  createEmptyJobStatistics,
  createInitialRunnerPayload,
  createSeededRandom,
  decodeRunnerCheckpointPayload,
  encodeRunnerCheckpointPayload,
  readRunnerPayloadFromCheckpoint,
  type StrategySearchRunnerCheckpointPayload,
} from "../src/lib/rextora/strategySearch";

function samplePayload(
  patch: Partial<StrategySearchRunnerCheckpointPayload> = {},
): StrategySearchRunnerCheckpointPayload {
  const prng = createSeededRandom(99).getState();
  return {
    ...createInitialRunnerPayload({ prng, jobStatus: "running" }),
    statistics: {
      ...createEmptyJobStatistics(),
      generated: 3,
      evaluated: 3,
      passed: 1,
      failed: 2,
      bestScore: 12.5,
      averageScore: 4,
      scoreSum: 12,
      elapsedMs: 100,
    },
    seenHashes: ["aaa", "bbb"],
    lastParentCandidateId: "c1",
    lastParentParamsHash: "hash1",
    ...patch,
  };
}

describe("strategySearch jobCheckpoint", () => {
  it("round-trips runner payload through randomState", () => {
    const payload = samplePayload();
    const encoded = encodeRunnerCheckpointPayload(payload);
    const decoded = decodeRunnerCheckpointPayload(encoded);
    expect(decoded).toEqual(payload);
    expect(decoded?.version).toBe(RUNNER_CHECKPOINT_VERSION);
  });

  it("buildPersistedCheckpoint stores iteration counts, best refs, and payload", () => {
    const payload = samplePayload();
    const best = {
      candidateId: "c1",
      iteration: 2,
      paramsHash: "hash1",
      score: 12.5,
      passed: true,
    };
    const cp = buildPersistedCheckpoint({
      completedIterations: 3,
      nextIteration: 3,
      payload,
      bestCandidate: best,
      bestPassedCandidate: best,
      updatedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(cp.completedIterations).toBe(3);
    expect(cp.nextIteration).toBe(3);
    expect(cp.bestCandidate).toEqual(best);
    expect(cp.bestPassedCandidate).toEqual(best);
    expect(cp.updatedAt).toBe("2024-01-01T00:00:00.000Z");
    expect(readRunnerPayloadFromCheckpoint(cp)).toEqual(payload);
    // Immutability: mutating returned best must not affect input
    cp.bestCandidate!.score = -1;
    expect(best.score).toBe(12.5);
  });

  it("returns null for empty randomState", () => {
    expect(decodeRunnerCheckpointPayload(null)).toBeNull();
    expect(decodeRunnerCheckpointPayload("")).toBeNull();
  });

  it("rejects corrupt JSON and invalid fields", () => {
    expect(() => decodeRunnerCheckpointPayload("{")).toThrow(
      StrategySearchCheckpointError,
    );
    expect(() => decodeRunnerCheckpointPayload('"x"')).toThrow(
      StrategySearchCheckpointError,
    );
    expect(() =>
      decodeRunnerCheckpointPayload(
        JSON.stringify({ version: 999, prng: {}, statistics: {}, seenHashes: [] }),
      ),
    ).toThrow(StrategySearchCheckpointError);

    const badPrng = encodeRunnerCheckpointPayload(samplePayload());
    const parsed = JSON.parse(badPrng) as Record<string, unknown>;
    parsed.prng = { algorithm: "other", seed: 1, state: 1 };
    expect(() =>
      decodeRunnerCheckpointPayload(JSON.stringify(parsed)),
    ).toThrow(/prng algorithm/);

    const badStats = JSON.parse(
      encodeRunnerCheckpointPayload(samplePayload()),
    ) as Record<string, unknown>;
    badStats.statistics = { generated: "x" };
    expect(() =>
      decodeRunnerCheckpointPayload(JSON.stringify(badStats)),
    ).toThrow(/statistics/);
  });

  it("createInitialRunnerPayload starts with empty stats and hashes", () => {
    const prng = createSeededRandom(1).getState();
    const p = createInitialRunnerPayload({ prng, jobStatus: "queued" });
    expect(p.seenHashes).toEqual([]);
    expect(p.statistics.generated).toBe(0);
    expect(p.jobStatus).toBe("queued");
    expect(p.prng).toEqual(prng);
  });
});
