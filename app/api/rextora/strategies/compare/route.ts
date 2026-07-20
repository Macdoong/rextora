import { NextResponse } from "next/server";
import { getStrategyById, listStrategies } from "@/src/lib/rextora/strategy/strategyStore";
import { listSavedBacktests } from "@/src/lib/rextora/backtest/backtestStore";
import { equityCurveToSeries, drawdownFromEquity, strategyScatter } from "@/src/lib/rextora/charts/adapters";
import { SERIES_PALETTE } from "@/src/lib/rextora/charts/theme";

/** Compare strategies using only actual saved backtest results. */
export async function POST(request: Request) {
  const body = (await request.json()) as { ids?: string[] };
  const ids = (body.ids ?? []).slice(0, 5);
  if (ids.length < 1) {
    return NextResponse.json({ ok: false, error: "비교할 전략을 선택하세요." }, { status: 400 });
  }

  const saved = listSavedBacktests();
  const rows = ids.map((id, i) => {
    const s = getStrategyById(id);
    const latest = saved.filter((b) => b.config.strategyId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const report = latest?.report;
    return {
      id,
      name: s?.name ?? id,
      locked: s?.locked ?? false,
      sourceStrategyId: (s as { sourceStrategyId?: string | null })?.sourceStrategyId ?? null,
      netReturn: report ? report.totalReturn : null,
      mdd: report ? report.mdd : null,
      winRate: report ? report.winRate : null,
      profitFactor: report ? report.profitFactor : null,
      tradeCount: report ? report.tradeCount : null,
      averageTrade: report ? report.averageTrade : null,
      fee: report ? report.feeTotal : null,
      funding: null as number | null,
      slippage: report ? report.slippageTotal : null,
      monthlyReturns: report?.monthlyReturns ?? null,
      equitySeries: report
        ? equityCurveToSeries(
            [report.startingBalance, report.endingBalance],
            s?.name ?? id
          )
        : null,
      drawdownSeries: report ? drawdownFromEquity([report.startingBalance, report.endingBalance]) : null,
      color: SERIES_PALETTE[i % SERIES_PALETTE.length],
      missingLabel: report ? null : "데이터 없음"
    };
  });

  const scatter = strategyScatter(
    rows
      .filter((r) => r.netReturn != null && r.mdd != null)
      .map((r) => ({
        name: r.name,
        totalReturn: r.netReturn!,
        mdd: r.mdd!,
        trades: r.tradeCount ?? 0
      }))
  );

  return NextResponse.json({
    ok: true,
    data: {
      rows,
      scatter,
      available: listStrategies().map((s) => ({ id: s.id, name: s.name, locked: s.locked }))
    }
  });
}
