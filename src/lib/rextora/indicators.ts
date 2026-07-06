export function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i += 1) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

export function atr(highs: number[], lows: number[], closes: number[], period = 14): number {
  if (closes.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

export function volumeSma(volumes: number[], period = 20): number {
  if (volumes.length === 0) return 0;
  const slice = volumes.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

export function momentum(closes: number[], lookback = 5): number {
  if (closes.length <= lookback) return 0;
  const current = closes[closes.length - 1];
  const prev = closes[closes.length - 1 - lookback];
  return prev === 0 ? 0 : Number((((current - prev) / prev) * 100).toFixed(2));
}

export function breakoutStrength(closes: number[], lookback = 20): number {
  if (closes.length < lookback) return 0;
  const slice = closes.slice(-lookback);
  const high = Math.max(...slice);
  const current = closes[closes.length - 1];
  return high === 0 ? 0 : Number((((current - high) / high) * 100).toFixed(2));
}
