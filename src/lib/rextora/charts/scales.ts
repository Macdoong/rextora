export function niceDomain(min: number, max: number, pad = 0.05): [number, number] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (min === max) {
    const d = Math.abs(min) * 0.05 || 1;
    return [min - d, max + d];
  }
  const span = max - min;
  return [min - span * pad, max + span * pad];
}

export function createLinearScale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const dSpan = d1 - d0 || 1;
  const rSpan = r1 - r0;
  const scale = (v: number) => r0 + ((v - d0) / dSpan) * rSpan;
  scale.invert = (px: number) => d0 + ((px - r0) / (rSpan || 1)) * dSpan;
  scale.domain = domain;
  scale.range = range;
  return scale;
}

export function ticks(domain: [number, number], count = 5): number[] {
  const [min, max] = domain;
  if (count <= 1) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function formatAxisNumber(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  if (abs >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

export function formatTimeLabel(ms: number): string {
  if (!Number.isFinite(ms)) return "-";
  const d = new Date(ms);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
