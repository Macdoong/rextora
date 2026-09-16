import type { StrategySearchJobSummary } from "./types";

export const RECOVERY_API_PAGE_SIZE = 100;
export const RECOVERY_VISIBLE_PAGE_SIZE = 10;
export const RESEARCH_RECOVERY_HREF = "/strategy-search#ss-recovery";

export function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

export function isInterruptedRecoveryJob(
  job: Pick<StrategySearchJobSummary, "status">,
): boolean {
  return job.status === "interrupted";
}

export function recoveryResumeEnabled(
  job: Pick<StrategySearchJobSummary, "status" | "recoveryBlocker">,
): boolean {
  return job.status === "interrupted" && job.recoveryBlocker == null;
}

export function sliceRecoveryVisible<T>(jobs: readonly T[], visibleCount: number): T[] {
  const n = Number.isFinite(visibleCount) ? Math.max(0, Math.trunc(visibleCount)) : 0;
  return jobs.slice(0, n);
}

export async function discoverInterruptedRecoveryJobs(
  listFn: (opts: {
    limit: number;
    offset: number;
    signal?: AbortSignal;
  }) => Promise<StrategySearchJobSummary[]>,
  signal?: AbortSignal,
): Promise<StrategySearchJobSummary[]> {
  const discovered: StrategySearchJobSummary[] = [];
  let offset = 0;
  while (!isAborted(signal)) {
    const page = await listFn({
      limit: RECOVERY_API_PAGE_SIZE,
      offset,
      signal,
    });
    if (isAborted(signal)) break;
    for (const job of page) {
      if (isInterruptedRecoveryJob(job)) discovered.push(job);
    }
    if (page.length < RECOVERY_API_PAGE_SIZE) break;
    offset += RECOVERY_API_PAGE_SIZE;
  }
  return discovered;
}
