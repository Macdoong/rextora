/**
 * Deterministic evaluation-window planning for strategy search (Phase 3).
 * Pure planning only — no market data, no system clock, no relative month math.
 */

import type {
  StrategySearchEvaluationWindowPlan,
  StrategySearchWindow,
} from "./types";

export class StrategySearchWindowPlannerError extends Error {
  readonly code:
    | "INVALID_RANGE"
    | "OUT_OF_RANGE"
    | "DUPLICATE_WINDOW_ID"
    | "OVERLAPPING_WINDOWS"
    | "EMPTY_REQUIRED_WINDOW"
    | "INVALID_INPUT";

  readonly windowId: string | null;

  constructor(
    code: StrategySearchWindowPlannerError["code"],
    message: string,
    windowId: string | null = null,
  ) {
    super(message);
    this.name = "StrategySearchWindowPlannerError";
    this.code = code;
    this.windowId = windowId;
  }
}

export interface BuildEvaluationWindowPlansInput {
  /** Inclusive available data start (ms open time). */
  availableFrom: number;
  /** Inclusive available data end (ms open time). */
  availableTo: number;
  /** Window definitions (typically StrategySearchConfig.evaluationWindows). */
  windows: StrategySearchWindow[];
  /**
   * When true, reject any pair of overlapping windows.
   * Default false — nesting (e.g. full containing recent/prev) is allowed.
   */
  forbidOverlap?: boolean;
}

