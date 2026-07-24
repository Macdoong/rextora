/**
 * Strategy ↔ symbol compatibility for Backtest UI / API gates.
 *
 * Verified engine behavior:
 * - safe_params (incl. SAFE): indicators run on supplied OHLCV only → symbol-agnostic
 * - event_sequence: same candle-driven path → symbol-agnostic unless metadata locks
 * - condition_builder: may declare an explicit universe via symbols[]
 *
 * Never invents symbols outside the configured market-data allowlist.
 * Client-safe module — no Node/fs imports.
 */

/** Market-data symbols available for Backtest (configured provider set). */
export const BACKTEST_PROVIDER_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "DOTUSDT",
] as const;

export type SymbolCompatibilityMode =
  | "symbol_agnostic"
  | "multi_symbol"
  | "fixed_symbol";

export interface StrategySymbolCompatibility {
  mode: SymbolCompatibilityMode;
  /** Symbols the user may select (intersection with provider allowlist). */
  allowedSymbols: string[];
  defaultSymbol: string;
  selectorDisabled: boolean;
  reasonKo: string | null;
}

export type StrategySymbolInput = {
  id?: string;
  strategyType?: string | null;
  symbols?: string[] | null;
  definition?: {
    strategyType?: string | null;
    symbols?: string[] | null;
    metadata?: Record<string, string | number | boolean | null> | null;
  } | null;
};

/** Market-data symbols available for Backtest (configured provider set). */
export function configuredBacktestSymbols(
  settingsAllowed?: string[] | null,
): string[] {
  const provider = BACKTEST_PROVIDER_SYMBOLS.map((s) => s.toUpperCase());
  if (!settingsAllowed?.length) return [...provider];
  const allow = new Set(settingsAllowed.map((s) => s.toUpperCase()));
  const filtered = provider.filter((s) => allow.has(s));
  return filtered.length ? filtered : [...provider];
}

function normalizeSymbols(raw: string[] | null | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    const u = String(s ?? "")
      .trim()
      .toUpperCase();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

/**
 * Resolve whether a strategy can switch symbols and which set is legal.
 */
export function resolveStrategySymbolCompatibility(
  strategy: StrategySymbolInput | null | undefined,
  providerSymbols: string[] = configuredBacktestSymbols(),
): StrategySymbolCompatibility {
  const provider = providerSymbols.map((s) => s.toUpperCase());
  const providerSet = new Set(provider);
  const declared = normalizeSymbols(
    strategy?.definition?.symbols ?? strategy?.symbols,
  );
  const kind = String(
    strategy?.definition?.strategyType ?? strategy?.strategyType ?? "safe_params",
  );
  const meta = strategy?.definition?.metadata ?? {};
  const fixedFlag =
    meta.fixedSymbol === true ||
    meta.symbolMode === "fixed" ||
    meta.symbolLocked === true;

  const intersectDeclared = declared.filter((s) => providerSet.has(s));
  const fallbackDefault =
    intersectDeclared[0] ??
    (providerSet.has("BTCUSDT") ? "BTCUSDT" : provider[0] ?? "BTCUSDT");

  if (fixedFlag && (intersectDeclared[0] || declared[0])) {
    const only = (intersectDeclared[0] ?? declared[0]!).toUpperCase();
    if (!providerSet.has(only)) {
      return {
        mode: "fixed_symbol",
        allowedSymbols: [],
        defaultSymbol: only,
        selectorDisabled: true,
        reasonKo: `이 전략은 ${only} 전용입니다. (현재 마켓 데이터에서 사용할 수 없음)`,
      };
    }
    return {
      mode: "fixed_symbol",
      allowedSymbols: [only],
      defaultSymbol: only,
      selectorDisabled: true,
      reasonKo: `이 전략은 ${only} 전용입니다.`,
    };
  }

  // Proven candle-driven engines: agnostic across configured markets.
  if (kind === "safe_params" || kind === "event_sequence" || !kind) {
    return {
      mode: "symbol_agnostic",
      allowedSymbols: provider,
      defaultSymbol: fallbackDefault,
      selectorDisabled: false,
      reasonKo: null,
    };
  }

  // condition_builder / other: respect declared universe when present.
  if (intersectDeclared.length === 1) {
    const only = intersectDeclared[0]!;
    return {
      mode: "fixed_symbol",
      allowedSymbols: [only],
      defaultSymbol: only,
      selectorDisabled: true,
      reasonKo: `이 전략은 ${only} 전용입니다.`,
    };
  }
  if (intersectDeclared.length > 1) {
    return {
      mode: "multi_symbol",
      allowedSymbols: intersectDeclared,
      defaultSymbol: intersectDeclared[0]!,
      selectorDisabled: false,
      reasonKo: null,
    };
  }

  // No usable declared symbols → fall back to provider (still gated).
  return {
    mode: "symbol_agnostic",
    allowedSymbols: provider,
    defaultSymbol: fallbackDefault,
    selectorDisabled: false,
    reasonKo: null,
  };
}

export function isSymbolAllowedForStrategy(
  strategy: StrategySymbolInput | null | undefined,
  symbol: string,
  providerSymbols?: string[],
): boolean {
  const compat = resolveStrategySymbolCompatibility(strategy, providerSymbols);
  const u = symbol.trim().toUpperCase();
  return compat.allowedSymbols.includes(u);
}
