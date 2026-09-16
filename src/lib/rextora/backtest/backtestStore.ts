import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SavedBacktestResult } from "./backtestTypes";
import { hasChartEvidence } from "./chartEvidenceStore";
import {
  COST_ASSUMPTIONS_VERSION,
  hasPersistedCostAssumptions,
  hasPersistedSlippageModelVersion,
} from "./costAssumptions";

import { backtestsRoot } from "../storage/runtimePaths";
import { assertTestStoreIsNotProduction } from "../storage/testStoreGuard";

export const IDENTITY_SCHEMA_LEGACY_ORIGINAL = "legacy_original" as const;
export const IDENTITY_SCHEMA_P3A52 = "p3a52" as const;
export const IDENTITY_SCHEMA_COST_ASSUMPTIONS_V1 =
  "cost_assumptions_v1" as const;

export type BacktestIdentitySchema =
  | typeof IDENTITY_SCHEMA_LEGACY_ORIGINAL
  | typeof IDENTITY_SCHEMA_P3A52
  | typeof IDENTITY_SCHEMA_COST_ASSUMPTIONS_V1;

type IdentitySource = Omit<SavedBacktestResult, "id" | "createdAt">;

function identitySymbol(result: IdentitySource): string {
  return String(
    result.report.symbol ?? result.config.symbols?.[0] ?? "",
  ).toUpperCase();
}

function identityBaseFields(result: IdentitySource) {
  return {
    strategyId: result.report.strategyId,
    paramsHash: result.report.strategyHash,
    symbol: identitySymbol(result),
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
  };
}

function identityOutcomeFields(result: IdentitySource) {
  return {
    totalReturn: result.report.totalReturn,
    mdd: result.report.mdd,
    tradeCount: result.report.tradeCount,
    endingBalance: result.report.endingBalance,
  };
}

export function resolveBacktestIdentitySchema(
  result: IdentitySource,
): BacktestIdentitySchema {
  const assumptions = result.report.costAssumptions;
  if (
    hasPersistedCostAssumptions(result.report) &&
    assumptions?.version === COST_ASSUMPTIONS_VERSION
  ) {
    return IDENTITY_SCHEMA_COST_ASSUMPTIONS_V1;
  }
  if (
    !hasPersistedCostAssumptions(result.report) &&
    !hasPersistedSlippageModelVersion(result.report)
  ) {
    return IDENTITY_SCHEMA_LEGACY_ORIGINAL;
  }
  if (
    !hasPersistedCostAssumptions(result.report) &&
    hasPersistedSlippageModelVersion(result.report)
  ) {
    return IDENTITY_SCHEMA_P3A52;
  }
  return IDENTITY_SCHEMA_COST_ASSUMPTIONS_V1;
}

export function buildLegacyOriginalBacktestIdentity(result: IdentitySource) {
  return {
    ...identityBaseFields(result),
    ...identityOutcomeFields(result),
  };
}

export function buildP3A52BacktestIdentity(result: IdentitySource) {
  return {
    ...identityBaseFields(result),
    slippageModelVersion: result.report.slippageModelVersion,
    ...identityOutcomeFields(result),
  };
}

