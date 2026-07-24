/**
 * Persisted chart evidence for Backtest Runs.
 * Stored beside the run JSON under data/rextora/backtests/<runId>.chart.json
 * so legacy runs without a sidecar remain readable.
 */

import fs from "node:fs";
import path from "node:path";
import type { OhlcvCandle } from "../data/ohlcvTypes";
import {
  EQUITY_BASIS,
  type EquityBasis,
} from "./equityBasis";

export const CHART_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type ChartEvidenceSource = "persisted" | "legacy_remote_hydrate";

export interface BacktestChartEvidence {
  schemaVersion: typeof CHART_EVIDENCE_SCHEMA_VERSION;
  runId: string;
  symbol: string;
  timeframe: string;
  dataVersion: string | null;
  actualFirstCandleTime: string | null;
  actualLastCandleTime: string | null;
  processedCandleCount: number;
  candles: OhlcvCandle[];
  equityCurve: number[];
  /** Peak-relative drawdown series aligned to equityCurve (fraction, ≤ 0). */
  drawdownCurve: number[];
  chartSamplingApplied: boolean;
  savedAt: string;
  /**
   * Documented equity basis. Engines currently emit trade-exit realized
   * equity only — never fabricate candle-level MTM.
   */
  equityBasis?: EquityBasis;
}

function dir(): string {
  return path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "data",
    "rextora",
    "backtests",
  );
}

export function chartEvidencePath(runId: string): string {
  return path.join(dir(), `${runId}.chart.json`);
}

export function computeDrawdownCurve(equityCurve: number[]): number[] {
  if (!equityCurve.length) return [];
  let peak = equityCurve[0]!;
  return equityCurve.map((eq) => {
    if (eq > peak) peak = eq;
    return peak > 0 ? eq / peak - 1 : 0;
  });
}

export function saveChartEvidence(
  input: Omit<BacktestChartEvidence, "schemaVersion" | "savedAt" | "drawdownCurve"> & {
    drawdownCurve?: number[];
  },
): BacktestChartEvidence {
  fs.mkdirSync(dir(), { recursive: true });
  const evidence: BacktestChartEvidence = {
    schemaVersion: CHART_EVIDENCE_SCHEMA_VERSION,
    runId: input.runId,
    symbol: input.symbol,
    timeframe: input.timeframe,
    dataVersion: input.dataVersion,
    actualFirstCandleTime: input.actualFirstCandleTime,
    actualLastCandleTime: input.actualLastCandleTime,
    processedCandleCount: input.processedCandleCount,
    candles: input.candles,
    equityCurve: input.equityCurve,
    drawdownCurve:
      input.drawdownCurve ?? computeDrawdownCurve(input.equityCurve),
    chartSamplingApplied: input.chartSamplingApplied,
    savedAt: new Date().toISOString(),
    equityBasis: input.equityBasis ?? EQUITY_BASIS,
  };
  fs.writeFileSync(
    chartEvidencePath(input.runId),
    JSON.stringify(evidence),
    "utf8",
  );
  return evidence;
}

export function loadChartEvidence(runId: string): BacktestChartEvidence | null {
  const full = chartEvidencePath(runId);
  if (!fs.existsSync(full)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(full, "utf8")) as BacktestChartEvidence;
    if (!raw || raw.schemaVersion !== CHART_EVIDENCE_SCHEMA_VERSION) return null;
    if (!Array.isArray(raw.candles) || !Array.isArray(raw.equityCurve)) return null;
    return raw;
  } catch {
    return null;
  }
}

/**
 * Prefer the run's own sidecar; fall back to chartEvidenceRef for
 * content-identical reuse across distinct execution ids.
 */
export function resolveChartEvidence(input: {
  runId: string;
  chartEvidenceRef?: string | null;
}): BacktestChartEvidence | null {
  const own = loadChartEvidence(input.runId);
  if (own && own.candles.length > 0) return own;
  if (input.chartEvidenceRef && input.chartEvidenceRef !== input.runId) {
    const shared = loadChartEvidence(input.chartEvidenceRef);
    if (shared && shared.candles.length > 0) return shared;
  }
  return own;
}

export function hasChartEvidence(runId: string): boolean {
  return fs.existsSync(chartEvidencePath(runId));
}
