import type {
  StrategySearchJob,
  StrategySearchJobIndexEntry,
} from "./types";

/**
 * Canonical index-row projection. Same fields as syncIndexWithJob.
 * Pure: does not read or write the store.
 */
export function projectSearchJobIndexEntry(
  job: StrategySearchJob,
): StrategySearchJobIndexEntry {
  return {
    id: job.id,
    status: job.status,
    strategyTemplateId: job.config.strategyTemplateId,
    generatorType: job.config.generatorType,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedIterations: job.checkpoint.completedIterations,
    finishedAt: job.finishedAt,
  };
}