export function buildCostAssumptionsV1BacktestIdentity(result: IdentitySource) {
  const assumptions = result.report.costAssumptions;
  const stress = (result.report.costStress ?? []).map((row) => ({
    multiplier: row.multiplier,
    feeRate: row.feeRate ?? null,
    slippageRate: row.slippageRate ?? null,
    slippageModelVersion: row.slippageModelVersion ?? null,
    fundingEnabled: row.fundingEnabled ?? null,
    fundingConfiguredRate: row.fundingConfiguredRate ?? null,
    fundingEffectiveRate: row.fundingEffectiveRate ?? null,
    spreadEnabled: row.spreadEnabled ?? null,
    spreadRate: row.spreadRate ?? null,
    costGuardK: row.costGuardK ?? null,
  }));
  return {
    ...identityBaseFields(result),
    ...identityOutcomeFields(result),
    costAssumptions: assumptions
      ? {
          version: assumptions.version,
          fee: {
            configuredRate: assumptions.fee.configuredRate,
            effectiveRate: assumptions.fee.effectiveRate,
            model: assumptions.fee.model,
            unit: assumptions.fee.unit,
            legCount: assumptions.fee.legCount,
          },
          slippage: {
            configuredRate: assumptions.slippage.configuredRate,
            effectiveRate: assumptions.slippage.effectiveRate,
            modelVersion: assumptions.slippage.modelVersion,
            unit: assumptions.slippage.unit,
            legCount: assumptions.slippage.legCount,
          },
          funding: {
            enabled: assumptions.funding.enabled,
            configuredRate: assumptions.funding.configuredRate,
            effectiveRate: assumptions.funding.effectiveRate,
            model: assumptions.funding.model,
            unit: assumptions.funding.unit,
          },
          spread: {
            enabled: assumptions.spread.enabled,
            configuredRate: assumptions.spread.configuredRate,
            effectiveRate: assumptions.spread.effectiveRate,
            model: assumptions.spread.model,
            unit: assumptions.spread.unit,
          },
          costGuard: {
            enabled: assumptions.costGuard.enabled,
            k: assumptions.costGuard.k,
            slippageEstimateModel: assumptions.costGuard.slippageEstimateModel,
          },
        }
      : null,
    primaryCostAssumptions: result.report.primaryCostAssumptions ?? null,
    costStressAssumptions: stress,
    costStressMultipliers: result.config.costStressMultipliers ?? [],
  };
}

const DIR = () => backtestsRoot();

function ensure(): void {
  const dir = DIR();
  if (!fs.existsSync(dir)) {
    assertTestStoreIsNotProduction(dir);
    fs.mkdirSync(dir, { recursive: true });
  }
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
  const schema = resolveBacktestIdentitySchema(result);
  const payload =
    schema === IDENTITY_SCHEMA_COST_ASSUMPTIONS_V1
      ? buildCostAssumptionsV1BacktestIdentity(result)
      : schema === IDENTITY_SCHEMA_P3A52
        ? buildP3A52BacktestIdentity(result)
        : buildLegacyOriginalBacktestIdentity(result);
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
  const indexPath = path.join(DIR(), "index.json");
  assertTestStoreIsNotProduction(indexPath);
  fs.writeFileSync(
    indexPath,
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

  const savedPath = path.join(DIR(), `${saved.id}.json`);
  assertTestStoreIsNotProduction(savedPath);
  fs.writeFileSync(
    savedPath,
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

export function getSavedBacktest(
  id: string,
  options?: { rootDir?: string },
): SavedBacktestResult | null {
  const dir = options?.rootDir ? path.resolve(options.rootDir) : DIR();
  const full = path.join(dir, `${id}.json`);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, "utf8")) as SavedBacktestResult;
}

/**
 * Delete a saved Backtest Run artifact.
 * Does not touch strategies, Paper, Live, or SAFE. Chart sidecar removed when unreferenced.
 */
export function deleteSavedBacktest(id: string): {
  ok: boolean;
  reason?: string;
} {
  ensure();
  if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) {
    return { ok: false, reason: "invalid_id" };
  }
  const full = path.join(DIR(), `${id}.json`);
  assertTestStoreIsNotProduction(full);
  if (!fs.existsSync(full)) return { ok: false, reason: "not_found" };
  try {
    fs.unlinkSync(full);
  } catch {
    return { ok: false, reason: "unlink_failed" };
  }
  const index = readIndex().filter((row) => row.id !== id);
  writeIndex(index);
  const chartPath = path.join(DIR(), `${id}.chart.json`);
  if (fs.existsSync(chartPath)) {
    try {
      fs.unlinkSync(chartPath);
    } catch {
      /* non-fatal */
    }
  }
  return { ok: true };
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
