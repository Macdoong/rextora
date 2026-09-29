import type { CompletedCandidateCompareRow } from "./completedViewModel";

function readableBaseFromLabel(label: string): string {
  return label.replace(/\s*\([^)]+\)\s*$/, "").trim();
}

function suffixFromAlias(displayAlias: string | null | undefined): string | null {
  if (!displayAlias) return null;
  const m = displayAlias.match(/·\s*([A-Za-z0-9]+)\s*$/);
  return m?.[1] ?? null;
}

function buildDifferentiatorChips(input: {
  tradeCount: number | null;
  iteration: number | null;
  tradeCountsUnique: boolean;
  iterationsUnique: boolean;
}): string[] {
  const chips: string[] = [];
  // Trade count is shown in the row metric grid — omit duplicate chips.
  if (input.iterationsUnique && input.iteration != null) {
    chips.push(`탐색 ${input.iteration}번`);
  }
  return chips.slice(0, 2);
}

export type CompareRowPresentation = CompletedCandidateCompareRow & {
  displayPrimary: string;
  displaySecondary: string | null;
  differentiatorChips: string[];
};

export function finalizeCompareRowPresentation(
  rows: CompletedCandidateCompareRow[],
  meta: Array<{
    readableName?: string | null;
    displayAlias?: string | null;
    iteration?: number | null;
  }>,
): CompareRowPresentation[] {
  const bases = rows.map((r, i) => {
    const fromMeta = (meta[i]?.readableName ?? meta[i]?.displayAlias ?? "").trim();
    return fromMeta || readableBaseFromLabel(r.label);
  });
  const allSameBase =
    bases.length > 1 && bases.every((b) => b && b === bases[0]);
  const tradeCounts = rows.map((r) => r.tradeCount);
  const tradeCountsUnique =
    new Set(tradeCounts.filter((t) => t != null)).size > 1;
  const iterations = meta.map((m) => m.iteration ?? null);
  const iterationsUnique =
    new Set(iterations.filter((t) => t != null)).size > 1;

  return rows.map((row, i) => {
    const base = bases[i] || null;
    const suffix = suffixFromAlias(meta[i]?.displayAlias);
    const chips = buildDifferentiatorChips({
      tradeCount: row.tradeCount,
      iteration: meta[i]?.iteration ?? null,
      tradeCountsUnique,
      iterationsUnique,
    });

    if (allSameBase && base) {
      const primary = row.isRecommended
        ? `후보 ${row.rank} · 추천`
        : `후보 ${row.rank}`;
      return {
        ...row,
        displayPrimary: primary,
        displaySecondary: base.length > 48 ? `${base.slice(0, 45)}…` : base,
        differentiatorChips: chips,
      };
    }

    let primary = row.label;
    if (suffix && !primary.includes(suffix)) {
      chips.unshift(`변형 ${suffix}`);
    }
    return {
      ...row,
      displayPrimary: primary,
      displaySecondary: null,
      differentiatorChips: chips.slice(0, 2),
    };
  });
}
