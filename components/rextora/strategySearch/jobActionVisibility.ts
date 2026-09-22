import type { StrategySearchJobStatus } from "./types";

export type JobLifecycleAction =
  | "start"
  | "pause"
  | "resume"
  | "recover"
  | "retry"
  | "cancel"
  | "results";

/**
 * Presentation mapping for Strategy Search lifecycle buttons.
 * Uses existing handlers only: start/pause/resume/cancel/retry/results.
 * `recover` is the interrupted-state label for the existing resume handler.
 */
export function visibleJobLifecycleActions(input: {
  status: StrategySearchJobStatus;
  hasSelection: boolean;
  jobMissing?: boolean;
  retryable?: boolean;
}): JobLifecycleAction[] {
  if (!input.hasSelection || input.jobMissing) return [];
  switch (input.status) {
    case "queued":
      return ["start"];
    case "running":
      return ["pause", "cancel"];
    case "paused":
      return ["resume", "cancel"];
    case "interrupted":
      return ["recover"];
    case "pause_requested":
      return ["cancel"];
    case "cancel_requested":
    case "cancelling":
      return ["cancel"];
    case "failed":
      return input.retryable ? ["retry"] : [];
    case "completed":
      return ["results"];
    case "cancelled":
      return input.retryable ? ["retry"] : [];
    default:
      return [];
  }
}
