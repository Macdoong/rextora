import {
  createDefaultOperatorFormState,
  normalizeAutoSearchObjective,
  type StrategySearchOperatorFormState,
} from "./formDefaults";

export const OPERATOR_FORM_SESSION_KEY = "rextora.strategySearch.operatorForm.v1";

export type OperatorFormSessionRecord = {
  schemaVersion: 1;
  updatedAt: string;
  form: StrategySearchOperatorFormState;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function loadOperatorFormSession(): StrategySearchOperatorFormState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(OPERATOR_FORM_SESSION_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.schemaVersion !== 1) return null;
    if (!isRecord(parsed.form)) return null;
    const merged = {
      ...createDefaultOperatorFormState(),
      ...(parsed.form as unknown as StrategySearchOperatorFormState),
    };
    merged.autoSearchObjective = normalizeAutoSearchObjective(
      merged.autoSearchObjective,
    );
    return merged;
  } catch {
    return null;
  }
}

export function saveOperatorFormSession(
  form: StrategySearchOperatorFormState,
): void {
  if (typeof window === "undefined") return;
  const record: OperatorFormSessionRecord = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    form,
  };
  try {
    sessionStorage.setItem(OPERATOR_FORM_SESSION_KEY, JSON.stringify(record));
  } catch {
    /* quota / private mode */
  }
}
