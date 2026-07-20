import fs from "node:fs";
import path from "node:path";
import type { SavedBacktestResult } from "./backtestTypes";

const DIR = () => path.join(/* turbopackIgnore: true */ process.cwd(), "data", "rextora", "backtests");

function ensure(): void {
  fs.mkdirSync(DIR(), { recursive: true });
}

export function saveBacktestResult(result: Omit<SavedBacktestResult, "id" | "createdAt">): SavedBacktestResult {
  ensure();
  const saved: SavedBacktestResult = {
    ...result,
    id: `bt_${Date.now().toString(36)}`,
    createdAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(DIR(), `${saved.id}.json`), JSON.stringify(saved, null, 2), "utf8");
  const indexPath = path.join(DIR(), "index.json");
  let index: Array<{ id: string; strategyId: string; createdAt: string; totalReturn: number; mdd: number }> = [];
  if (fs.existsSync(indexPath)) {
    try {
      index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    } catch {
      index = [];
    }
  }
  index.unshift({
    id: saved.id,
    strategyId: saved.report.strategyId,
    createdAt: saved.createdAt,
    totalReturn: saved.report.totalReturn,
    mdd: saved.report.mdd
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
    for (const row of index.slice(0, limit)) {
      const full = path.join(DIR(), `${row.id}.json`);
      if (!fs.existsSync(full)) continue;
      out.push(JSON.parse(fs.readFileSync(full, "utf8")) as SavedBacktestResult);
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