function isFiniteMs(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function freezePlan(
  plan: StrategySearchEvaluationWindowPlan,
): StrategySearchEvaluationWindowPlan {
  return Object.freeze({ ...plan });
}

function windowsOverlap(
  a: StrategySearchEvaluationWindowPlan,
  b: StrategySearchEvaluationWindowPlan,
): boolean {
  return a.requestedFrom <= b.requestedTo && b.requestedFrom <= a.requestedTo;
}

function assertAvailableRange(availableFrom: number, availableTo: number): void {
  if (!isFiniteMs(availableFrom) || !isFiniteMs(availableTo)) {
    throw new StrategySearchWindowPlannerError(
      "INVALID_INPUT",
      "availableFrom and availableTo must be finite epoch-ms timestamps",
    );
  }
  if (availableFrom >= availableTo) {
    throw new StrategySearchWindowPlannerError(
      "INVALID_RANGE",
      "availableFrom must be strictly less than availableTo",
    );
  }
}

function mapWindowToPlan(
  window: StrategySearchWindow,
): StrategySearchEvaluationWindowPlan {
  if (!window || typeof window !== "object") {
    throw new StrategySearchWindowPlannerError(
      "INVALID_INPUT",
      "window definition must be an object",
    );
  }
  if (typeof window.id !== "string" || window.id.trim() === "") {
    throw new StrategySearchWindowPlannerError(
      "INVALID_INPUT",
      "window id must be a non-empty string",
      typeof window.id === "string" ? window.id : null,
    );
  }
  if (typeof window.label !== "string") {
    throw new StrategySearchWindowPlannerError(
      "INVALID_INPUT",
      "window label must be a string",
      window.id,
    );
  }
  if (!isFiniteMs(window.fromOpenTime) || !isFiniteMs(window.toOpenTime)) {
    throw new StrategySearchWindowPlannerError(
      "INVALID_RANGE",
      "window fromOpenTime/toOpenTime must be finite epoch-ms timestamps",
      window.id,
    );
  }
  if (window.fromOpenTime >= window.toOpenTime) {
    throw new StrategySearchWindowPlannerError(
      "INVALID_RANGE",
      "window start must be strictly less than end",
      window.id,
    );
  }

  const requiredForPass = window.requiredForPass !== false;
  const span = window.toOpenTime - window.fromOpenTime;
  if (requiredForPass && !(span > 0)) {
    throw new StrategySearchWindowPlannerError(
      "EMPTY_REQUIRED_WINDOW",
      "required window must have a non-empty time span",
      window.id,
    );
  }

  return freezePlan({
    id: window.id,
    label: window.label,
    requestedFrom: window.fromOpenTime,
    requestedTo: window.toOpenTime,
    requiredForPass,
  });
}

/**
 * Build immutable evaluation window plans from explicit config timestamps.
 * Preserves the configured window order (no re-sort, no system time).
 */
export function buildEvaluationWindowPlans(
  input: BuildEvaluationWindowPlansInput,
): readonly StrategySearchEvaluationWindowPlan[] {
  if (!input || typeof input !== "object") {
    throw new StrategySearchWindowPlannerError(
      "INVALID_INPUT",
      "buildEvaluationWindowPlans input must be an object",
    );
  }
  assertAvailableRange(input.availableFrom, input.availableTo);
  if (!Array.isArray(input.windows)) {
    throw new StrategySearchWindowPlannerError(
      "INVALID_INPUT",
      "windows must be an array",
    );
  }

  const plans: StrategySearchEvaluationWindowPlan[] = [];
  const seenIds = new Set<string>();

  for (const window of input.windows) {
    const plan = mapWindowToPlan(window);
    if (seenIds.has(plan.id)) {
      throw new StrategySearchWindowPlannerError(
        "DUPLICATE_WINDOW_ID",
        `duplicate window id: ${plan.id}`,
        plan.id,
      );
    }
    seenIds.add(plan.id);

    if (
      plan.requestedFrom < input.availableFrom ||
      plan.requestedTo > input.availableTo
    ) {
      throw new StrategySearchWindowPlannerError(
        "OUT_OF_RANGE",
        "window is outside the available data range",
        plan.id,
      );
    }

    plans.push(plan);
  }

  if (input.forbidOverlap === true) {
    for (let i = 0; i < plans.length; i += 1) {
      for (let j = i + 1; j < plans.length; j += 1) {
        if (windowsOverlap(plans[i], plans[j])) {
          throw new StrategySearchWindowPlannerError(
            "OVERLAPPING_WINDOWS",
            `windows overlap: ${plans[i].id} and ${plans[j].id}`,
            plans[i].id,
          );
        }
      }
    }
  }

  return Object.freeze(plans.slice());
}

/**
 * Validate an existing plan list (structure, ranges, duplicate ids).
 * Does not load market data and does not use system time.
 */
export function validateEvaluationWindowPlans(
  plans: readonly StrategySearchEvaluationWindowPlan[],
  options?: { forbidOverlap?: boolean },
): void {
  if (!Array.isArray(plans)) {
    throw new StrategySearchWindowPlannerError(
      "INVALID_INPUT",
      "plans must be an array",
    );
  }

  const seenIds = new Set<string>();
  for (const plan of plans) {
    if (!plan || typeof plan !== "object") {
      throw new StrategySearchWindowPlannerError(
        "INVALID_INPUT",
        "each plan must be an object",
      );
    }
    if (typeof plan.id !== "string" || plan.id.trim() === "") {
      throw new StrategySearchWindowPlannerError(
        "INVALID_INPUT",
        "plan id must be a non-empty string",
        typeof plan.id === "string" ? plan.id : null,
      );
    }
    if (seenIds.has(plan.id)) {
      throw new StrategySearchWindowPlannerError(
        "DUPLICATE_WINDOW_ID",
        `duplicate window id: ${plan.id}`,
        plan.id,
      );
    }
    seenIds.add(plan.id);

    if (!isFiniteMs(plan.requestedFrom) || !isFiniteMs(plan.requestedTo)) {
      throw new StrategySearchWindowPlannerError(
        "INVALID_RANGE",
        "plan requestedFrom/requestedTo must be finite epoch-ms timestamps",
        plan.id,
      );
    }
    if (plan.requestedFrom >= plan.requestedTo) {
      throw new StrategySearchWindowPlannerError(
        "INVALID_RANGE",
        "plan start must be strictly less than end",
        plan.id,
      );
    }
    if (plan.requiredForPass === true && !(plan.requestedTo > plan.requestedFrom)) {
      throw new StrategySearchWindowPlannerError(
        "EMPTY_REQUIRED_WINDOW",
        "required window must have a non-empty time span",
        plan.id,
      );
    }
  }

  if (options?.forbidOverlap === true) {
    for (let i = 0; i < plans.length; i += 1) {
      for (let j = i + 1; j < plans.length; j += 1) {
        if (windowsOverlap(plans[i], plans[j])) {
          throw new StrategySearchWindowPlannerError(
            "OVERLAPPING_WINDOWS",
            `windows overlap: ${plans[i].id} and ${plans[j].id}`,
            plans[i].id,
          );
        }
      }
    }
  }
}
