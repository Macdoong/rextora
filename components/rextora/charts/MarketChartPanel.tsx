"use client";

import { Card } from "@/components/ui/primitives";
import { CandlestickChart } from "./CandlestickChart";

export function MarketChartPanel({
  candles,
  sourceLabel = "market data"
}: {
  candles: Array<{ label: string; open: number; high: number; low: number; close: number }>;
  sourceLabel?: string;
}) {
  const points = candles.map((c, i) => ({
    time: i * 3_600_000,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close
  }));
  return (
    <Card title={`시장 요약 · ${sourceLabel}`}>
      <CandlestickChart candles={points} height={220} showVolume={false} />
    </Card>
  );
}
