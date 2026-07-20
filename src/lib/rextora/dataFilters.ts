export function isTestOnlySymbol(symbol: string): boolean {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) return false;
  if (normalized === "TESTUSDT") return true;
  if (normalized === "WINRATE_TEST_USDT") return true;
  if (normalized.startsWith("TEST")) return true;
  if (normalized.includes("_TEST")) return true;
  return false;
}

export function showTestDataInUi(): boolean {
  return process.env.NODE_ENV === "test" || process.env.REXTORA_SHOW_TEST_DATA === "true";
}

export function showDebugCandidatesInUi(): boolean {
  return process.env.REXTORA_SHOW_DEBUG_CANDIDATES === "true";
}

export function filterUserFacingRecords<T>(records: T[], pickSymbol: (row: T) => string): T[] {
  if (showTestDataInUi()) return records;
  return records.filter((row) => !isTestOnlySymbol(pickSymbol(row)));
}
