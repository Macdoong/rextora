import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SavedBacktestResult } from "./backtestTypes";

const DIR = () => path.join(/* turbopackIgnore: true */ process.cwd(), "data", "rextora", "backtests");

function ensure(): void {
  fs.mkdirSync(DIR(), { recursive: true });
}

export function backtestResultHash(result: Omit<SavedBacktestResult, "id" | "createdAt">): string {
  const payload = {
    strategyId: result.report.strategyId,
    paramsHash: result.report.strategyHash,
    symbol: result.report.symbol,
    timeframe: result.report.timeframe,
    fromDate: result.report.fromDate,
    toDate: result.report.toDate,
    feeRate: result.config.feeRate,
    slippageRate: result.config.slippageRate,
    costGuardK: result.config.costGuardK,
    totalReturn: result.report.totalReturn,
    mdd: result.report.mdd,
    tradeCount: result.report.tradeCount,
    endingBalance: result.report.endingBalance
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

export function saveBacktestResult(result: Omit<SavedBacktestResult, "id" | "createdAt">): SavedBacktestResult {
  ensure();
  const resultHash = backtestResultHash(result);
  const indexPath = path.join(DIR(), "index.json");
  let index: Array<{
    id: string;
    strategyId: string;
    createdAt: string;
    totalReturn: number;
    mdd: number;
    resultHash?: string;
  }> = [];
  if (fs.existsSync(indexPath)) {
    try {
      index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    } catch {
      index = [];
    }
  }

  const existing = index.find((row) => row.resultHash === resultHash);
  if (existing) {
    const full = path.join(DIR(), `${existing.id}.json`);
    if (fs.existsSync(full)) {
      return JSON.parse(fs.readFileSync(full, "utf8")) as SavedBacktestResult;
    }
  }

  const saved: SavedBacktestResult = {
    ...result,
    id: `bt_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(DIR(), `${saved.id}.json`), JSON.stringify(saved, null, 2), "utf8");
  index.unshift({
    id: saved.id,
    strategyId: saved.report.strategyId,
    createdAt: saved.createdAt,
    totalReturn: saved.report.totalReturn,
    mdd: saved.report.mdd,
    resultHash
  });
  fs.writeFileSync(indexPath, JSON.stringify(index.slice(0, 200), null, 2), "utf8");
  return saved;
}

export function listSavedBacktests(limit = 50): SavedBacktestResult[] {
  ensure();
  const indexPath = path.join(DIR(), "index.json");
  if (!fs.existsSync(indexPath)) return [];
  try {
    const index = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Array<{ id: string }>;
    const out: SavedBacktestResult[] = [];
    const seen = new Set<string>();
    for (const row of index.slice(0, limit * 2)) {
      const full = path.join(DIR(), `${row.id}.json`);
      if (!fs.existsSync(full)) continue;
      const saved = JSON.parse(fs.readFileSync(full, "utf8")) as SavedBacktestResult;
      const hash = backtestResultHash(saved);
      if (seen.has(hash)) continue;
      seen.add(hash);
      out.push(saved);
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function getSavedBacktest(id: string): SavedBacktestResult | null {
  const full = path.join(DIR(), `${id}.json`);
  if (!fs.existsSync(full)) return null;
  return JSON.parse(fs.readFileSync(full, "utf8")) as SavedBacktestResult;
}
