/**
 * Deterministic PRNG for strategy search.
 *
 * Algorithm: Mulberry32 (32-bit), a small public-domain generator by Tommy
 * Ettinger. Each call advances a uint32 state and returns a float in [0, 1).
 * Same seed → same sequence; serialized state restores the exact sequence.
 */

export interface SeededRandomState {
  algorithm: "mulberry32";
  /** Original finite integer seed. */
  seed: number;
  /** Current uint32 state (0 … 2^32-1). */
  state: number;
}

export interface SeededRandom {
  next(): number;
  nextInt(minInclusive: number, maxInclusive: number): number;
  nextFloat(minInclusive: number, maxInclusive: number): number;
  pick<T>(values: readonly T[]): T;
  getState(): SeededRandomState;
}

function toUint32(n: number): number {
  return n >>> 0;
}

function assertFiniteIntegerSeed(seed: number): void {
  if (!Number.isFinite(seed) || !Number.isInteger(seed)) {
    throw new Error("seeded random seed must be a finite integer");
  }
}

function createMulberry32(initialState: number, seed: number): SeededRandom {
  let state = toUint32(initialState);

  function next(): number {
    state = toUint32(state + 0x6d2b79f5);
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const u = (t ^ (t >>> 14)) >>> 0;
    return u / 4294967296;
  }

  return {
    next,
    nextInt(minInclusive: number, maxInclusive: number): number {
      if (
        !Number.isFinite(minInclusive) ||
        !Number.isFinite(maxInclusive) ||
        !Number.isInteger(minInclusive) ||
        !Number.isInteger(maxInclusive)
      ) {
        throw new Error("nextInt requires finite integer bounds");
      }
      if (minInclusive > maxInclusive) {
        throw new Error("nextInt minInclusive must be <= maxInclusive");
      }
      if (minInclusive === maxInclusive) return minInclusive;
      const span = maxInclusive - minInclusive + 1;
      return minInclusive + Math.floor(next() * span);
    },
    nextFloat(minInclusive: number, maxInclusive: number): number {
      if (!Number.isFinite(minInclusive) || !Number.isFinite(maxInclusive)) {
        throw new Error("nextFloat requires finite bounds");
      }
      if (minInclusive > maxInclusive) {
        throw new Error("nextFloat minInclusive must be <= maxInclusive");
      }
      if (minInclusive === maxInclusive) return minInclusive;
      return minInclusive + next() * (maxInclusive - minInclusive);
    },
    pick<T>(values: readonly T[]): T {
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error("pick requires a non-empty values array");
      }
      return values[Math.floor(next() * values.length)]!;
    },
    getState(): SeededRandomState {
      return {
        algorithm: "mulberry32",
        seed,
        state: toUint32(state),
      };
    },
  };
}

export function createSeededRandom(seed: number): SeededRandom {
  assertFiniteIntegerSeed(seed);
  // Mix seed into a non-zero uint32 initial state.
  const initial = toUint32(seed === 0 ? 0x9e3779b9 : seed);
  return createMulberry32(initial, seed);
}

export function restoreSeededRandom(state: SeededRandomState): SeededRandom {
  if (!state || state.algorithm !== "mulberry32") {
    throw new Error("restoreSeededRandom requires algorithm mulberry32");
  }
  assertFiniteIntegerSeed(state.seed);
  if (!Number.isFinite(state.state) || !Number.isInteger(state.state)) {
    throw new Error("restoreSeededRandom state must be a finite integer");
  }
  return createMulberry32(toUint32(state.state), state.seed);
}
