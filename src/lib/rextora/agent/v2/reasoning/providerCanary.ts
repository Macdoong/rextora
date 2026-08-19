/**
 * Provider verification helpers — HTTP 200 alone is never enough.
 * A provider is verified only after a structured, read-only Agent canary.
 */

export interface ProviderHealthCheck {
  provider: string;
  model?: string;
  configured?: boolean;
  ok?: boolean;
  latencyMs?: number;
  errorKo?: string | null;
}

export interface ProviderCanaryObservation {
  status: number;
  provider: string | null;
  model?: string | null;
  fallbackUsed: boolean | null;
  validationOk: boolean | null;
  toolIds: string[];
  writeToolExecuted?: boolean;
  conclusionKo?: string | null;
  latencyMs?: number | null;
  errorKo?: string | null;
}

export interface ProviderVerificationRecord {
  requestedProvider: string | null;
  selectedProvider: string | null;
  providerAttempted: boolean;
  providerSucceeded: boolean;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  canaryPassed: boolean;
  healthyMarked: boolean;
  checksEmpty: boolean;
  canaryNull: boolean;
  writeToolsBlocked: boolean;
  plannedWriteTools?: string[];
}

const WRITE_TOOLS = new Set([
  "search.create",
  "search.start",
  "search.pause",
  "search.cancel",
  "backtest.run",
  "paper.prepare",
  "paper.approve_start",
  "paper.pause",
  "paper.resume",
  "paper.stop",
  "strategy.rename",
  "strategy.archive",
  "strategy.restore",
  "strategy.delete",
  "results.promote",
]);

export function isWriteToolId(toolId: string): boolean {
  return WRITE_TOOLS.has(toolId);
}

export function evaluateStructuredProviderCanary(input: {
  requestedProvider: string | null;
  healthChecks: ProviderHealthCheck[];
  canary: ProviderCanaryObservation | null;
  forcedProvider?: string | null;
}): ProviderVerificationRecord {
  const checksEmpty = !input.healthChecks?.length;
  const canaryNull = input.canary == null;
  const forced = Boolean(input.forcedProvider?.trim());

  if (forced && canaryNull) {
    return {
      requestedProvider: input.requestedProvider,
      selectedProvider: null,
      providerAttempted: false,
      providerSucceeded: false,
      fallbackUsed: true,
      fallbackReason: "forced_provider_without_canary",
      canaryPassed: false,
      healthyMarked: false,
      checksEmpty,
      canaryNull: true,
      writeToolsBlocked: true,
    };
  }

  if (canaryNull) {
    return {
      requestedProvider: input.requestedProvider,
      selectedProvider: null,
      providerAttempted: false,
      providerSucceeded: false,
      fallbackUsed: true,
      fallbackReason: checksEmpty ? "empty_checks_and_null_canary" : "canary_null",
      canaryPassed: false,
      healthyMarked: false,
      checksEmpty,
      canaryNull: true,
      writeToolsBlocked: true,
    };
  }

  const canary = input.canary!;
  const writeTools = (canary.toolIds ?? []).filter(isWriteToolId);
  // Canary must not execute writes. Planned write tools alone are not execution.
  const writeToolsBlocked = canary.writeToolExecuted !== true;
  const httpOk = canary.status >= 200 && canary.status < 300;
  const providerMatched =
    Boolean(canary.provider) &&
    Boolean(input.requestedProvider) &&
    canary.provider === input.requestedProvider;
  const structuredOk =
    httpOk &&
    providerMatched &&
    canary.fallbackUsed === false &&
    canary.validationOk === true &&
    writeToolsBlocked &&
    Boolean(canary.conclusionKo?.trim() || canary.validationOk);

  // HTTP 200 with unusable structured output must not verify.
  if (httpOk && (canary.fallbackUsed === true || canary.validationOk !== true || !providerMatched)) {
    return {
      requestedProvider: input.requestedProvider,
      selectedProvider: null,
      providerAttempted: true,
      providerSucceeded: false,
      fallbackUsed: true,
      fallbackReason:
        canary.fallbackUsed === true
          ? "deterministic_fallback"
          : canary.validationOk !== true
            ? "unusable_structured_output"
            : "provider_mismatch",
      canaryPassed: false,
      healthyMarked: false,
      checksEmpty,
      canaryNull: false,
      writeToolsBlocked,
    };
  }

  if (!structuredOk) {
    return {
      requestedProvider: input.requestedProvider,
      selectedProvider: null,
      providerAttempted: true,
      providerSucceeded: false,
      fallbackUsed: true,
      fallbackReason: !writeToolsBlocked
        ? "canary_attempted_write_tools"
        : !httpOk
          ? "canary_http_failed"
          : "canary_failed",
      canaryPassed: false,
      healthyMarked: false,
      checksEmpty,
      canaryNull: false,
      writeToolsBlocked,
    };
  }

  return {
    requestedProvider: input.requestedProvider,
    selectedProvider: canary.provider,
    providerAttempted: true,
    providerSucceeded: true,
    fallbackUsed: false,
    fallbackReason: null,
    canaryPassed: true,
    healthyMarked: true,
    checksEmpty,
    canaryNull: false,
    writeToolsBlocked: true,
    plannedWriteTools: writeTools,
  };
}

export function classifyFallbackReason(input: {
  timedOut?: boolean;
  unusableStructured?: boolean;
  providerMissing?: boolean;
  forcedWithoutCanary?: boolean;
}): string {
  if (input.forcedWithoutCanary) return "forced_provider_without_canary";
  if (input.timedOut) return "provider_timeout";
  if (input.unusableStructured) return "unusable_structured_output";
  if (input.providerMissing) return "provider_missing";
  return "deterministic_fallback";
}

export function listConfiguredProviders(
  healthChecks: ProviderHealthCheck[],
): string[] {
  return Array.from(
    new Set(
      (healthChecks ?? [])
        .filter((check) => check.configured === true)
        .map((check) => check.provider)
        .filter(Boolean),
    ),
  );
}

export function pickVerifiedProviderAttempt(
  attempts: Array<{
    requestedProvider: string;
    verification: ProviderVerificationRecord;
  }>,
): {
  selected: ProviderVerificationRecord | null;
  attempts: Array<{
    requestedProvider: string;
    verification: ProviderVerificationRecord;
  }>;
} {
  for (const attempt of attempts) {
    if (
      attempt.verification.canaryPassed &&
      attempt.verification.providerSucceeded &&
      attempt.verification.fallbackUsed === false
    ) {
      return { selected: attempt.verification, attempts };
    }
  }
  return { selected: null, attempts };
}
