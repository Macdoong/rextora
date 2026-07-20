export interface OhlcvCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime?: number;
}

export function candlesFromBinanceKlines(rows: Array<Array<string | number>>): OhlcvCandle[] {
  return rows.map((row) => ({
    openTime: Number(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    closeTime: Number(row[6] ?? row[0])
  }));
}

export function generateSyntheticCandles(count: number, seed = 100, drift = 0.0002): OhlcvCandle[] {
  const candles: OhlcvCandle[] = [];
  let price = seed;
  const start = Date.UTC(2024, 0, 1);
  for (let i = 0; i < count; i += 1) {
    const wave = Math.sin(i / 11) * 0.004 + Math.cos(i / 29) * 0.002;
    const open = price;
    const close = Math.max(0.01, open * (1 + drift + wave + ((i % 7) - 3) * 0.0003));
    const high = Math.max(open, close) * (1 + 0.0015);
    const low = Math.min(open, close) * (1 - 0.0015);
    const volume = 1000 + (i % 20) * 50 + Math.abs(wave) * 20000;
    candles.push({
      openTime: start + i * 15 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume,
      closeTime: start + (i + 1) * 15 * 60 * 1000 - 1
    });
    price = close;
  }
  return candles;
}
