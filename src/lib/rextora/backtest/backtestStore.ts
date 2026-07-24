import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SavedBacktestResult } from "./backtestTypes";
import { hasChartEvidence } from "./chartEvidenceStore";

const DIR = () =>
  path.join(/* turbopackIgnore: true */ process.cwd(), "data", "rextora", "backtests");

function ensure(): void {
  fs.mkdirSync(DIR(), { recursive: true });
}

export type IndexRow = {
  id: string;
  strategyId: string;
  createdAt: string;
  totalReturn: number;
  mdd: number;
  resultHash?: string;
};

export function backtestResultHash(
  result: Omit<SavedBacktestResult, "id" | "createdAt">,
): string {
  const symbol =
    result.report.symbol ??
    result.config.symbols?.[0] ??
    "";
  const payload = {
    strategyId: result.report.strategyId,
    paramsHash: result.report.strategyHash,
    symbol: String(symbol).toUpperCase(),
    timeframe: result.report.timeframe,
    fromDate: result.report.fromDate,
    toDate: result.report.toDate,
    fromOpenTime: result.config.fromOpenTime ?? null,
    toOpenTime: result.config.toOpenTime ?? null,
    feeRate: result.config.feeRate,
    slippageRate: result.config.slippageRate,
    fundingRate: result.config.fundingRate,
    costGuardK: result.config.costGuardK,
    engineVersion: result.engineVersion ?? "rextora-backtest-1",
    dataVersion: result.dataVersion ?? result.report.dataSource ?? null,
    totalReturn: result.report.totalReturn,
    mdd: result.report.mdd,
    tradeCount: result.report.tradeCount,
    endingBalance: result.report.endingBalance,
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function readIndex(): IndexRow[] {
  const indexPath = path.join(DIR(), "index.json");
  if (!fs.existsSync(indexPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(indexPath, "utf8")) as IndexRow[];
  } catch {
    return [];
  }
}

function writeIndex(index: IndexRow[]): void {
  fs.writeFileSync(
    path.join(DIR(), "index.json"),
    JSON.stringify(index.slice(0, 200), null, 2),
    "utf8",
  );
}

function findPriorByResultHash(
  index: IndexRow[],
  resultHash: string,
): SavedBacktestResult | null {
  for (const row of index) {
    if (row.resultHash !== resultHash) continue;
    const full = path.join(DIR(), `${row.id}.json`);
    if (!fs.existsSync(full)) continue;
    try {
      return JSON.parse(fs.readFileSync(full, "utf8")) as SavedBacktestResult;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Persist a user Backtest execution.
 *
 * Every call creates a unique backtestRunId / id. Identical resultHash may
 * reuse an immutable prior result artifact reference and chart sidecar ref,
 * but never reuses the execution record itself.
 */
export function saveBacktestResult(
  result: Omit<SavedBacktestResult, "id" | "createdAt">,
): SavedBacktestResult {
  ensure();
  const resultHash = backtestResultHash(result);
  const index = readIndex();
  const prior = findPriorByResultHash(index, resultHash);

  const now = new Date().toISOString();
  const id = `bt_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;

  const deduplicatedResult = Boolean(prior);
  const reusedResultFromRunId = prior?.id ?? null;
  const resultArtifactId =
    prior?.resultArtifactId ?? prior?.id ?? id;

  let chartEvidenceRef: string | null = null;
  let hasChart = Boolean(result.hasChartEvidence);
  if (prior) {
    const priorRef =
      prior.chartEvidenceRef && hasChartEvidence(prior.chartEvidenceRef)
        ? prior.chartEvidenceRef
        : hasChartEvidence(prior.id)
          ? prior.id
          : null;
    if (priorRef) {
      chartEvidenceRef = priorRef;
      hasChart = true;
    }
  }

  const saved: SavedBacktestResult = {
    ...result,
    id,
    backtestRunId: id,
    createdAt: now,
    strategyId: result.strategyId ?? result.report.strategyId,
    strategyHash:
      result.strategyHash ?? result.report.strategyHash ?? undefined,
    sourceType: result.sourceType ?? "user_backtest_run",
    status: result.status ?? "completed",
    requestedAt: result.requestedAt ?? now,
    startedAt: result.startedAt ?? now,
    completedAt: result.completedAt ?? now,
    engineVersion: result.engineVersion ?? "rextora-backtest-1",
    dataVersion: result.dataVersion ?? result.report.dataSource ?? null,
    errorCode: result.errorCode ?? null,
    errorDetail: result.errorDetail ?? null,
    resultHash,
    deduplicatedResult,
    reusedResultFromRunId,
    resultArtifactId,
    chartEvidenceRef,
    hasChartEvidence: hasChart || Boolean(result.hasChartEvidence),
    chartEvidenceSchemaVersion:
      result.chartEvidenceSchemaVersion ?? (hasChart ? 1 : undefined),
  };

  fs.writeFileSync(
    path.join(DIR(), `${saved.id}.json`),
    JSON.stringify(saved, null, 2),
    "utf8",
  );
  index.unshift({
    id: saved.id,
    strategyId: saved.report.strategyId,
    createdAt: saved.createdAt,
    totalReturn: saved.report.totalReturn,
    mdd: saved.report.mdd,
    resultHash,
  });
  writeIndex(index);
  return saved;
}

/** List saved executions newest-first. Does not collapse by resultHash. */
export function listSavedBacktests(limit = 50): SavedBacktestResult[] {
  ensure();
  const index = readIndex();
  const out: SavedBacktestResult[] = [];
  for (const row of index.slice(0, limit * 2)) {
    const full = path.join(DIR(), `${row.id}.json`);
    if (!fs.existsSync(full)) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(full, "utf8")) as SavedBacktestResult);
    } catch {
      continue;
    }
    if (out.length >= limit) break;
  }
  return out;
}

export function getSavedBacktest(id: string): SavedBacktestResult | null {
  const full = path.join(DIR(), `${id}.json`);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, "utf8")) as SavedBacktestResult;
}

/** Latest user Backtest Runs for a strategy (newest first). */
export function listSavedBacktestsForStrategy(
  strategyId: string,
  limit = 30,
  options?: { symbol?: string | null },
): SavedBacktestResult[] {
  const symbol = options?.symbol?.trim().toUpperCase() || null;
  return listSavedBacktests(Math.max(limit * 3, 50))
    .filter((r) => {
      if (
        (r.strategyId ?? r.report.strategyId) !== strategyId ||
        (r.sourceType ?? "user_backtest_run") !== "user_backtest_run"
      ) {
        return false;
      }
      if (!symbol) return true;
      const runSymbol = (
        r.report.symbol ??
        r.config.symbols?.[0] ??
        ""
      ).toUpperCase();
      return runSymbol === symbol;
    })
    .slice(0, limit);
}
