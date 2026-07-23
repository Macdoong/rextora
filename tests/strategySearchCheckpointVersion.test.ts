/**
 * Phase 5.1 — checkpoint version validation (supported / future / older / missing / bad type).
 */
import { describe, expect, it } from "vitest";
import {
  RUNNER_CHECKPOINT_VERSION,
  StrategySearchCheckpointError,
  createEmptyJobStatistics,
  createInitialRunnerPayload,
  createSeededRandom,
  decodeRunnerCheckpointPayload,
  encodeRunnerCheckpointPayload,
  type StrategySearchRunnerCheckpointPayload,
} from "../src/lib/rextora/strategySearch";

function basePayload(
  patch: Partial<StrategySearchRunnerCheckpointPayload> = {},
): StrategySearchRunnerCheckpointPayload {
  return {
    ...createInitialRunnerPayload({
      prng: createSeededRandom(1).getState(),
      jobStatus: "running",
    }),
    statistics: createEmptyJobStatistics(),
    ...patch,
  };
}

function rawWithVersion(version: unknown): string {
  const payload = basePayload();
  const obj = JSON.parse(encodeRunnerCheckpointPayload(payload)) as Record<
    string,
    unknown
  >;
  obj.version = version;
  return JSON.stringify(obj);
}

describe("strategySearch Phase 5.1 checkpoint version", () => {
  it("accepts the supported runner checkpoint version", () => {
    expect(RUNNER_CHECKPOINT_VERSION).toBe(1);
    const payload = basePayload();
    const encoded = encodeRunnerCheckpointPayload(payload);
    const decoded = decodeRunnerCheckpointPayload(encoded);
    expect(decoded?.version).toBe(RUNNER_CHECKPOINT_VERSION);
    expect(decoded?.prng.algorithm).toBe("mulberry32");
  });

  it("rejects future versions cleanly", () => {
    expect(() => decodeRunnerCheckpointPayload(rawWithVersion(2))).toThrow(
      StrategySearchCheckpointError,
    );
    expect(() => decodeRunnerCheckpointPayload(rawWithVersion(99))).toThrow(
      /version mismatch/i,
    );
    try {
      decodeRunnerCheckpointPayload(rawWithVersion(2));
    } catch (err) {
      expect(err).toBeInstanceOf(StrategySearchCheckpointError);
      expect((err as StrategySearchCheckpointError).code).toBe(
        "CORRUPT_CHECKPOINT",
      );
    }
  });

  it("rejects older versions cleanly", () => {
    expect(() => decodeRunnerCheckpointPayload(rawWithVersion(0))).toThrow(
      StrategySearchCheckpointError,
    );
    expect(() => decodeRunnerCheckpointPayload(rawWithVersion(-1))).toThrow(
      /version mismatch/i,
    );
  });

  it("rejects missing version", () => {
    const payload = basePayload();
    const obj = JSON.parse(encodeRunnerCheckpointPayload(payload)) as Record<
      string,
      unknown
    >;
    delete obj.version;
    expect(() =>
      decodeRunnerCheckpointPayload(JSON.stringify(obj)),
    ).toThrow(StrategySearchCheckpointError);
    expect(() =>
      decodeRunnerCheckpointPayload(JSON.stringify(obj)),
    ).toThrow(/version mismatch/i);
  });

  it("rejects invalid version types", () => {
    for (const version of ["1", "v1", true, null, {}, [1]] as const) {
      expect(() => decodeRunnerCheckpointPayload(rawWithVersion(version))).toThrow(
        StrategySearchCheckpointError,
      );
    }
  });

  it("encode rejects unsupported payload.version with INVALID_CHECKPOINT", () => {
    const payload = basePayload();
    const bad = {
      ...payload,
      version: 2 as unknown as typeof RUNNER_CHECKPOINT_VERSION,
    };
    expect(() => encodeRunnerCheckpointPayload(bad)).toThrow(
      StrategySearchCheckpointError,
    );
    try {
      encodeRunnerCheckpointPayload(bad);
    } catch (err) {
      expect(err).toBeInstanceOf(StrategySearchCheckpointError);
      expect((err as StrategySearchCheckpointError).code).toBe(
        "INVALID_CHECKPOINT",
      );
      expect((err as Error).message).toMatch(/unsupported runner checkpoint version/i);
    }
  });
});
