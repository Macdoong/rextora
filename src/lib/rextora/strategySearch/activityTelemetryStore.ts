/**
 * Persist customer-safe activity events onto the job checkpoint.
 * Isolated from the pure telemetry module so UI copy helpers stay filesystem-free.
 */

import {
  appendSearchActivityEvents,
  sanitizeRecentActivityEvents,
  type StrategySearchActivityEvent,
} from "./activityTelemetry";
import {
  getSearchJob,
  updateSearchCheckpoint,
  type StrategySearchStoreOptions,
} from "./jobStore";

export function appendPersistedSearchActivityEvents(
  jobId: string,
  incoming: readonly StrategySearchActivityEvent[],
  store?: StrategySearchStoreOptions,
): void {
  if (incoming.length === 0) return;
  const job = getSearchJob(jobId, store);
  if (!job) return;
  const events = appendSearchActivityEvents(
    sanitizeRecentActivityEvents(job.checkpoint.recentActivityEvents),
    incoming,
  );
  updateSearchCheckpoint(
    jobId,
    {
      ...job.checkpoint,
      recentActivityEvents: events,
    },
    store,
  );
}
