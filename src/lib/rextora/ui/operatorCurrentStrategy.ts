/**
 * Operator Center "현재 전략" authority.
 * Only an explicit operator page selection counts.
 * Paper history, research jobs, and registry flags are never implicit current strategy.
 */

import { isRetiredSafeId } from "../strategy/retiredSafeBaseline";

export type ExplicitCurrentStrategy = {
  name: string;
  id: string | null;
};

export function resolveExplicitCurrentStrategy(input: {
  pageContextStrategyName?: string | null;
  pageContextStrategyId?: string | null;
  /** Ignored — previous Paper must not become current strategy. */
  paperName?: string | null;
  paperSessionStatus?: string | null;
  /** Ignored — paperActive/liveActive registry is not operator selection. */
  activeStrategyName?: string | null;
  /** Ignored — research/search context is not current strategy. */
  researchName?: string | null;
}): ExplicitCurrentStrategy | null {
  void input.paperName;
  void input.paperSessionStatus;
  void input.activeStrategyName;
  void input.researchName;

  const id = input.pageContextStrategyId?.trim() || null;
  const name = input.pageContextStrategyName?.trim() || null;
  if (isRetiredSafeId(id) || isRetiredSafeId(name)) return null;
  if (!name && !id) return null;
  return { name: name || id!, id };
}

export function paperSessionVisualState(
  status: string | null | undefined,
): "idle" | "running" | "paused" | "ended" {
  if (!status) return "idle";
  if (status === "active" || status === "starting") return "running";
  if (
    status === "paused" ||
    status === "pending_approval" ||
    status === "ready" ||
    status === "risk_halted"
  ) {
    return "paused";
  }
  if (
    status === "stopped" ||
    status === "failed" ||
    status === "error" ||
    status === "stopping"
  ) {
    return "ended";
  }
  return "idle";
}
