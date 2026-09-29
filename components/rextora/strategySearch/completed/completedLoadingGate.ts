import type { StrategySearchJobDetail, StrategySearchTrialsPage } from "../types";

export type DetailFetchState = "idle" | "loading" | "ready" | "error";

/**
 * Authoritative qualified count for completed dashboard — never treat unloaded trials as zero.
 */
export function resolveCompletedQualifiedCount(input: {
  job: StrategySearchJobDetail;
  trials: StrategySearchTrialsPage | null;
  payloadReady: boolean;
}): number | null {
  if (!input.payloadReady) return null;
  if (
    input.job.qualifiedCount != null &&
    Number.isFinite(input.job.qualifiedCount)
  ) {
    return Math.max(0, input.job.qualifiedCount);
  }
  if (input.trials) {
    return input.trials.trials.filter((t) => t.passed).length;
  }
  return 0;
}

export function isCompletedResultPayloadReady(input: {
  jobMissing: boolean;
  detail: StrategySearchJobDetail | null;
  detailFetchState: DetailFetchState;
  trials: StrategySearchTrialsPage | null;
}): boolean {
  if (input.jobMissing || !input.detail) return false;
  if (input.detail.status !== "completed") return false;
  if (input.detailFetchState !== "ready") return false;
  if (input.trials === null) return false;
  const statsReady =
    input.detail.statistics != null ||
    input.detail.evaluatedCount != null ||
    input.detail.gatePassedCount != null;
  const qualifiedReady =
    input.detail.qualifiedCount != null ||
    input.trials.total != null;
  return statsReady && qualifiedReady;
}

/** True when completed dashboard or its exclusive loading shell should hide legacy workbench UI. */
export function shouldHideLegacyWorkbenchForCompleted(input: {
  showCompletedDashboardPrimary: boolean;
  showCompletedResultLoading: boolean;
}): boolean {
  return input.showCompletedDashboardPrimary || input.showCompletedResultLoading;
}

export function shouldShowCompletedResultLoading(input: {
  clientReady: boolean;
  selectedId: string | null;
  jobMissing: boolean;
  detail: StrategySearchJobDetail | null;
  detailFetchState: DetailFetchState;
  trials: StrategySearchTrialsPage | null;
}): boolean {
  if (!input.clientReady || !input.selectedId || input.jobMissing) return false;
  // A selected job that is not in the completed-result flow must keep its
  // workbench mounted during background detail refresh.
  if (input.detail && input.detail.status !== "completed") return false;
  if (input.detailFetchState === "loading") return true;
  if (input.detail?.status === "completed" && input.trials === null) {
    return true;
  }
  return false;
}
