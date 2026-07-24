import fs from "node:fs";

const p = "components/rextora/charts/BacktestAnalysisView.tsx";
const src = fs.readFileSync(p, "utf8");
const markerStart =
  '  return (\n    <div className="space-y-4 overflow-x-hidden" data-testid="backtest-analysis"';
const markerEnd = "\nfunction buildCostSeries";
const start = src.indexOf(markerStart);
const end = src.indexOf(markerEnd);
if (start < 0 || end < 0) {
  console.error("markers", start, end);
  process.exit(1);
}
const mid = fs.readFileSync("tmp/analysis-return.tsx.txt", "utf8");
fs.writeFileSync(p, src.slice(0, start) + mid + src.slice(end));
console.log("ok", { start, end, midLen: mid.length });
