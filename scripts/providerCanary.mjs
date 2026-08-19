/**
 * JS mirror of providerCanary.ts for Node acceptance harnesses.
 */

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

export function isWriteToolId(toolId) {
  return WRITE_TOOLS.has(toolId);
}

export function evaluateStructuredProviderCanary(input) {
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

  const canary = input.canary;
  const writeTools = (canary.toolIds ?? []).filter(isWriteToolId);
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
    writeToolsBlocked;

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
