/**
 * Paper execution symbol contract — SAFE and Pattern share this scope.
 *
 * Explicit strategy.symbols / session.symbol constrain the scan.
 * The global watched universe is a default only when the strategy does not
 * declare symbols. It must never expand an explicit list.
 */

export interface PaperSymbolResolverInput {
  strategy?: {
    symbols?: string[] | null;
    definition?: { symbols?: string[] | null } | null;
  } | null;
  session?: { symbol?: string | null } | null;
  watchedSymbols?: string[] | null;
  allowedSymbols?: string[] | null;
}

export interface PaperSymbolResolverResult {
  symbols: string[];
  source: "strategy" | "session" | "watched_default";
  constrained: boolean;
}

function normalizeList(raw: string[] | null | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const u = String(item ?? "")
      .trim()
      .toUpperCase();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function normalizeOne(raw: string | null | undefined): string | null {
  const u = String(raw ?? "")
    .trim()
    .toUpperCase();
  return u || null;
}

function intersectAllow(
  symbols: string[],
  allowedSymbols?: string[] | null,
): string[] {
  const allowed = normalizeList(allowedSymbols);
  if (allowed.length === 0) return symbols;
  const allow = new Set(allowed);
  return symbols.filter((s) => allow.has(s));
}

/**
 * Canonical Paper scan universe.
 *
 * 1. Non-empty strategy.symbols (or definition.symbols) → only those symbols
 * 2. Else session.symbol → that single symbol
 * 3. Else watchedSymbols default (existing discovery universe)
 * Then intersect with allowedSymbols when that safety list is non-empty.
 */
export function resolvePaperExecutionSymbols(
  input: PaperSymbolResolverInput,
): PaperSymbolResolverResult {
  const strategySymbols = normalizeList(
    input.strategy?.symbols?.length
      ? input.strategy.symbols
      : input.strategy?.definition?.symbols,
  );
  const sessionSymbol = normalizeOne(input.session?.symbol);
  const watched = normalizeList(input.watchedSymbols);

  if (strategySymbols.length > 0) {
    return {
      symbols: intersectAllow(strategySymbols, input.allowedSymbols),
      source: "strategy",
      constrained: true,
    };
  }
  if (sessionSymbol) {
    return {
      symbols: intersectAllow([sessionSymbol], input.allowedSymbols),
      source: "session",
      constrained: true,
    };
  }
  return {
    symbols: intersectAllow(watched, input.allowedSymbols),
    source: "watched_default",
    constrained: false,
  };
}
