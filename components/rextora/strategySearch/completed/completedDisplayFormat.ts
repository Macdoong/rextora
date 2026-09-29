import { formatTimeframeCustomerKo } from "../customerTimeframeKo";
import { formatMddAbsPct, formatPct } from "../formatters";

export { formatTimeframeCustomerKo } from "../customerTimeframeKo";

/** Strip symbol/timeframe prefix duplicated in readable strategy names. */
export function strategyDescriptorWithoutMarket(input: {
  readableName: string;
  symbol: string;
  timeframe: string;
}): string {
  let s = input.readableName.trim();
  const sym = input.symbol.trim();
  const tfRaw = input.timeframe.trim();
  const tfKo = formatTimeframeCustomerKo(input.timeframe);
  const prefixes = [
    `${sym} ${tfRaw}`,
    `${sym} · ${tfRaw}`,
    `${sym} ${tfKo}`,
    `${sym}·${tfRaw}`,
    sym,
  ];
  for (const p of prefixes) {
    if (s.toLowerCase().startsWith(p.toLowerCase())) {
      s = s.slice(p.length).replace(/^[·|\s]+/, "").trim();
    }
  }
  s = s.replace(new RegExp(`^${sym}\\s*`, "i"), "").trim();
  s = s.replace(/^[·•|]\s*/, "").trim();
  return s || input.readableName.trim();
}

/** Customer-facing recommendation title — replaces raw timeframe tokens (e.g. 15m → 15분봉). */
export function formatRecommendationCustomerName(input: {
  readableName: string;
  symbol: string;
  timeframe: string;
}): string {
  const sym = input.symbol.trim();
  const tfRaw = input.timeframe.trim();
  const tfKo = formatTimeframeCustomerKo(input.timeframe);
  let name = input.readableName.trim();
  if (!tfRaw || tfKo === tfRaw) return name;

  const pairs: [string, string][] = [
    [`${sym} ${tfRaw}`, `${sym} · ${tfKo}`],
    [`${sym} · ${tfRaw}`, `${sym} · ${tfKo}`],
    [`${sym}·${tfRaw}`, `${sym} · ${tfKo}`],
  ];
  for (const [from, to] of pairs) {
    if (name.includes(from)) {
      name = name.split(from).join(to);
    }
  }
  if (name.includes(tfRaw)) {
    name = name.split(tfRaw).join(tfKo);
  }
  return name;
}

export function formatEvaluationDateKo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

export function formatEvaluationRangeKo(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const a = formatEvaluationDateKo(start);
  const b = formatEvaluationDateKo(end);
  if (!a || !b) return null;
  return `${a} ~ ${b}`;
}

export function formatSignedReturnPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const pct = formatPct(value);
  if (!pct) return "—";
  return value > 0 ? `+${pct}` : pct;
}

export function formatThresholdReturnPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatPct(value) ?? "—";
}

export function formatThresholdMddPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return formatMddAbsPct(value) ?? "—";
}

/** Customer-facing label for the composite candidate compare score on completed UI. */
export const COMPLETED_COMPARE_SCORE_LABEL = "후보 비교 점수";

export function formatCompositeScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(3);
}

/** Customer label for compare rows — never raw strategyFamily id. */
export function buildCustomerCandidateLabel(input: {
  readableName?: string | null;
  displayAlias?: string | null;
  rank: number;
  seenNames: Map<string, number>;
}): string {
  const base = (input.readableName ?? input.displayAlias ?? "").trim();
  if (!base) return `후보 ${input.rank}`;
  const suffix = input.displayAlias?.match(/·\s*([A-Za-z0-9]+)\s*$/)?.[1];
  const count = input.seenNames.get(base) ?? 0;
  input.seenNames.set(base, count + 1);
  if (count === 0) return base.length > 56 ? `${base.slice(0, 53)}…` : base;
  if (suffix) return `${base.length > 40 ? `${base.slice(0, 37)}…` : base} (${suffix})`;
  return `후보 ${input.rank}`;
}
