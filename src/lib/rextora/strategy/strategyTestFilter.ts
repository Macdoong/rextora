import type { StoredStrategy } from "./strategyTypes";

const TEST_NAME_RE = /SAFE_copy_test|테스트복사|^임시전략|custom_test|_copy_test|SAFE_v44_i4060_copy$/i;

/** Confirmed vitest / pollution clone names (not numbered user copies like 「복사본 1」). */
export function isPollutionCloneName(name: string): boolean {
  return (
    TEST_NAME_RE.test(name) ||
    name === "SAFE_v44_i4060_복사본" ||
    name === "SAFE_v44_i4060_copy"
  );
}

export function isTestStrategyRecord(s: StoredStrategy & { testData?: boolean; metadata?: { testData?: boolean } }): boolean {
  if (s.metadata && typeof s.metadata === "object" && s.metadata.testData) return true;
  if (s.testData) return true;
  return isPollutionCloneName(s.name) || TEST_NAME_RE.test(s.id);
}
