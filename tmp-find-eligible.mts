import { evaluateBacktestEligibility } from "./src/lib/rextora/backtest/backtestEligibility.ts";
import fs from "fs";
import http from "http";

function post(p: string, body: unknown) {
  return new Promise<any>((res, rej) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: "localhost",
        port: 3000,
        path: p,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (r) => {
        let d = "";
        r.on("data", (c) => (d += c));
        r.on("end", () => {
          try {
            res(JSON.parse(d));
          } catch {
            res(d);
          }
        });
      },
    );
    req.on("error", rej);
    req.write(data);
    req.end();
  });
}

const fromOpenTime = Date.parse("2026-04-28T00:00:00.000Z");
const toOpenTime = Date.parse("2026-07-27T00:00:00.000Z");
const ids = [
  "custom_ms37enaq",
  "custom_ms37ep1a",
  "custom_ms2ls9cv",
  "custom_ms35hp15",
  "custom_ms2h97mt",
  "custom_ms37emft",
  "custom_ms37eoa6",
];

for (const id of ids) {
  const r = await post("/api/rextora/backtest/run", {
    strategyId: id,
    symbols: ["BTCUSDT"],
    fromOpenTime,
    toOpenTime,
    save: true,
    timeframe: "15m",
  });
  const d = r.data;
  if (!d?.report) {
    console.log(id, "FAIL", r);
    continue;
  }
  const months = Object.keys(d.report.monthlyReturns || {}).length;
  const gross = (d.trades || []).reduce(
    (s: number, t: any) => s + (t.grossPnlUsdt || 0),
    0,
  );
  const cost = (d.trades || []).reduce(
    (s: number, t: any) => s + (t.feeCostUsdt || 0) + (t.slippageCostUsdt || 0),
    0,
  );
  const costOfGross = gross > 0 ? cost / gross : 1;
  const el = evaluateBacktestEligibility({
    status: "completed",
    totalReturn: d.report.totalReturn,
    mdd: d.report.mdd,
    tradeCount: d.report.tradeCount,
    winRate: d.report.winRate,
    profitFactor: d.report.profitFactor,
    totalCostPctOfGrossProfit: costOfGross,
    negativeMonths: d.report.negativeMonths,
    monthlyReturnCount: months,
    hasCostStress: !!d.report.costStress,
  });
  console.log(
    JSON.stringify({
      id,
      runId: d.saved?.id,
      trades: d.report.tradeCount,
      ret: d.report.totalReturn,
      mdd: d.report.mdd,
      costOfGross: Number(costOfGross.toFixed(3)),
      months,
      neg: d.report.negativeMonths,
      eligible: el.eligible,
      verdict: el.verdictLabel,
    }),
  );
}
