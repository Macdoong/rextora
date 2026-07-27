import { evaluateBacktestEligibility } from './src/lib/rextora/backtest/backtestEligibility.ts';
import fs from 'fs';
const files = fs.readdirSync('data/rextora/backtests').filter(f => f.startsWith('bt_') && f.endsWith('.json') && !f.includes('chart'));
const eligible = [];
for (const f of files) {
  try {
    const j = JSON.parse(fs.readFileSync('data/rextora/backtests/' + f, 'utf8'));
    const r = j.report || {};
    if (!r || j.status !== 'completed') continue;
    const months = Object.keys(r.monthlyReturns || {}).length;
    const gross = (j.trades || []).reduce((s, t) => s + (t.grossPnlUsdt || 0), 0);
    const cost = (j.trades || []).reduce((s, t) => s + (t.feeCostUsdt || 0) + (t.slippageCostUsdt || 0), 0);
    const costOfGross = gross > 0 ? cost / gross : (gross <= 0 ? 1 : null);
    const el = evaluateBacktestEligibility({
      status: j.status,
      totalReturn: r.totalReturn,
      mdd: r.mdd,
      tradeCount: r.tradeCount ?? (j.trades || []).length,
      winRate: r.winRate,
      profitFactor: r.profitFactor,
      totalCostPctOfGrossProfit: costOfGross,
      negativeMonths: r.negativeMonths,
      monthlyReturnCount: months,
      hasCostStress: !!r.costStress,
    });
    if (el.eligible && j.strategyId !== 'SAFE_v44_i4060') {
      eligible.push({ f, strategyId: j.strategyId, trades: r.tradeCount, ret: r.totalReturn, mdd: r.mdd, costOfGross, months, neg: r.negativeMonths });
    }
  } catch {}
}
console.log('eligible non-SAFE count', eligible.length);
console.log(JSON.stringify(eligible.slice(0, 30), null, 2));
