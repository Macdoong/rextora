import type {
  StrategySearchApiEnvelope,
  StrategySearchBestResult,
  StrategySearchCreateJobBody,
  StrategySearchJobDetail,
  StrategySearchJobSummary,
  StrategySearchTrialsPage,
} from "./types";
import { StrategySearchClientError } from "./types";

const BASE = "/api/rextora/strategy-search";

async function parseEnvelope<T>(res: Response): Promise<T> {
  let body: StrategySearchApiEnvelope<T>;
  try {
    body = (await res.json()) as StrategySearchApiEnvelope<T>;
  } catch {
    throw new StrategySearchClientError(
      "INTERNAL_EXECUTION_FAILURE",
      "응답을 해석하지 못했습니다.",
      res.status || 500,
    );
  }
  if (!body.ok || body.data == null) {
    throw new StrategySearchClientError(
      body.code ?? "INTERNAL_EXECUTION_FAILURE",
      body.error ?? "요청에 실패했습니다.",
      res.status || 500,
      Array.isArray(body.details) ? [...body.details] : [],
    );
  }
  return body.data;
}

export async function listStrategySearchJobs(opts?: {
  limit?: number;
  offset?: number;
}): Promise<StrategySearchJobSummary[]> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.offset != null) params.set("offset", String(opts.offset));
  const qs = params.toString();
  const res = await fetch(qs ? `${BASE}?${qs}` : BASE, { cache: "no-store" });
  return parseEnvelope(res);
}

export async function deleteStrategySearchJob(
  jobId: string,
): Promise<{ deleted: true; jobId: string }> {
  const res = await fetch(`${BASE}/${encodeURIComponent(jobId)}`, {
    method: "DELETE",
    cache: "no-store",
  });
  return parseEnvelope(res);
}

export async function createStrategySearchJob(
  body: StrategySearchCreateJobBody,
): Promise<StrategySearchJobDetail> {
  const payload = structuredClone(body);
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  return parseEnvelope(res);
}

export async function getStrategySearchJob(
  jobId: string,
): Promise<StrategySearchJobDetail> {
  const res = await fetch(`${BASE}/${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  return parseEnvelope(res);
}

export async function startStrategySearchJob(
  jobId: string,
): Promise<StrategySearchJobDetail> {
  const res = await fetch(`${BASE}/${encodeURIComponent(jobId)}/start`, {
    method: "POST",
    cache: "no-store",
  });
  return parseEnvelope(res);
}

export async function pauseStrategySearchJob(
  jobId: string,
): Promise<StrategySearchJobDetail> {
  const res = await fetch(`${BASE}/${encodeURIComponent(jobId)}/pause`, {
    method: "POST",
    cache: "no-store",
  });
  return parseEnvelope(res);
}

export async function resumeStrategySearchJob(
  jobId: string,
): Promise<StrategySearchJobDetail> {
  const res = await fetch(`${BASE}/${encodeURIComponent(jobId)}/resume`, {
    method: "POST",
    cache: "no-store",
  });
  return parseEnvelope(res);
}

export async function cancelStrategySearchJob(
  jobId: string,
): Promise<StrategySearchJobDetail> {
  const res = await fetch(`${BASE}/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    cache: "no-store",
  });
  return parseEnvelope(res);
}

export async function listStrategySearchTrials(
  jobId: string,
  query: { limit: number; offset: number; passedOnly?: boolean },
): Promise<StrategySearchTrialsPage> {
  const limit = Math.min(200, Math.max(1, Math.floor(query.limit)));
  const offset = Math.max(0, Math.floor(query.offset));
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (query.passedOnly) params.set("passedOnly", "true");
  const res = await fetch(
    `${BASE}/${encodeURIComponent(jobId)}/trials?${params.toString()}`,
    { cache: "no-store" },
  );
  return parseEnvelope(res);
}

export async function getStrategySearchBest(
  jobId: string,
): Promise<StrategySearchBestResult> {
  const res = await fetch(`${BASE}/${encodeURIComponent(jobId)}/best`, {
    cache: "no-store",
  });
  return parseEnvelope(res);
}

export async function promoteStrategySearchTrials(
  jobId: string,
  body: { iteration?: number; iterations?: number[]; name?: string },
): Promise<{
  promoted?: Array<{
    strategyId: string;
    strategyName: string;
    paramsHash: string;
    alreadyExists: boolean;
    existingStrategyId?: string | null;
    registrationState?:
      | "not_registered"
      | "registered"
      | "duplicate"
      | "registration_failed";
    strategyFamily?: string;
    strategyTypeLabelKo?: string;
    market?: string | null;
    timeframe?: string | null;
    params?: Record<string, unknown>;
    lastBacktest?: {
      totalReturn: number;
      mdd: number;
      trades: number;
      winRate: number;
      sharpe?: number | null;
      profitFactor?: number | null;
    } | null;
  }>;
  strategyId?: string;
  strategyName?: string;
  paramsHash?: string;
  alreadyExists?: boolean;
  registrationState?: string;
}> {
  const res = await fetch(`${BASE}/${encodeURIComponent(jobId)}/promote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return parseEnvelope(res);
}

/** Statuses that warrant active polling. */
export function isOperationallyActiveStatus(
  status: string,
  executionActive?: boolean,
): boolean {
  if (executionActive) return true;
  return (
    status === "running" ||
    status === "pause_requested" ||
    status === "cancel_requested"
  );
}
