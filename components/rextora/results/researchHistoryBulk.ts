/**
 * Bulk selection helpers for Results > Research History management.
 */

export type HistoryJobRow = {
  id: string;
  status: string;
  completionReason?: string | null;
  updatedAt?: string;
  isArchived?: boolean;
};

export type HistoryImpactView = {
  classification: "deletable" | "archive_only" | "protected";
};

const ACTIVE_STATUSES = new Set([
  "running",
  "queued",
  "paused",
  "cancel_requested",
]);

export function isActiveHistoryJob(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

export function classificationLabelKo(
  classification: HistoryImpactView["classification"] | undefined,
): string {
  if (classification === "deletable") return "삭제 가능";
  if (classification === "archive_only") return "보관만 가능";
  if (classification === "protected") return "보호됨";
  return "—";
}

export function canBulkDelete(
  job: HistoryJobRow,
  impact: HistoryImpactView | null | undefined,
): boolean {
  if (isActiveHistoryJob(job.status)) return false;
  return impact?.classification === "deletable";
}

export function canBulkArchive(
  job: HistoryJobRow,
  impact: HistoryImpactView | null | undefined,
): boolean {
  if (job.isArchived) return false;
  if (isActiveHistoryJob(job.status)) return false;
  if (impact?.classification === "protected") return false;
  return true;
}

export function selectFailedJobIds(jobs: HistoryJobRow[]): string[] {
  return jobs.filter((j) => j.status === "failed").map((j) => j.id);
}

export function selectUserStoppedJobIds(jobs: HistoryJobRow[]): string[] {
  return jobs
    .filter(
      (j) =>
        j.status === "cancelled" ||
        j.completionReason === "USER_CANCELLED" ||
        j.completionReason === "user_cancelled",
    )
    .map((j) => j.id);
}

export function selectOldJobIds(jobs: HistoryJobRow[], days = 30): string[] {
  const cutoff = Date.now() - days * 86_400_000;
  return jobs
    .filter((j) => {
      const t = j.updatedAt ? Date.parse(j.updatedAt) : NaN;
      return Number.isFinite(t) && t < cutoff;
    })
    .map((j) => j.id);
}

export function filterBulkDeleteCandidates(
  jobIds: string[],
  jobsById: Map<string, HistoryJobRow>,
  impacts: Record<string, HistoryImpactView | null | undefined>,
): string[] {
  return jobIds.filter((id) => {
    const job = jobsById.get(id);
    if (!job) return false;
    return canBulkDelete(job, impacts[id]);
  });
}

export function filterBulkArchiveCandidates(
  jobIds: string[],
  jobsById: Map<string, HistoryJobRow>,
  impacts: Record<string, HistoryImpactView | null | undefined>,
): string[] {
  return jobIds.filter((id) => {
    const job = jobsById.get(id);
    if (!job) return false;
    return canBulkArchive(job, impacts[id]);
  });
}
