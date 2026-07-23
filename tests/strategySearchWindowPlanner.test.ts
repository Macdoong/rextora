import { describe, expect, it } from "vitest";
import {
  StrategySearchWindowPlannerError,
  buildEvaluationWindowPlans,
  validateEvaluationWindowPlans,
  type StrategySearchWindow,
} from "../src/lib/rextora/strategySearch";

const AVAILABLE_FROM = Date.UTC(2024, 0, 1);
const AVAILABLE_TO = Date.UTC(2024, 10, 1);

function windowsInConfigOrder(): StrategySearchWindow[] {
  return [
    {
      id: "recent",
      label: "Recent",
      fromOpenTime: Date.UTC(2024, 7, 1),
      toOpenTime: Date.UTC(2024, 9, 1),
      requiredForPass: true,
    },
    {
      id: "prev",
      label: "Previous",
      fromOpenTime: Date.UTC(2024, 4, 1),
      toOpenTime: Date.UTC(2024, 7, 1),
      requiredForPass: true,
    },
    {
      id: "full",
      label: "Full",
      fromOpenTime: Date.UTC(2024, 0, 1),
      toOpenTime: Date.UTC(2024, 10, 1),
      requiredForPass: true,
    },
  ];
}

describe("strategySearch windowPlanner", () => {
  it("builds valid plans and preserves configured order", () => {
    const inputWindows = windowsInConfigOrder();
    const plans = buildEvaluationWindowPlans({
      availableFrom: AVAILABLE_FROM,
      availableTo: AVAILABLE_TO,
      windows: inputWindows,
    });

    expect(plans.map((p) => p.id)).toEqual(["recent", "prev", "full"]);
    expect(plans[0].requestedFrom).toBe(Date.UTC(2024, 7, 1));
    expect(plans[0].requestedTo).toBe(Date.UTC(2024, 9, 1));
    expect(plans[2].requiredForPass).toBe(true);
    validateEvaluationWindowPlans(plans);
  });

  it("rejects invalid start/end", () => {
    expect(() =>
      buildEvaluationWindowPlans({
        availableFrom: AVAILABLE_FROM,
        availableTo: AVAILABLE_TO,
        windows: [
          {
            id: "bad",
            label: "bad",
            fromOpenTime: Date.UTC(2024, 5, 1),
            toOpenTime: Date.UTC(2024, 5, 1),
          },
        ],
      }),
    ).toThrow(StrategySearchWindowPlannerError);

    try {
      buildEvaluationWindowPlans({
        availableFrom: AVAILABLE_FROM,
        availableTo: AVAILABLE_TO,
        windows: [
          {
            id: "bad2",
            label: "bad2",
            fromOpenTime: Date.UTC(2024, 6, 1),
            toOpenTime: Date.UTC(2024, 5, 1),
          },
        ],
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(StrategySearchWindowPlannerError);
      expect((err as StrategySearchWindowPlannerError).code).toBe(
        "INVALID_RANGE",
      );
      expect((err as StrategySearchWindowPlannerError).windowId).toBe("bad2");
    }
  });

  it("rejects duplicate window ids", () => {
    expect(() =>
      buildEvaluationWindowPlans({
        availableFrom: AVAILABLE_FROM,
        availableTo: AVAILABLE_TO,
        windows: [
          {
            id: "w1",
            label: "a",
            fromOpenTime: Date.UTC(2024, 1, 1),
            toOpenTime: Date.UTC(2024, 2, 1),
          },
          {
            id: "w1",
            label: "b",
            fromOpenTime: Date.UTC(2024, 3, 1),
            toOpenTime: Date.UTC(2024, 4, 1),
          },
        ],
      }),
    ).toThrowError(/duplicate window id/);
  });

  it("rejects out-of-range windows", () => {
    try {
      buildEvaluationWindowPlans({
        availableFrom: AVAILABLE_FROM,
        availableTo: AVAILABLE_TO,
        windows: [
          {
            id: "early",
            label: "early",
            fromOpenTime: Date.UTC(2023, 11, 1),
            toOpenTime: Date.UTC(2024, 2, 1),
          },
        ],
      });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(StrategySearchWindowPlannerError);
      expect((err as StrategySearchWindowPlannerError).code).toBe(
        "OUT_OF_RANGE",
      );
    }
  });

  it("rejects required empty window span via start>=end", () => {
    expect(() =>
      buildEvaluationWindowPlans({
        availableFrom: AVAILABLE_FROM,
        availableTo: AVAILABLE_TO,
        windows: [
          {
            id: "empty_req",
            label: "empty",
            fromOpenTime: Date.UTC(2024, 2, 1),
            toOpenTime: Date.UTC(2024, 2, 1),
            requiredForPass: true,
          },
        ],
      }),
    ).toThrow(StrategySearchWindowPlannerError);
  });

  it("allows a full window to contain recent and previous windows by default", () => {
    const plans = buildEvaluationWindowPlans({
      availableFrom: AVAILABLE_FROM,
      availableTo: AVAILABLE_TO,
      windows: windowsInConfigOrder(),
    });
    expect(plans).toHaveLength(3);
    expect(plans[2].requestedFrom).toBeLessThanOrEqual(plans[0].requestedFrom);
    expect(plans[2].requestedTo).toBeGreaterThanOrEqual(plans[0].requestedTo);
  });

  it("rejects overlapping windows only when forbidOverlap is true", () => {
    expect(() =>
      buildEvaluationWindowPlans({
        availableFrom: AVAILABLE_FROM,
        availableTo: AVAILABLE_TO,
        windows: windowsInConfigOrder(),
        forbidOverlap: true,
      }),
    ).toThrowError(/overlap/);

    const disjoint = buildEvaluationWindowPlans({
      availableFrom: AVAILABLE_FROM,
      availableTo: AVAILABLE_TO,
      windows: [
        {
          id: "a",
          label: "a",
          fromOpenTime: Date.UTC(2024, 0, 1),
          toOpenTime: Date.UTC(2024, 2, 1),
        },
        {
          id: "b",
          label: "b",
          fromOpenTime: Date.UTC(2024, 2, 2),
          toOpenTime: Date.UTC(2024, 4, 1),
        },
      ],
      forbidOverlap: true,
    });
    expect(disjoint.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("does not mutate input objects", () => {
    const windows = windowsInConfigOrder();
    const snapshot = structuredClone(windows);
    const availableFrom = AVAILABLE_FROM;
    const availableTo = AVAILABLE_TO;
    buildEvaluationWindowPlans({
      availableFrom,
      availableTo,
      windows,
    });
    expect(windows).toEqual(snapshot);
    expect(availableFrom).toBe(AVAILABLE_FROM);
    expect(availableTo).toBe(AVAILABLE_TO);
  });

  it("has no dependency on current system time", () => {
    const realNow = Date.now;
    let called = false;
    Date.now = () => {
      called = true;
      return 9_999_999_999_999;
    };
    try {
      const plans = buildEvaluationWindowPlans({
        availableFrom: AVAILABLE_FROM,
        availableTo: AVAILABLE_TO,
        windows: [
          {
            id: "fixed",
            label: "fixed",
            fromOpenTime: Date.UTC(2024, 1, 1),
            toOpenTime: Date.UTC(2024, 3, 1),
          },
        ],
      });
      expect(plans[0].requestedFrom).toBe(Date.UTC(2024, 1, 1));
      expect(plans[0].requestedTo).toBe(Date.UTC(2024, 3, 1));
      expect(called).toBe(false);
      validateEvaluationWindowPlans(plans);
    } finally {
      Date.now = realNow;
    }
  });

  it("returns frozen plan objects", () => {
    const plans = buildEvaluationWindowPlans({
      availableFrom: AVAILABLE_FROM,
      availableTo: AVAILABLE_TO,
      windows: [
        {
          id: "frozen",
          label: "frozen",
          fromOpenTime: Date.UTC(2024, 1, 1),
          toOpenTime: Date.UTC(2024, 2, 1),
        },
      ],
    });
    expect(Object.isFrozen(plans)).toBe(true);
    expect(Object.isFrozen(plans[0])).toBe(true);
  });
});
