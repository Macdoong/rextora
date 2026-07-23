import { describe, expect, it } from "vitest";
import {
  createEmptyJobStatistics,
  isBetterScore,
  recordDuplicate,
  recordElapsed,
  recordError,
  recordEvaluation,
  recordGenerated,
} from "../src/lib/rextora/strategySearch";

describe("strategySearch jobStatistics", () => {
  it("starts empty", () => {
    const s = createEmptyJobStatistics();
    expect(s).toEqual({
      generated: 0,
      evaluated: 0,
      passed: 0,
      failed: 0,
      stressPassed: 0,
      jitterPassed: 0,
      duplicates: 0,
      errors: 0,
      bestScore: null,
      averageScore: null,
      scoreSum: 0,
      elapsedMs: 0,
      remainingEstimateMs: null,
    });
  });

  it("updates counters immutably", () => {
    const base = createEmptyJobStatistics();
    const g = recordGenerated(base);
    expect(base.generated).toBe(0);
    expect(g.generated).toBe(1);

    const d = recordDuplicate(g);
    expect(d.duplicates).toBe(1);
    expect(g.duplicates).toBe(0);

    const e = recordError(d);
    expect(e.errors).toBe(1);
  });

  it("tracks pass/fail/stress/jitter and average score", () => {
    let s = createEmptyJobStatistics();
    s = recordEvaluation(s, {
      score: 10,
      passed: true,
      stressPassed: true,
      jitterPassed: true,
    });
    s = recordEvaluation(s, {
      score: 20,
      passed: false,
      stressPassed: false,
      jitterPassed: false,
    });
    expect(s.evaluated).toBe(2);
    expect(s.passed).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.stressPassed).toBe(1);
    expect(s.jitterPassed).toBe(1);
    expect(s.bestScore).toBe(20);
    expect(s.averageScore).toBe(15);
    expect(s.scoreSum).toBe(30);
  });

  it("counts evaluationFailed as failed without passing", () => {
    const s = recordEvaluation(createEmptyJobStatistics(), {
      score: null,
      passed: false,
      stressPassed: false,
      jitterPassed: false,
      evaluationFailed: true,
    });
    expect(s.evaluated).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.passed).toBe(0);
    expect(s.bestScore).toBeNull();
  });

  it("never lowers bestScore when a worse score appears", () => {
    let s = createEmptyJobStatistics();
    s = recordEvaluation(s, {
      score: 50,
      passed: true,
      stressPassed: true,
      jitterPassed: null,
    });
    s = recordEvaluation(s, {
      score: 10,
      passed: true,
      stressPassed: true,
      jitterPassed: null,
    });
    expect(s.bestScore).toBe(50);
  });

  it("isBetterScore never accepts worse or null over a number", () => {
    expect(isBetterScore(null, 1)).toBe(true);
    expect(isBetterScore(5, 6)).toBe(true);
    expect(isBetterScore(5, 5)).toBe(false);
    expect(isBetterScore(5, 4)).toBe(false);
    expect(isBetterScore(5, null)).toBe(false);
    expect(isBetterScore(null, null)).toBe(false);
  });

  it("estimates remaining time from elapsed and maxIterations", () => {
    const s = recordElapsed(createEmptyJobStatistics(), 1000, 2, 10);
    expect(s.elapsedMs).toBe(1000);
    expect(s.remainingEstimateMs).toBe(4000);

    const done = recordElapsed(createEmptyJobStatistics(), 500, 10, 10);
    expect(done.remainingEstimateMs).toBe(0);

    const unknown = recordElapsed(createEmptyJobStatistics(), 500, 2, null);
    expect(unknown.remainingEstimateMs).toBeNull();
  });
});
