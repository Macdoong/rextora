import { randomUUID } from "node:crypto";

const JOB_ID_RE = /^search_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createStrategySearchJobId(): string {
  return `search_${randomUUID()}`;
}

export function createStrategySearchCandidateId(
  jobId: string,
  iteration: number,
): string {
  if (typeof jobId !== "string" || jobId.trim() === "") {
    throw new Error("strategy-search candidate id requires a non-empty job ID");
  }
  if (!Number.isInteger(iteration)) {
    throw new Error("strategy-search candidate iteration must be an integer");
  }
  if (iteration < 0) {
    throw new Error("strategy-search candidate iteration must be non-negative");
  }
  return `${jobId}_candidate_${String(iteration).padStart(8, "0")}`;
}

export function isValidStrategySearchJobId(jobId: string): boolean {
  if (typeof jobId !== "string" || jobId.length === 0) return false;
  if (jobId.includes("..") || jobId.includes("/") || jobId.includes("\\")) {
    return false;
  }
  if (jobId.includes("\0")) return false;
  if (/SAFE_v44_i4060/i.test(jobId)) return false;
  if (jobId.toLowerCase().startsWith("safe")) return false;
  return JOB_ID_RE.test(jobId);
}

export function assertStrategySearchJobId(jobId: string): void {
  if (!isValidStrategySearchJobId(jobId)) {
    throw new Error(`invalid strategy-search job id: ${jobId}`);
  }
}

export function assertStrategySearchIteration(iteration: number): void {
  if (!Number.isInteger(iteration)) {
    throw new Error("strategy-search iteration must be an integer");
  }
  if (iteration < 0) {
    throw new Error("strategy-search iteration must be non-negative");
  }
}
